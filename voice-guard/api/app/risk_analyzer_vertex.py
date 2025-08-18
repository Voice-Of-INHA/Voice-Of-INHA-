# app/risk_analyzer_vertex.py
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
        print(f"[DEBUG] 펜스 제거 후 파싱 실패: {e}")

    # 3) 마지막 중괄호까지만 다시 한 번 시도(혹시 줄바꿈/공백 문제)
    last = cleaned.rfind("}")
    if last != -1:
        try:
            return json.loads(cleaned[: last + 1])
        except Exception as e:
            print(f"[DEBUG] 마지막 중괄호 기준 재시도 실패: {e}")

    # 4) 더 강력한 JSON 추출 시도
    try:
        # JSON 객체 패턴 찾기
        import re
        json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
        matches = re.findall(json_pattern, cleaned, re.DOTALL)
        if matches:
            for match in matches:
                try:
                    return json.loads(match)
                except:
                    continue
    except Exception as e:
        print(f"[DEBUG] 정규식 JSON 추출 실패: {e}")

    # 5) 부분적 JSON 복구 시도
    try:
        # 필수 필드만 있는 최소 JSON 생성
        partial_json = "{}"
        if '"risk_score"' in cleaned:
            score_match = re.search(r'"risk_score"\s*:\s*(\d+)', cleaned)
            if score_match:
                score = score_match.group(1)
                partial_json = f'{{"risk_score": {score}}}'
        
        if partial_json != "{}":
            return json.loads(partial_json)
    except Exception as e:
        print(f"[DEBUG] 부분적 JSON 복구 실패: {e}")

    raise ValueError("LLM JSON 파싱 실패")

class VertexRiskAnalyzer:
    """기존 클래스명 유지(호출부 변경 없이 교체 가능)"""
    def __init__(self, model_name: str = "gemini-2.5-flash"):
        self.client = _build_client()
        self.model_name = model_name

    @staticmethod
    def _build_user_prompt(
        final_text: str,
        recent_utts: List[str],
        asr_conf: Optional[float] = None,
        snippets: Optional[List[str]] = None,
    ) -> str:
        ctx = "\n".join([f"- {u}" for u in recent_utts[-5:]]) if recent_utts else "(없음)"
        snips = "\n".join([f"{i+1}) {s}" for i, s in enumerate(snippets or [])]) or "(없음)"
        return f"""[최근 문맥(최대 5문장)]
{ctx}

[의심 스니펫]
{snips}

[현재 발화]
"{final_text}"

[메타]
- asr_confidence: {asr_conf if asr_conf is not None else "unknown"}
"""

    def _call_genai_once(self, user_prompt: str) -> str:
        """한 번 호출하고 text를 반환(없으면 '')"""
        print(f"[DEBUG] Google GenAI 호출 시작...")
        print(f"[DEBUG] 프로젝트 ID: {os.getenv('GCP_PROJECT_ID')}")
        print(f"[DEBUG] 위치: {os.getenv('GCP_LOCATION', 'us-central1')}")

        resp = self.client.models.generate_content(
            model=self.model_name,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.0,
                max_output_tokens=1024,  # 512에서 1024로 증가
                # response_mime_type="application/json",  # 구조화된 출력 제거
                # response_schema=RESPONSE_SCHEMA,  # 구조화된 출력 제거
            ),
        )
        response_text = (getattr(resp, "text", "") or "").strip()
        print(f"[DEBUG] GenAI 원본 응답: {repr(response_text)}")
        print(f"[DEBUG] 응답 길이: {len(response_text)}")
        return response_text

    def analyze(
        self,
        final_text: str,
        recent_utts: List[str],
        asr_conf: Optional[float] = None,
        snippets: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        user_prompt = self._build_user_prompt(final_text, recent_utts, asr_conf, snippets)

        # 1차 호출
        try:
            response_text = self._call_genai_once(user_prompt)
        except Exception as e:
            import traceback
            print(f"[ERROR] 1차 호출 예외: {e}")
            print(traceback.format_exc())
            return _default_result(f"LLM 1차 호출 실패: {type(e).__name__}: {e}")

        # 비거나 이상하면 2차 재시도(더 간단한 프롬프트)
        if not response_text or len(response_text) < 10:
            try:
                print("[DEBUG] 응답이 비어 2차 재시도합니다...")
                retry_prompt = f'분석: "{final_text}"\n\nJSON만 출력:\n{{"risk_score":0,"risk_level":"LOW","labels":["의심 없음"],"evidence":[],"reason":"","actions":[]}}'
                response_text = self._call_genai_once(retry_prompt)
            except Exception as e:
                import traceback
                print(f"[ERROR] 2차 재시도 호출 예외: {e}")
                print(traceback.format_exc())
                return _default_result(f"LLM 2차 재시도 실패: {type(e).__name__}: {e}")

        # 여전히 비면 3차 재시도(최소한의 프롬프트)
        if not response_text or len(response_text) < 10:
            try:
                print("[DEBUG] 응답이 비어 3차 재시도합니다...")
                retry_prompt = f'"{final_text}" -> JSON: {{"risk_score":0,"risk_level":"LOW","labels":["의심 없음"],"evidence":[],"reason":"","actions":[]}}'
                response_text = self._call_genai_once(retry_prompt)
            except Exception as e:
                import traceback
                print(f"[ERROR] 3차 재시도 호출 예외: {e}")
                print(traceback.format_exc())
                return _default_result(f"LLM 3차 재시도 실패: {type(e).__name__}: {e}")

        # 여전히 비면 기본값
        if not response_text or len(response_text) < 10:
            return _default_result("LLM 응답이 비어 기본값 사용")

        # JSON 파싱
        try:
            data = _safe_load_json(response_text)
            print(f"[DEBUG] JSON 파싱 성공: {data}")
        except Exception as e:
            import traceback
            print(f"[ERROR] JSON 파싱 실패: {e}")
            print(traceback.format_exc())
            return _default_result(f"LLM JSON 파싱 실패: {type(e).__name__}: {e}")

        # 후처리(스키마 보정)
        score = int(max(0, min(50, int(data.get("risk_score", 0)))))
        level = data.get("risk_level")
        if level not in ["LOW", "MID", "HIGH"]:
            level = "HIGH" if score >= 30 else ("MID" if score >= 15 else "LOW")
        labels = [l for l in data.get("labels", []) if l in SCHEMA_LABELS] or ["의심 없음"]
        evidence = data.get("evidence", [])[:3]
        actions = data.get("actions", [])[:3]
        reason = (data.get("reason", "") or "")[:300]

        # 추가 검증: 점수가 0이 아닌데 라벨이 "의심 없음"이면 조정
        if score > 0 and labels == ["의심 없음"]:
            labels = ["위험 신호 감지"]
        
        # 추가 검증: 점수가 0인데 위험 라벨이 있으면 조정
        if score == 0 and any(l != "의심 없음" for l in labels):
            labels = ["의심 없음"]

        # 디버깅
        print(f"[DEBUG] LLM 원본 데이터: {data}")
        print(f"[DEBUG] 계산된 점수: {score}")
        print(f"[DEBUG] 최종 라벨: {labels}")

        return {
            "risk_score": score,
            "risk_level": level,
            "labels": labels,
            "evidence": evidence,
            "reason": reason,
            "actions": actions,
        }
