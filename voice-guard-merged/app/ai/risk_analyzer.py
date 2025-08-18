# app/ai/risk_analyzer.py
import os
import json
import re
from typing import Any, Dict, List, Optional

# Google Gen AI SDK (Vertex 경유)
from google import genai
from google.genai import types

# 모델이 순수 JSON만 반환하도록 스키마와 MIME 타입 지정
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "risk_score": {"type": "INTEGER"},
        "risk_level": {"type": "STRING"},
        "labels":     {"type": "ARRAY", "items": {"type": "STRING"}},
        "evidence":   {"type": "ARRAY", "items": {"type": "STRING"}},
        "reason":     {"type": "STRING"},
        "actions":    {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["risk_score", "risk_level", "labels", "evidence", "reason", "actions"],
}

SCHEMA_LABELS = [
    "금전요구", "개인정보요구", "정부기관사칭", "원격제어유도", "링크/앱설치", "협박/압박", "의심 없음"
]

SYSTEM_PROMPT = """전화사기 위험도 분석기입니다.

위험 신호:
- 협박/압박: +15점
- 금전요구: +12점  
- 정부기관사칭: +10점
- 개인정보요구: +8점
- 원격제어유도: +8점
- 링크/앱설치유도: +5점

위험도: HIGH(30+), MID(15-29), LOW(14-)

반드시 다음 JSON 형식만 출력하세요. 다른 텍스트는 포함하지 마세요:
{
  "risk_score": 0-50,
  "risk_level": "LOW|MID|HIGH", 
  "labels": ["위험신호"],
  "evidence": ["문장조각"],
  "reason": "판단근거",
  "actions": ["권고사항"]
}"""

def _build_client() -> genai.Client:
    project = os.getenv("GCP_PROJECT_ID")
    location = os.getenv("GCP_LOCATION", "us-central1")
    if not project:
        raise RuntimeError("GCP_PROJECT_ID 환경변수를 설정하세요.")
    # Vertex 경유
    return genai.Client(vertexai=True, project=project, location=location)

def _default_result(reason: str) -> Dict[str, Any]:
    return {
        "risk_score": 0,
        "risk_level": "LOW",
        "labels": ["의심 없음"],
        "evidence": [],
        "reason": reason[:300],
        "actions": ["의심 시 공식 채널로 직접 확인"],
    }

def _strip_code_fences(text: str) -> str:
    """```json ... ``` 또는 ``` ... ```로 감싼 응답에서 순수 JSON만 추출"""
    if not text:
        return text
    s = text.strip()
    if s.startswith("```"):
        # 맨 앞 펜스 제거
        s = re.sub(r"^```(?:json)?\s*", "", s, count=1, flags=re.IGNORECASE)
        # 맨 뒤 펜스 제거
        s = re.sub(r"\s*```$", "", s, count=1)
    # 여분 텍스트가 붙는 경우 마지막 '}'까지만 사용
    last = s.rfind("}")
    if last != -1:
        s = s[: last + 1]
    return s.strip()

def _safe_load_json(text: str) -> Dict[str, Any]:
    """가능하면 그대로, 안되면 펜스 제거 후, 그래도 안되면 기본값"""
    print(f"[DEBUG] JSON 파싱 시도: {repr(text)}")
    if not text:
        raise ValueError("빈 응답")

    # 1) 일단 그대로
    try:
        return json.loads(text)
    except Exception as e:
        print(f"[DEBUG] 직접 JSON 파싱 실패: {e}")

    # 2) 코드펜스 제거 + 끝 '}'까지
    cleaned = _strip_code_fences(text)
    print(f"[DEBUG] 펜스 제거 후 텍스트: {repr(cleaned)}")
    try:
        return json.loads(cleaned)
    except Exception as e:
        print(f"[DEBUG] 펜스 제거 후 JSON 파싱 실패: {e}")

    # 3) 기본값 반환
    return _default_result(f"JSON 파싱 실패: {text[:100]}")

class VertexRiskAnalyzer:
    def __init__(self):
        self.client = _build_client()
        self.model = "gemini-1.5-flash"

    async def analyze_risk(self, text: str) -> Dict[str, Any]:
        """텍스트의 위험도를 분석하여 결과 반환"""
        if not text or not text.strip():
            return _default_result("빈 텍스트")

        try:
            response = self.client.generate_content(
                model=self.model,
                contents=[
                    types.Content(
                        parts=[
                            types.Part.from_text(SYSTEM_PROMPT + f"\n\n분석할 텍스트: {text}")
                        ]
                    )
                ],
                generation_config=types.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=1024,
                    response_mime_type="application/json",
                    response_schema=RESPONSE_SCHEMA,
                ),
            )

            if not response.candidates:
                return _default_result("응답 없음")

            candidate = response.candidates[0]
            if not candidate.content or not candidate.content.parts:
                return _default_result("응답 내용 없음")

            part = candidate.content.parts[0]
            if not hasattr(part, 'text') or not part.text:
                return _default_result("응답 텍스트 없음")

            result = _safe_load_json(part.text)
            return result

        except Exception as e:
            print(f"[ERROR] 위험도 분석 실패: {e}")
            return _default_result(f"분석 오류: {str(e)}")
