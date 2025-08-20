# app/ai/llm_analyzer.py
import os
import json
import time
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from ..services.gcs_transfer import s3_to_gcs, parse_any_s3_url
from google.cloud import speech_v1 as speech
from google import genai
from google.genai import types

from ..config import settings
from ..db import SessionLocal
from ..models.call_log import CallLog
from ..models.call_analysis import CallAnalysis

# ---------------- Logging ----------------
logger = logging.getLogger("voiceofinha.llm_analyzer")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s - %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)

def _log(event: str, **fields):
    try:
        logger.info("%s %s", event, json.dumps(fields, ensure_ascii=False))
    except Exception:
        logger.info("%s %s", event, fields)

# 대용량 JSON을 청크로 나눠 로깅 (기본 8KB)
_LOG_CHUNK = int(os.getenv("VOI_LOG_CHUNK", "8000"))
_LOG_STT_FULL = os.getenv("VOI_LOG_STT_FULL", "1") == "1"
_LOG_LLM_FULL = os.getenv("VOI_LOG_LLM_FULL", "1") == "1"

def _log_big(event: str, payload: Dict[str, Any], chunk_size: int = _LOG_CHUNK):
    try:
        s = json.dumps(payload, ensure_ascii=False)
    except Exception:
        s = str(payload)
    total = len(s)
    parts = (total + chunk_size - 1) // chunk_size
    for i in range(parts):
        seg = s[i*chunk_size:(i+1)*chunk_size]
        logger.info("%s_part_%d/%d %s", event, i+1, parts, seg)

# ---------------- 유틸 ----------------
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

def _guess_encoding_from_uri(gs_uri: str):
    ext = os.path.splitext(urlparse(gs_uri).path)[1].lower()
    if ext in (".webm", ".weba"):
        return speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
    if ext in (".ogg", ".opus"):
        return speech.RecognitionConfig.AudioEncoding.OGG_OPUS
    if ext in (".wav",):
        return speech.RecognitionConfig.AudioEncoding.LINEAR16
    return speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED

# ---------------- Google STT v1 (장문 + 화자 분할) ----------------
def _longrun_diarization_gcs(gs_uri: str, language_code="ko-KR") -> List[Dict[str, Any]]:
    client = speech.SpeechClient()
    diar = speech.SpeakerDiarizationConfig(
        enable_speaker_diarization=True, min_speaker_count=2, max_speaker_count=2
    )
    encoding = _guess_encoding_from_uri(gs_uri)

    # ko-KR은 phone_call 미지원 → 기본 모델 사용
    cfg_kwargs: Dict[str, Any] = dict(
        language_code=language_code,
        enable_automatic_punctuation=True,
        diarization_config=diar,
        model="default",
        audio_channel_count=1,
        enable_separate_recognition_per_channel=False,
    )
    if encoding != speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED:
        cfg_kwargs["encoding"] = encoding

    cfg = speech.RecognitionConfig(**cfg_kwargs)
    op = client.long_running_recognize(config=cfg, audio=speech.RecognitionAudio(uri=gs_uri))
    resp = op.result(timeout=3*60*60)
    if not resp.results:
        return []

    words = resp.results[-1].alternatives[0].words
    tl: List[Dict[str, Any]] = []
    cur_spk, cur_words, cur_start = None, [], None
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

# ---------------- LLM 프롬프트 ----------------
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

