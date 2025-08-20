from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, JSON, Text
from ..db import Base

class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)  # PK
    title: Mapped[str] = mapped_column(String(255))                       # 유형/제목
    rounds: Mapped[dict] = mapped_column(JSON)
    guideline: Mapped[str] = mapped_column(Text)# 라운드 리스트 (JSON 배열)
