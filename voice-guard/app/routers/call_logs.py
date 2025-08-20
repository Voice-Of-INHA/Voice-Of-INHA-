# app/routers/call_logs.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from ..db import get_db
from ..schemas.call_log import CallCreate, CallResponse
from ..services.call_log_service import create_call, list_calls, get_call

# 추가: 전체 분석 파이프라인
from ..ai.llm_analyzer import LlmFinalAnalyzer
# 추가: 중복 방지용 조회
from ..models.call_analysis import CallAnalysis

router = APIRouter(prefix="/api/calls", tags=["calls"])

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
    return {"ok": True, "status": row.status, "data": {
        "summary": row.summary,
        "crimeType": row.crimeType,
        "transcript": row.transcript,
        "report": row.report,
        "audioGcsUri": row.audioGcsUri,
        "error": row.error,
    }}

# ---------------------------
# ★ 통화 종료 후: S3 URL 전달 + 분석 시작
# ---------------------------
class AudioBody(BaseModel):
    s3Url: str  # 권장: s3://bucket/key 형식

@router.post("/{call_id}/analyze")
def analyze_now(call_id: int, db: Session = Depends(get_db), background: BackgroundTasks | None = None):
    row = get_call(db, call_id)
    if not row:
        raise HTTPException(404, "not found")

    # 2-1) S3 URL 확보: DB에서 읽음
    s3_url = getattr(row, "audioUrl", None)
    if not s3_url:
        raise HTTPException(400, "audioUrl missing in DB; upload & save it first")

    # 2-2) 중복 실행 방지
    ana = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
    if ana and ana.status in ("RUNNING", "DONE"):
        return {"ok": True, "started": False, "status": ana.status}

    # 2-3) 비동기 실행
    if background is not None:
        background.add_task(LlmFinalAnalyzer.run_full_analysis, call_id, s3_url)
        return {"ok": True, "started": True}

    # (동기 환경이라면 직접 호출)
    LlmFinalAnalyzer.run_full_analysis(call_id, s3_url)
    return {"ok": True, "started": True}