import re, hashlib
from ..config import settings

def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    # 한국 번호 10~11자리 정도만 기대 (엄격검증은 과감히 생략: 실사용시 정교화)
    return digits

def phone_hash(raw: str) -> str:
    norm = normalize_phone(raw)
    return hashlib.sha256((norm + settings.phone_salt).encode()).hexdigest()
