# app/routers/call_logs.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..schemas.call_log import CallCreate, CallResponse
from ..schemas.analysis import AnalysisDetail
from ..services.call_log_service import create_call, list_calls, get_call
from ..ai.llm_analyzer import LlmFinalAnalyzer
from ..models.call_analysis import CallAnalysis

router = APIRouter(prefix="/api/calls", tags=["calls"])


# ----------------------------------
# Call CRUD
# ----------------------------------
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


# ----------------------------------
# 분석 결과 조회 (AnalysisDetail 재사용)
# ----------------------------------
class AnalysisGetResponse(BaseModel):
    ok: bool
    status: Optional[str] = None
    data: Optional[AnalysisDetail] = None


@router.get("/{call_id}", response_model=AnalysisGetResponse)
def get_analysis(call_id: int, db: Session = Depends(get_db)):
    row = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
    if not row:
        return {"ok": False, "status": None, "data": None}
    return {
        "ok": True,
        "status": row.status,
        "data": AnalysisDetail.model_validate(row, from_attributes=True),
    }


# ----------------------------------
# 통화 종료 후: 분석 시작 (비동기)
# ----------------------------------
@router.post("/{call_id}/analyze")
def analyze_now(
    call_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # 1) 콜 로그 확인
    log = get_call(db, call_id)
    if not log:
        raise HTTPException(404, "not found")

    # 2) 원본 URL 확보 (https S3 / s3:// / gs:// 모두 허용)
    source_url = getattr(log, "audioUrl", None) or getattr(log, "audioS3Url", None)
    if not source_url:
        raise HTTPException(400, "audioUrl missing in DB; upload & save it first")

    # 3) 중복 실행 방지
    ana = db.query(CallAnalysis).filter(CallAnalysis.callId == call_id).first()
    if ana and ana.status in ("RUNNING", "DONE"):
        return {"ok": True, "started": False, "status": ana.status}

    # 4) 분석 실행 (S3→GCS 복사/파싱 등은 llm_analyzer 내부에서 처리)
    background.add_task(LlmFinalAnalyzer.run_full_analysis, call_id, source_url)
    return {"ok": True, "started": True}
