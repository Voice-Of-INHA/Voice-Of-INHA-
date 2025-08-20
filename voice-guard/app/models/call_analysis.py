from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, DateTime, JSON, Text, ForeignKey
from datetime import datetime
from ..db import Base

class CallAnalysis(Base):
    __tablename__ = "callAnalysis"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    callId: Mapped[int] = mapped_column(ForeignKey("callLog.id"), nullable=False)

    audioGcsUri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    crimeType: Mapped[str | None] = mapped_column(String(40), nullable=True)

    status: Mapped[str | None] = mapped_column(String(16), nullable=True)  # PENDING/RUNNING/DONE/FAILED
    triggeredAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    retries: Mapped[int] = mapped_column(Integer, default=0)
