# app/rule_filter.py
import re
from typing import List

_PATTERNS = [
    # 개인정보/계정정보 요구
    (r"(주민등록번호|주민번호|계좌번호|비밀번호|OTP|공인인증|보안카드|일회용\s*번호|인증번호)", "PII/계정정보요구"),
    
    # 금전/자산 이체 요구
    (r"(해외송금|송금요청|입금요청|가상화폐|코인|비트코인|송금|이체|입금|출금|보내|받아|돈|현금|수수료)", "금전/자산이체요구"),
    (r"(\d{1,3}(,\d{3})+|[0-9]+)\s*(원|만원|억|KRW|달러|USD)", "금전/자산이체요구"),
    
    # 정부기관/권위기관 사칭
    (r"(검찰|경찰|지검|금감원|법원|국세청|세무서|수사|압수수색|계좌동결|범죄|처벌|벌금|벌칙)", "권위기관사칭/압박"),
    
    # 협박/압박/위협
    (r"(납치|살해|죽여|죽어|협박|위협|압박|강요|강제|즉시|긴급|지금\s*바로|당장|빨리|서둘러)", "협박/압박/위협"),
    
    # 링크/앱 설치 유도
    (r"(링크|URL|주소|앱설치|다운로드|설치|다운|클릭|접속|이동)", "링크/앱설치유도"),
    
    # 원격제어 유도
    (r"(원격제어|리모트|팀뷰어|애니데스크|화면\s*공유|제어|접속\s*허용)", "원격제어유도"),
]

_COMPILED = [(re.compile(p, re.IGNORECASE), label) for p, label in _PATTERNS]

def rule_hit_labels(text: str) -> List[str]:
    """텍스트에서 위험 신호를 감지하여 라벨 리스트 반환"""
    hits = []
    text = text or ""
    
    for rx, label in _COMPILED:
        if rx.search(text):
            hits.append(label)
    
    return hits

def should_call_llm(text: str) -> bool:
    """LLM 분석이 필요한지 판단 (현재는 항상 True로 설정하여 모든 텍스트 분석)"""
    return True  # 모든 텍스트를 LLM으로 분석

def calculate_rule_score(labels: List[str]) -> int:
    """룰 기반 위험도 점수 계산 (더 현실적인 점수 체계)"""
    score = 0
    for label in labels:
        if "PII/계정정보요구" in label:
            score += 8
        elif "금전/자산이체요구" in label:
            score += 12
        elif "권위기관사칭/압박" in label:
            score += 10
        elif "협박/압박/위협" in label:
            score += 15
        elif "링크/앱설치유도" in label:
            score += 5
        elif "원격제어유도" in label:
            score += 8
    
    return min(score, 50)  # 최대 50점으로 제한
