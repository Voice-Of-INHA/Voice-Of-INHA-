from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Date, DateTime, JSON
from datetime import datetime, date
from ..db import Base

class CallLog(Base):
    __tablename__ = "callLog"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    phoneHash: Mapped[str] = mapped_column(String(64))       # 전화번호는 해시 저장 권장
    callDate: Mapped[date] = mapped_column(Date)             # YYYY-MM-DD
    totalSeconds: Mapped[int] = mapped_column(Integer)       # 총 통화시간(초)
    riskScore: Mapped[int] = mapped_column(Integer)          # 0~100
    fraudType: Mapped[str] = mapped_column(String(40))       # '검찰사칭' 등
    keywords: Mapped[list] = mapped_column(JSON)             # ["계좌이체","원격제어"]
    audioUrl: Mapped[str] = mapped_column(String(255))       # S3 URL
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
