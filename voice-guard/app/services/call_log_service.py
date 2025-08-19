from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.call_log import CallLog
from ..schemas.call_log import CallCreate
from ..utils.security import phone_hash
from ..db import engine
from datetime import datetime, timezone


def create_call(db: Session, body: CallCreate) -> CallLog:
    row = CallLog(
        phoneHash=phone_hash(body.phone),
        callDate=datetime.now(timezone.utc),
        totalSeconds=body.totalSeconds,
        riskScore=body.riskScore,
        fraudType=body.fraudType,
        keywords=body.keywords,
        audioUrl=body.audioUrl
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

def get_call(db: Session, call_id: int) -> CallLog | None:
    return db.query(CallLog).filter(CallLog.id == call_id).first()

def list_calls(
    db: Session,
    phone: str | None = None,
    q: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    order: str = "desc",  # 'asc'|'desc'
):
    query = db.query(CallLog)

    if phone:
        query = query.filter(CallLog.phoneHash == phone_hash(phone))
    if from_date:
        query = query.filter(CallLog.callDate >= from_date)
    if to_date:
        query = query.filter(CallLog.callDate <= to_date)

    if q:
        if engine.dialect.name == "mysql":
            # MySQL 8: JSON 배열에 값이 있으면 경로 반환
            query = query.filter(func.json_search(CallLog.keywords, 'one', q) != None)
        else:
            # SQLite 호환: 문자열 LIKE
            query = query.filter(func.json_extract(CallLog.keywords, '$').like(f'%{q}%'))

    if order == "asc":
        query = query.order_by(CallLog.id.asc())
    else:
        query = query.order_by(CallLog.id.desc())

    # ✅ 전체 결과 반환
    items = query.all()
    return items