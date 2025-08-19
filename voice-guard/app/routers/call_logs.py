from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..schemas.call_log import CallCreate, CallResponse
from ..services.call_log_service import create_call, list_calls, get_call
from typing import List

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
    items = list_calls(
        db, phone=phone, q=q, from_date=fromDate, to_date=toDate, order=order
    )
    return [CallResponse.model_validate(it) for it in items]

@router.get("/{call_id}", response_model=CallResponse)
def get_call_api(call_id: int, db: Session = Depends(get_db)):
    row = get_call(db, call_id)
    if not row:
        raise HTTPException(404, "not found")
    return row
