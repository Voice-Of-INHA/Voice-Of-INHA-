from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..services import scenario_service
from ..schemas.scenario import ScenarioBase, ScenarioDetail

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])

# 1. 시나리오 목록 조회
@router.get("/", response_model=list[ScenarioBase])
def list_scenarios(db: Session = Depends(get_db)):
    scenarios = scenario_service.get_scenarios(db)
    return [ScenarioBase.model_validate(s, from_attributes=True) for s in scenarios]

# 2. 특정 시나리오 상세 조회
@router.get("/{scenario_id}", response_model=ScenarioDetail)
def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = scenario_service.get_scenario(db, scenario_id)
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    return ScenarioDetail.model_validate(scenario, from_attributes=True)
