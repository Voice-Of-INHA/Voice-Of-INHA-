from pydantic import BaseModel, Field
from typing import List
from datetime import date
from .common import PageMeta

class CallCreate(BaseModel):
    phone: str
    callDate: date
    totalSeconds: int = Field(ge=0)
    riskScore: int = Field(ge=0, le=100)
    fraudType: str
    keywords: List[str]
    audioUrl: str

class CallResponse(BaseModel):
    id: int
    callDate: date
    totalSeconds: int
    riskScore: int
    fraudType: str
    keywords: List[str]
    audioUrl: str

    class Config:
        from_attributes = True  # ORM -> Pydantic

class CallList(BaseModel):
    meta: PageMeta
    items: List[CallResponse]
