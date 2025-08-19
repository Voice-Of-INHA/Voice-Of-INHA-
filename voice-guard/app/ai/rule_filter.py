# app/rule_filter.py
import re
from typing import List, Dict, Any

_PATTERNS = [
    # 개인정보/계정정보 요구
    (r"(주민등록번호|주민번호|계좌번호|비밀번호|OTP|공인인증|보안카드|일회용\s*번호|인증번호)", "개인정보/계정정보요구"),

    # 금전/자산 이체 요구
    (r"(해외송금|송금요청|입금요청|가상화폐|코인|비트코인|송금|이체|입금|출금|보내|받아|돈|현금|수수료)", "금전/자산이체요구"),
    (r"(\d{1,3}(,\d{3})+|[0-9]+)\s*(원|만원|억|KRW|달러|USD)", "금전/자산이체요구"),

    # 정부기관/권위기관 사칭
    (r"(검찰|경찰|지검|금감원|법원|국세청|세무서|수사|압수수색|계좌동결|범죄|처벌|벌금|벌칙)", "권위기관사칭/압박"),

    # 협박/압박/위협 (직접적인 위협 표현만)
    (r"(납치|살해|죽여|죽어|협박|위협|압박|강요|강제)", "협박/압박/위협"),

    # 링크/앱 설치 유도
    (r"(링크|URL|주소|앱설치|다운로드|설치|다운|클릭|접속|이동)", "링크/앱설치유도"),

    # 원격제어 유도
    (r"(원격제어|리모트|팀뷰어|애니데스크|화면\s*공유|제어|접속\s*허용)", "원격제어유도"),

    # 긴급성/시간 압박 (시간 관련 압박 표현)
    (r"(지금\s*바로|당장|즉시|긴급|서둘러|빨리|시간\s*없어|마감|마지막|기한|데드라인|오늘\s*안에|내일\s*안에)", "긴급성/시간압박"),

    # 보상/혜택 유도
    (r"(보상|혜택|할인|무료|공짜|이벤트|프로모션|특별|한정|마지막\s*기회|기회|돈\s*벌어|수익|이익)", "보상/혜택유도"),

    # 신뢰성 구축
    (r"(공식|정부|국가|대한민국|우리나라|법적|합법|인증|검증|확인|보장|안전|신뢰|믿어|믿음)", "신뢰성구축"),

    # 개인정보 수집
    (r"(이름|전화번호|휴대폰|주소|생년월일|생일|직장|회사|직업|소득|수입|재산|자산|부동산|차량)", "개인정보수집"),

    # 계좌/카드 정보 요구
    (r"(계좌|통장|카드|신용카드|체크카드|카드번호|유효기간|CVC|CVV|비밀번호|PIN|카드사|은행)", "계좌/카드정보요구"),

    # 의심스러운 전화번호/연락처
    (r"(010-\d{4}-\d{4}|02-\d{3,4}-\d{4}|\d{2,3}-\d{3,4}-\d{4}|국제전화|해외전화|무료전화|0800|1577|1588|1666)", "의심스러운연락처"),
]

_COMPILED = [(re.compile(p, re.IGNORECASE), label) for p, label in _PATTERNS]


def rule_hit_labels(text: str) -> List[str]:
    """텍스트에서 위험 신호를 감지하여 라벨 리스트 반환 (중복 제거)"""
    hits = []
    text = text or ""

    for rx, label in _COMPILED:
        if rx.search(text):
            hits.append(label)

    # 중복 제거 (같은 라벨이 여러 번 감지되는 경우)
    return list(set(hits))


def should_call_llm(text: str) -> bool:
    """LLM 분석이 필요한지 판단 (현재는 항상 True로 설정하여 모든 텍스트 분석)"""
    return True  # 모든 텍스트를 LLM으로 분석


def calculate_rule_score(labels: List[str]) -> int:
    """룰 기반 위험도 점수 계산 (100점 총점 체계)"""
    score = 0
    for label in labels:
        if "협박/압박/위협" in label:
            score += 20  # 협박은 위험하지만 다른 것들도 만만치 않음
        elif "금전/자산이체요구" in label:
            score += 18  # 금전적 피해는 매우 위험
        elif "권위기관사칭/압박" in label:
            score += 16  # 신뢰도 악용은 심각
        elif "개인정보/계정정보요구" in label:
            score += 15  # 개인정보 유출 위험
        elif "원격제어유도" in label:
            score += 14  # 시스템 접근은 매우 위험
        elif "계좌/카드정보요구" in label:
            score += 13  # 금융정보 요구는 매우 위험
        elif "링크/앱설치유도" in label:
            score += 12  # 악성코드 설치도 매우 위험
        elif "긴급성/시간압박" in label:
            score += 10  # 시간 압박은 심리적 조작
        elif "개인정보수집" in label:
            score += 9  # 개인정보 수집 시도
        elif "보상/혜택유도" in label:
            score += 8  # 유혹적 보상 제시
        elif "신뢰성구축" in label:
            score += 7  # 신뢰감 조성 시도
        elif "의심스러운연락처" in label:
            score += 6  # 의심스러운 연락처

    return min(score, 100)  # 최대 100점으로 제한


def get_risk_level(score: int) -> str:
    """점수에 따른 위험도 레벨 반환 (100점 체계)"""
    if score >= 60:
        return "HIGH"
    elif score >= 30:
        return "MID"
    else:
        return "LOW"


def analyze_rule_based(text: str) -> Dict[str, Any]:
    """룰 기반 분석을 새로운 형식으로 반환"""
    labels = rule_hit_labels(text)
    score = calculate_rule_score(labels)

    if labels:
        # 가장 높은 점수의 라벨을 fraudType으로 사용
        fraud_type = labels[0] if labels else "의심 없음"

        # 키워드 추출 (감지된 패턴들)
        keywords = []
        for rx, label in _COMPILED:
            if label in labels:
                matches = rx.findall(text)
                if matches:
                    keywords.append(matches[0])

        reason = f"룰 필터에서 {', '.join(labels)} 위험 신호 감지"
        actions = [
            "절대 개인정보나 금전 정보를 알려주지 마세요",
            "해당 기관에 직접 문의하여 사실 여부를 확인하세요",
            "경찰청(112) 또는 금융감독원(1332)에 신고하세요"
        ]
    else:
        fraud_type = "의심 없음"
        keywords = []
        reason = "룰 필터에서 위험 신호 미감지"
        actions = ["의심 시 공식 채널로 직접 확인하세요"]

    return {
        "riskScore": score,
        "fraudType": fraud_type,
        "keywords": keywords[:5],  # 최대 5개까지만
        "reason": reason,
        "actions": actions[:3]  # 최대 3개까지만
    }