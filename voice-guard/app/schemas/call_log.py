from pydantic import BaseModel, Field
from typing import List
from datetime import datetime

class CallCreate(BaseModel):
    phone: str
    totalSeconds: int = Field(ge=0)
    riskScore: int = Field(ge=0, le=100)
    fraudType: str
    keywords: List[str]
    audioUrl: str

class CallResponse(BaseModel):
    id: int
    phone: str
    callDate: datetime
    totalSeconds: int
    riskScore: int
    fraudType: str
    keywords: List[str]
    audioUrl: str

    class Config:
        from_attributes = True  # ORM -> Pydantic

