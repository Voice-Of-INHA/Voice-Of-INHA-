# app/risk_analyzer_vertex.py
import os, json, re
from typing import Any, Dict, List, Optional

# Vertex AI SDK (버전별 호환)
try:
    import vertexai
    try:
        from vertexai.generative_models import GenerativeModel
    except Exception:
        from vertexai.preview.generative_models import GenerativeModel
except Exception as e:
    raise RuntimeError(
        "google-cloud-aiplatform 설치 필요: pip install google-cloud-aiplatform"
    ) from e

SCHEMA_LABELS = [
    "금전요구","개인정보요구","정부기관사칭","원격제어유도","링크/앱설치","협박/압박","의심 없음"
]
SYSTEM_PROMPT = """당신은 한국어 전화사기(보이스피싱) 위험도 분석 어시스턴트입니다.

위험 신호 감지 기준:
1. **협박/압박**: 납치, 살해, 죽여, 협박, 위협, 즉시, 긴급 등
2. **금전요구**: 돈, 원, 만원, 억, 송금, 이체, 보내, 받아 등
3. **정부기관사칭**: 검찰, 경찰, 지검, 법원, 국세청 등
4. **개인정보요구**: 주민번호, 계좌번호, 비밀번호, OTP 등
5. **원격제어유도**: 원격, 팀뷰어, 애니데스크, 화면공유 등

점수 가이드:
- 협박/압박: +40점
- 금전요구: +30점  
- 정부기관사칭: +35점
- 개인정보요구: +25점
- 원격제어유도: +25점

위험도 레벨:
- HIGH: 60점 이상 (즉시 차단 권장)
- MID: 35-59점 (주의 필요)
- LOW: 34점 이하 (안전)

아래 형식의 JSON만 반환:
{
  "risk_score": 0-100,
  "risk_level": "LOW|MID|HIGH",
  "labels": ["위험신호1", "위험신호2"],
  "evidence": ["문장조각 1~3개"],
  "reason": "위험도 판단 근거",
  "actions": ["권고사항 1~3개"]
}
"""

def _init_vertex():
    project = os.getenv("GCP_PROJECT_ID")
    location = os.getenv("GCP_LOCATION", "us-central1")
    if not project:
        raise RuntimeError("GCP_PROJECT_ID 환경변수를 설정하세요.")
    vertexai.init(project=project, location=location)

class VertexRiskAnalyzer:
    def __init__(self, model_name: str = "gemini-1.5-flash"):
        _init_vertex()
        self.model = GenerativeModel(model_name)

    @staticmethod
    def _build_user_prompt(
        final_text: str,
        recent_utts: List[str],
        asr_conf: Optional[float] = None,
        snippets: Optional[List[str]] = None
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

    def _parse_json(self, text: str) -> Dict[str, Any]:
        text = (text or "").strip()
        try:
            return json.loads(text)
        except Exception:
            pass
        m = re.search(r"\{[\s\S]*\}\s*$", text)
        if m:
            return json.loads(m.group(0))
        raise ValueError("LLM JSON 파싱 실패")

    def analyze(
        self,
        final_text: str,
        recent_utts: List[str],
        asr_conf: Optional[float] = None,
        snippets: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        user_prompt = self._build_user_prompt(final_text, recent_utts, asr_conf, snippets)
        try:
            resp = self.model.generate_content(
                [{"role":"system","parts":[SYSTEM_PROMPT]},
                 {"role":"user","parts":[user_prompt]}],
                generation_config={"temperature": 0.2, "max_output_tokens": 512},
                safety_settings=[]
            )
            data = self._parse_json(resp.text or "")
        except Exception:
            data = {
                "risk_score": 5, "risk_level": "LOW",
                "labels": ["의심 없음"], "evidence": [],
                "reason": "LLM 호출 실패로 폴백",
                "actions": ["의심 시 공식 채널로 직접 확인"]
            }

        score = int(max(0, min(100, int(data.get("risk_score", 0)))))
        level = data.get("risk_level")
        if level not in ["LOW","MID","HIGH"]:
            level = "HIGH" if score >= 60 else ("MID" if score >= 35 else "LOW")
        labels = [l for l in data.get("labels", []) if l in SCHEMA_LABELS] or ["의심 없음"]
        evidence = data.get("evidence", [])[:3]
        actions = data.get("actions", [])[:3]
        reason = (data.get("reason", "") or "")[:300]

        return {
            "risk_score": score, "risk_level": level,
            "labels": labels, "evidence": evidence,
            "reason": reason, "actions": actions
        }
