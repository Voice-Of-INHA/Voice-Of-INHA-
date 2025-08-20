from sqlalchemy.orm import Session
from ..models.scenario import Scenario

# 시나리오 전체 목록 조회
def get_scenarios(db: Session):
    return db.query(Scenario).all()

# 특정 시나리오 조회
def get_scenario(db: Session, scenario_id: int):
    return db.query(Scenario).filter(Scenario.id == scenario_id).first()
