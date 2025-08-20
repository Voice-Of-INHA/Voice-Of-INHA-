from pydantic import BaseModel
from typing import List

# 라운드 하나를 표현하는 스키마
class ScenarioRound(BaseModel):
    round: int
    question: str
    audio_url: str

# 시나리오 목록 조회용 (간단 버전)
class ScenarioBase(BaseModel):
    id: int
    title: str

    class Config:
        orm_mode = True   # SQLAlchemy 모델 → 자동 변환 허용

# 시나리오 상세 조회용 (라운드 포함)
class ScenarioDetail(ScenarioBase):
    rounds: List[ScenarioRound]
    guideline: str