# ---------------- 퍼사드 ----------------
class LlmFinalAnalyzer:
    @staticmethod
    def run_full_analysis(call_id: int, s3_url: Optional[str] = None) -> None:
        """
        입력 URL이 gs:// 면 그대로 사용
        s3:// 또는 https://amazonaws.com/... 이면 S3→GCS 복사 후 사용
        진행 단계별 로그 + STT/LLM 전체 결과를 청크 로깅
        """
        t0 = time.time()
        _log("ANALYSIS_START", call_id=call_id, s3_url=s3_url)

        db = SessionLocal()
        try:
            log = db.query(CallLog).filter(CallLog.id == call_id).first()
            if not log and not s3_url:
                raise ValueError("callId not found and s3_url not provided")

            row = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
            if not row:
                row = CallAnalysis(callId=call_id, status="RUNNING", triggeredAt=datetime.utcnow())
                db.add(row); db.commit(); db.refresh(row)

            # 원본 URL 확보
            source_url = (
                s3_url
                or getattr(log, "audioUrl", None)
                or getattr(log, "audioS3Url", None)
                or getattr(row, "audioUrl", None)
                or getattr(row, "audioS3Url", None)
            )
            if not source_url:
                raise ValueError("audio S3 URL not set")

            # GCS URI 준비
            if source_url.startswith("gs://"):
                gs_uri = source_url
                _log("GCS_INPUT", call_id=call_id, gs_uri=gs_uri)
            elif source_url.startswith(("s3://", "http")):
                _, s3_key = parse_any_s3_url(source_url)
                base_name = os.path.basename(s3_key) or f"{call_id}.audio"
                gcs_key = f"calls/{call_id}/{base_name}"
                t_copy = time.time()
                gs_uri = s3_to_gcs(source_url, settings.gcs_bucket, gcs_key)
                _log("S3_TO_GCS_DONE",
                     call_id=call_id, gs_uri=gs_uri, s3_key=s3_key,
                     ms=int((time.time()-t_copy)*1000))
            else:
                raise ValueError(f"Unsupported audio URL: {source_url}")

            row.audioGcsUri = gs_uri
            db.commit()

            # -------- STT --------
            t_stt = time.time()
            _log("STT_START", call_id=call_id, gs_uri=gs_uri)
            timeline = _longrun_diarization_gcs(gs_uri, language_code="ko-KR")
            ms_stt = int((time.time()-t_stt)*1000)

            # STT 요약 + 전체 타임라인/트랜스크립트 로깅
            segs = len(timeline)
            words = sum(len(seg["text"].split()) for seg in timeline)
            _log("STT_DONE", call_id=call_id, ms=ms_stt, segments=segs, approx_words=words)

            if _LOG_STT_FULL:
                _log_big("STT_TIMELINE_FULL", {"call_id": call_id, "timeline": timeline})
                transcript_full = _to_llm_text(timeline)
                _log_big("STT_TRANSCRIPT_FULL", {"call_id": call_id, "transcript": transcript_full})
            else:
                transcript_full = _to_llm_text(timeline)

            # -------- LLM --------
            t_llm = time.time()
            _log("LLM_START", call_id=call_id, transcript_chars=len(transcript_full))
            report = _call_llm_final_report(transcript_full)
            ms_llm = int((time.time()-t_llm)*1000)
            preview = (report.get("summary") or "")[:120] if isinstance(report, dict) else ""
            _log("LLM_DONE", call_id=call_id, ms=ms_llm, summary_preview=preview)

            if _LOG_LLM_FULL:
                _log_big("LLM_REPORT_FULL", {"call_id": call_id, "report": report})

            # -------- 결과 저장 --------
            row.transcript = transcript_full
            row.report = report
            row.summary = (report.get("summary") or "")[:255] if isinstance(report, dict) else None
            types_ = report.get("crime_types") if isinstance(report, dict) else None
            row.crimeType = (types_ or [None])[0] if types_ else None
            row.status = "DONE"
            row.completedAt = datetime.utcnow()
            db.commit()

            _log("ANALYSIS_DONE", call_id=call_id, ms_total=int((time.time()-t0)*1000), status="DONE")

        except Exception as e:
            _log("ANALYSIS_ERROR", call_id=call_id, error=str(e))
            logger.exception("analysis failed: call_id=%s", call_id)
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
        log = db.query(CallLog).filter(CallLog.id == call_id).with_for_update().first()
        if not log or not LlmFinalAnalyzer._ready(log):
            return False

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
            if not log:
                return
            LlmFinalAnalyzer.run_full_analysis(call_id, s3_url=getattr(log, "audioS3Url", None))
        finally:
            db.close()
