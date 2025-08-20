# app/routers/call_logs.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from urllib.parse import urlparse

from ..config import settings
from ..db import get_db
from ..schemas.call_log import CallCreate, CallResponse
from ..services.call_log_service import create_call, list_calls, get_call
from ..ai.llm_analyzer import LlmFinalAnalyzer
from ..models.call_analysis import CallAnalysis

router = APIRouter(prefix="/api/calls", tags=["calls"])

# ---------------------------
# 📌 Call CRUD
# ---------------------------
@router.post("", response_model=CallResponse)
def create_call_api(body: CallCreate, db: Session = Depends(get_db)):
    return create_call(db, body)


@router.get("", response_model=List[CallResponse])
def list_calls_api(
    db: Session = Depends(get_db),
    phone: str | None = None,
    q: str | None = None,
    fromDate: str | None = None,
    toDate: str | None = None,
    order: str = "desc",
):
    items = list_calls(db, phone=phone, q=q, from_date=fromDate, to_date=toDate, order=order)
    return [CallResponse.model_validate(it, from_attributes=True) for it in items]


@router.get("/{call_id}", response_model=CallResponse)
def get_analysis(call_id: int, db: Session = Depends(get_db)):
    row = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
    if not row:
        return {"ok": False, "status": None}
    return {
        "ok": True,
        "status": row.status,
        "data": {
            "summary": row.summary,
            "crimeType": row.crimeType,
            "transcript": row.transcript,
            "report": row.report,
            "audioGcsUri": row.audioGcsUri,
            "error": row.error,
        },
    }

# ---------------------------
# 📌 통화 종료 후: DB에 저장 + 분석 시작
# ---------------------------
class AudioBody(BaseModel):
    s3Url: str  # 권장: s3://bucket/key 형식


@router.post("/{call_id}/analyze")
def analyze_now(
    call_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    row = get_call(db, call_id)
    if not row:
        raise HTTPException(404, "not found")

    s3_url = getattr(row, "audioUrl", None)
    if not s3_url:
        raise HTTPException(400, "audioUrl missing in DB; upload & save it first")

    # 👉 URL 형식에 따라 처리
    if s3_url.startswith("http"):
        try:
            gcs_url = _https_s3_to_gcs_url(s3_url, settings.gcs_bucket)
        except Exception as e:
            raise HTTPException(400, f"Invalid S3 URL: {e}")
    elif s3_url.startswith("s3://"):
        bucket, key = _parse_s3_url(s3_url)
        gcs_url = f"gs://{settings.gcs_bucket}/{key}"
    else:
        raise HTTPException(400, f"Unsupported audioUrl format: {s3_url}")

    # 👉 중복 실행 방지
    ana = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
    if ana and ana.status in ("RUNNING", "DONE"):
        return {"ok": True, "started": False, "status": ana.status}

    # 👉 gcs_url 넘겨서 LLM 분석 실행
    background.add_task(LlmFinalAnalyzer.run_full_analysis, call_id, gcs_url)
    return {"ok": True, "started": True}


# ---------------------------
# 📌 보조 함수
# ---------------------------
def _parse_s3_url(s3_url: str):
    """
    s3://bucket/key 형식 파서
    """
    if not s3_url.startswith("s3://"):
        raise ValueError("s3://bucket/key format required")
    parts = s3_url.replace("s3://", "").split("/", 1)
    if len(parts) != 2:
        raise ValueError("s3://bucket/key format required")
    return parts[0], parts[1]   # bucket, key


def _https_s3_to_gcs_url(s3_https_url: str, gcs_bucket: str) -> str:
    """
    https://... 형태의 S3 URL을 받아서
    GCS 경로(gs://...) 로 변환
    """
    parsed = urlparse(s3_https_url)
    bucket = parsed.netloc.split(".")[0]   # voiceofinha-dev-bucket
    key = parsed.path.lstrip("/")          # records/....

    # TODO: 실제 S3→GCS 복사 로직 추가 필요
    # s3_client.download_file(bucket, key, "/tmp/tempfile")
    # gcs_client.upload_blob(gcs_bucket, "/tmp/tempfile", key)

    return f"gs://{gcs_bucket}/{key}"
