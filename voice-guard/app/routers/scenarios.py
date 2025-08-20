from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..services import scenario_service
from ..schemas.scenario import ScenarioBase, ScenarioDetail
import random

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])

# 1. 시나리오 목록 조회
@router.get("/", response_model=list[ScenarioBase])
def list_scenarios(db: Session = Depends(get_db)):
    scenarios = scenario_service.get_scenarios(db)
    if not scenarios:
        # 시나리오가 없을 경우 404 에러를 발생시킵니다.
        raise HTTPException(status_code=404, detail="No scenarios found")

    # 목록에서 시나리오를 랜덤으로 선택합니다.
    random_scenario = random.choice(scenarios)

    # 선택된 시나리오를 ScenarioDetail 모델로 변환하여 반환합니다.
    return ScenarioDetail.model_validate(random_scenario, from_attributes=True)

# 2. 특정 시나리오 상세 조회
@router.get("/{scenario_id}", response_model=ScenarioDetail)
def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = scenario_service.get_scenario(db, scenario_id)
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    return ScenarioDetail.model_validate(scenario, from_attributes=True)
