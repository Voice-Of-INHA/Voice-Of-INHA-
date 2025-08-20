# app/ai/llm_analyzer.py
import os, json
from datetime import datetime
from typing import Any, Dict, List, Optional

import boto3
from google.cloud import storage
from google.cloud import speech_v1 as speech
from google import genai
from google.genai import types

from ..config import settings
from ..db import SessionLocal
from ..models.call_log import CallLog
from ..models.call_analysis import CallAnalysis   # 1단계에서 만든 분석 테이블

# ---------- 유틸 ----------
def _sec_to_tag(sec: float) -> str:
    m = int(sec // 60); s = sec - 60*m
    return f"{m:02d}:{s:04.1f}"

def _to_llm_text(timeline: List[Dict[str, Any]]) -> str:
    return "\n".join([f"[T={x['t']}][{x['role']}] {x['text']}" for x in timeline])

def _vertex_client():
    proj = os.getenv("GCP_PROJECT_ID") or settings.gcp_project_id
    loc  = os.getenv("GCP_LOCATION") or settings.gcp_location or "us-central1"
    if not proj:
        raise RuntimeError("GCP_PROJECT_ID is required")
    return genai.Client(vertexai=True, project=proj, location=loc)

# ---------- S3 -> GCS ----------
def _parse_s3_url(s3_url: str) -> tuple[str, str]:
    if not s3_url.startswith("s3://"):
        raise ValueError("s3://bucket/key needed")
    _, rest = s3_url.split("://", 1)
    return rest.split("/", 1)[0], rest.split("/", 1)[1]

def _s3_to_gcs(s3_url: str, gcs_bucket: str, gcs_key: str) -> str:
    s3_bucket, s3_key = _parse_s3_url(s3_url)
    s3 = boto3.client("s3")
    storage_client = storage.Client()
    blob = storage_client.bucket(gcs_bucket).blob(gcs_key)
    obj = s3.get_object(Bucket=s3_bucket, Key=s3_key)
    body = obj["Body"]
    with blob.open("wb") as f:
        while True:
            chunk = body.read(8 * 1024 * 1024)
            if not chunk: break
            f.write(chunk)
    return f"gs://{gcs_bucket}/{gcs_key}"

# ---------- Google STT v1 (장문 + 화자 2명) ----------
def _longrun_diarization_gcs(gs_uri: str, language_code="ko-KR") -> List[Dict[str, Any]]:
    client = speech.SpeechClient()
    diar = speech.SpeakerDiarizationConfig(
        enable_speaker_diarization=True, min_speaker_count=2, max_speaker_count=2
    )
    cfg = speech.RecognitionConfig(
        language_code=language_code,
        enable_automatic_punctuation=True,
        diarization_config=diar,
        use_enhanced=True,
        model="phone_call",
        audio_channel_count=1,
        enable_separate_recognition_per_channel=False,
    )
    op = client.long_running_recognize(config=cfg, audio=speech.RecognitionAudio(uri=gs_uri))
    resp = op.result(timeout=3*60*60)
    if not resp.results: return []

    words = resp.results[-1].alternatives[0].words
    tl, cur_spk, cur_words, cur_start = [], None, [], None
    for w in words:
        spk = w.speaker_tag
        st = w.start_time.total_seconds() if w.start_time else 0.0
        if cur_spk != spk:
            if cur_words:
                tl.append({"t": _sec_to_tag(cur_start or 0.0), "spk": cur_spk, "text": " ".join(cur_words)})
            cur_spk, cur_words, cur_start = spk, [], st
        cur_words.append(w.word)
    if cur_words:
        tl.append({"t": _sec_to_tag(cur_start or 0.0), "spk": cur_spk, "text": " ".join(cur_words)})

    for seg in tl:
        seg["role"] = "USER" if seg["spk"] == 1 else "SCAMMER"
    return tl

# ---------- 최종 리포트 프롬프트 + LLM ----------
_FINAL_REPORT_PROMPT = """
당신은 보이스피싱 분석 전문가입니다. 아래 통화 대본(화자 표기 포함)을 근거로 JSON만 출력하세요.
필수:
- risk_score: 0~100 정수
- risk_level: "LOW"|"MEDIUM"|"HIGH"
- crime_types: ["검찰사칭","대출빙자","메신저피싱","원격제어앱 유도","OTP 요구","상품권 요구","계좌이체 유도","협박/납치", ...]
- reasons: 각 유형별 근거(대본 인용 포함)
- red_flags: ≥5개 {name, quote, explanation}
- timeline: 5~10개 {t, event, quote}
- advice: 즉각 조치 체크리스트
- safe_alt: 정상 절차와의 차이
- summary: 한 줄 요약
"""

def _call_llm_final_report(full_text: str) -> Dict[str, Any]:
    client = _vertex_client()
    txt = _FINAL_REPORT_PROMPT + "\n\n[대본]\n" + full_text
    resp = client.models.generate_content(
        model="gemini-2.5-pro",
        contents=txt,
        config=types.GenerateContentConfig(temperature=0.0, max_output_tokens=4096),
    )
    raw = (getattr(resp, "text", "") or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1]
        if raw.endswith("```"): raw = raw[:-3]
    try:
        return json.loads(raw)
    except Exception:
        return {"risk_score": 0, "risk_level": "LOW", "crime_types": [], "summary": ""}

# ---------- 퍼사드 (바로 쓰는 API) ----------
class LlmFinalAnalyzer:
    @staticmethod
    def run_full_analysis(call_id: int, s3_url: Optional[str] = None) -> None:
        """S3→GCS→장문STT→LLM→callAnalysis 저장"""
        db = SessionLocal()
        try:
            log = db.query(CallLog).filter(CallLog.id == call_id).first()
            if not log and not s3_url: raise ValueError("callId not found and s3_url not provided")

            row = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
            if not row:
                row = CallAnalysis(callId=call_id, status="RUNNING", triggeredAt=datetime.utcnow())
                db.add(row); db.commit(); db.refresh(row)

            s3_src = s3_url or getattr(log, "audioS3Url", None) or getattr(row, "audioS3Url", None)
            if not s3_src: raise ValueError("audio S3 URL not set")

            gcs_key = f"calls/{call_id}.audio"
            gs_uri = _s3_to_gcs(s3_src, settings.gcs_bucket, gcs_key)
            row.audioGcsUri = gs_uri
            db.commit()

            timeline = _longrun_diarization_gcs(gs_uri, language_code="ko-KR")
            full_text = _to_llm_text(timeline)

            report = _call_llm_final_report(full_text)
            summary = (report.get("summary") or "")[:255]
            ctype = (report.get("crime_types") or [None])[0]

            row.transcript = full_text
            row.report = report
            row.summary = summary
            row.crimeType = ctype
            row.status = "DONE"
            row.completedAt = datetime.utcnow()
            db.commit()
        except Exception as e:
            row = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
            if row:
                row.status = "FAILED"
                row.error = str(e)[:4000]
                row.retries = (row.retries or 0) + 1
                db.commit()
            raise
        finally:
            db.close()

    @staticmethod
    def _ready(log: CallLog) -> bool:
        thr = settings.risk_threshold or 60
        return (getattr(log, "riskMax", 0) or 0) >= thr and bool(getattr(log, "audioS3Url", None))

    @staticmethod
    def trigger_if_ready(db, background_tasks, call_id: int) -> bool:
        """idempotent: PENDING/FAILED만 RUNNING 전이 후 비동기 실행"""
        log = db.query(CallLog).filter(CallLog.id == call_id).with_for_update().first()
        if not log or not LlmFinalAnalyzer._ready(log): return False

        ana = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
        if not ana:
            ana = CallAnalysis(callId=call_id, status="PENDING")
            db.add(ana); db.commit(); db.refresh(ana)

        if ana.status in (None, "PENDING", "FAILED"):
            ana.status = "RUNNING"
            ana.triggeredAt = datetime.utcnow()
            db.commit()
            background_tasks.add_task(LlmFinalAnalyzer._job, call_id)
            return True
        return False

    @staticmethod
    def _job(call_id: int):
        db = SessionLocal()
        try:
            log = db.query(CallLog).filter(CallLog.id == call_id).first()
            if not log: return
            LlmFinalAnalyzer.run_full_analysis(call_id, s3_url=getattr(log, "audioS3Url", None))
        finally:
            db.close()
