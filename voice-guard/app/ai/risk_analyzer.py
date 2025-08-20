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
    "개인정보/계정정보요구", "금전/자산이체요구", "권위기관사칭/압박", "협박/압박/위협", "링크/앱설치유도", "원격제어유도", 
    "계좌/카드정보요구", "긴급성/시간압박", "개인정보수집", "보상/혜택유도", "신뢰성구축", "의심스러운연락처", "의심 없음"
]

SYSTEM_PROMPT = """전화사기 위험도 분석기입니다.

위험 신호:
- 협박/압박/위협: +20점 (협박은 위험하지만 다른 것들도 만만치 않음)
- 금전/자산이체요구: +18점 (금전적 피해는 매우 위험)
- 권위기관사칭/압박: +16점 (신뢰도 악용은 심각)
- 개인정보/계정정보요구: +15점 (개인정보 유출 위험)
- 원격제어유도: +14점 (시스템 접근은 매우 위험)
- 계좌/카드정보요구: +13점 (금융정보 요구는 매우 위험)
- 링크/앱설치유도: +12점 (악성코드 설치도 매우 위험)
- 긴급성/시간압박: +10점 (시간 압박은 심리적 조작)
- 개인정보수집: +9점 (개인정보 수집 시도)
- 보상/혜택유도: +8점 (유혹적 보상 제시)
- 신뢰성구축: +7점 (신뢰감 조성 시도)
- 의심스러운연락처: +6점 (의심스러운 연락처)

반드시 다음 JSON 형식만 출력하세요. 반드시 형식을 유지해야합니다. 다른 텍스트는 절대 포함하지 마세요:
{
  "riskScore": 0-100,
  "fraudType": "위험신호유형",
  "keywords": ["감지된키워드"],
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
        
        # 시뮬레이션용 프롬프트인지 확인 (더 작은 토큰 수 사용)
        is_simulation = "보이스피싱 대응 훈련" in user_prompt or "시뮬레이션" in user_prompt
        max_tokens = 4096
        
        print(f"[DEBUG] 프롬프트 타입: {'시뮬레이션' if is_simulation else '일반 분석'}")
        print(f"[DEBUG] max_output_tokens: {max_tokens}")

        resp = self.client.models.generate_content(
            model=self.model_name,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.0,
                max_output_tokens=max_tokens,
                # response_mime_type="application/json",  # 구조화된 출력 제거
                # response_schema=RESPONSE_SCHEMA,  # 구조화된 출력 제거
            ),
        )
        
        # 1차: resp.text에서 직접 추출
        response_text = (getattr(resp, "text", "") or "").strip()
        
        # 2차: resp.text가 비어있으면 candidates[].content.parts[].text에서 추출
        if not response_text:
            print(f"[DEBUG] resp.text가 비어있어 candidates에서 추출 시도...")
            chunks = []
            for cand in getattr(resp, "candidates", []) or []:
                print(f"[DEBUG] candidate finish_reason={getattr(cand, 'finish_reason', None)}")
                if getattr(cand, "safety_ratings", None):
                    print(f"[DEBUG] safety_ratings={cand.safety_ratings}")
                content = getattr(cand, "content", None)
                if not content:
                    continue
                for part in getattr(content, "parts", []) or []:
                    if getattr(part, "text", None):
                        chunks.append(part.text)
            response_text = "".join(chunks).strip()
            print(f"[DEBUG] candidates에서 추출된 텍스트: {repr(response_text)}")
        
        # 3차: 여전히 비어있으면 raw response 로깅
        if not response_text:
            print(f"[DEBUG] raw resp: {resp}")
            print(f"[DEBUG] resp 속성들: {dir(resp)}")
        
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
        score = int(max(0, min(100, int(data.get("riskScore", 0)))))
        fraud_type = data.get("fraudType", "의심 없음")
        keywords = data.get("keywords", [])[:5]
        actions = data.get("actions", [])[:3]
        reason = (data.get("reason", "") or "")[:300]

        # 추가 검증: 점수가 0이 아닌데 fraudType이 "의심 없음"이면 조정
        if score > 0 and fraud_type == "의심 없음":
            fraud_type = "위험 신호 감지"
        
        # 추가 검증: 점수가 0인데 위험 fraudType이 있으면 조정
        if score == 0 and fraud_type != "의심 없음":
            fraud_type = "의심 없음"

        # 디버깅
        print(f"[DEBUG] LLM 원본 데이터: {data}")
        print(f"[DEBUG] 계산된 점수: {score}")
        print(f"[DEBUG] 최종 fraudType: {fraud_type}")

        return {
            "riskScore": score,
            "fraudType": fraud_type,
            "keywords": keywords,
            "reason": reason,
            "actions": actions,
        }
