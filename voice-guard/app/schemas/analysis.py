from pydantic import BaseModel
from typing import Any
from datetime import datetime

class AnalysisDetail(BaseModel):
    id: int
    callId: int
    audioGcsUri: str | None = None
    transcript: str | None = None
    report: Any | None = None
    summary: str | None = None
    crimeType: str | None = None
    status: str | None = None
    triggeredAt: datetime | None = None
    completedAt: datetime | None = None
    error: str | None = None
