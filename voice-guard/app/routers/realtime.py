from fastapi import APIRouter, BackgroundTasks
from ..db import SessionLocal
from ..models.call_log import CallLog
from ..ai.llm_analyzer import LlmFinalAnalyzer

router = APIRouter(prefix="/api/realtime", tags=["realtime"])

@router.post("/risk-update")
def risk_update(callId: int, score: int, background: BackgroundTasks):
    db = SessionLocal()
    try:
        row = db.query(CallLog).filter(CallLog.id == callId).first()
        if not row:
            return {"ok": False, "error": "callId not found"}
        row.riskMax = max(row.riskMax or 0, score)
        db.commit()
        started = LlmFinalAnalyzer.trigger_if_ready(db, background, callId)
        return {"ok": True, "riskMax": row.riskMax, "started": started}
    finally:
        db.close()
