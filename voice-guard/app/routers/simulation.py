# app/routers/simulation.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import json
import os
import re

from ..ai import VertexRiskAnalyzer


# 시뮬레이션 전용 AI 분석기
class SimulationAnalyzer:
    """시뮬레이션 전용 AI 분석기 - 질문 대비 답변 정확성 평가"""

    def __init__(self):
        self.analyzer = VertexRiskAnalyzer()

    def _extract_json(self, text: str) -> str:
        """코드펜스/주석/앞뒤 잡음 제거 후 JSON 본문만 추출"""
        if not text:
            return ""
        # ```json ... ``` 또는 ``` ... ``` 안쪽만
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.S)
        if m:
            return m.group(1)
        # 첫 '{'부터 마지막 '}'까지
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return text[start:end + 1]
        return text.strip()

    def _lenient_json_loads(self, s: str) -> dict:
        """자잘한 포맷 오류를 관용적으로 복구해서 dict로"""
        s = s.strip()
        if not s:
            return {}
        # 단일 따옴표 → 이중 따옴표 (키/문자열에 한함)
        if "'" in s and '"' not in s:
            s = re.sub(r"'", '"', s)
        # 꼬리 콤마 제거
        s = re.sub(r",\s*([}\]])", r"\1", s)
        # 중괄호 균형 맞추기 (간단 보정)
        if s.count("{") > s.count("}"):
            s += "}" * (s.count("{") - s.count("}"))
        try:
            return json.loads(s)
        except Exception:
            return {}

    def analyze_simulation_answer(self, question: str, answer: str, correct_answer: str, wrong_examples: List[str]) -> \
    Dict[str, Any]:
        """시뮬레이션 답변 분석 - 질문 대비 답변 정확성 평가"""

        # 시뮬레이션 전용 프롬프트 (안전성 친화적)
        prompt = f"""
당신은 '보이스피싱 대응 훈련'을 위한 교육용 시뮬레이션 평가기입니다.
개인정보를 생성하거나 요구하지 말고, 오직 점수 산출과 간단한 이유만 제시하세요.

[시나리오 질문]: {question}
[사용자 답변]: {answer}
[올바른 답변 예시]: {correct_answer}
[잘못된 답변 예시들]: {', '.join(wrong_examples)}

[평가 규칙]
- 올바른 답변과 유사: simulation_score = 10
- 잘못된 답변과 유사: simulation_score = -10
- 그 외: simulation_score = -5
- 반드시 -10, -5, 10 중 하나만 사용.

[반드시 JSON만 출력]
{{
  "simulation_score": -10 | -5 | 10,
  "reason": "최대 60자: 간단한 판단 근거"
}}
"""

        try:
            # LLM 분석 실행
            print(f"[DEBUG] Google GenAI 호출 시작...")
            print(f"[DEBUG] 프롬프트 길이: {len(prompt)}")
            print(f"[DEBUG] 프롬프트 미리보기: {prompt[:200]}...")

            result = self.analyzer.analyze(prompt, [])

            print(f"[DEBUG] LLM 원본 결과: {result}")
            print(f"[DEBUG] LLM 응답 타입: {type(result)}")
            print(f"[DEBUG] LLM 응답 키들: {list(result.keys()) if isinstance(result, dict) else 'Not a dict'}")

            # ⬇⬇ robust 파싱/정규화
            parsed = {}
            if isinstance(result, dict):
                parsed = result
            elif isinstance(result, str):
                body = self._extract_json(result)
                parsed = self._lenient_json_loads(body)
            else:
                parsed = {}

            print(f"[DEBUG] 정규화된 LLM 결과: {parsed}")

            # 시뮬레이션 전용 점수 추출
            simulation_score = 0
            if "simulation_score" in parsed and isinstance(parsed["simulation_score"], (int, float, str)):
                try:
                    simulation_score = int(parsed["simulation_score"])
                    print(f"[DEBUG] LLM에서 simulation_score 추출 성공: {simulation_score}")
                except Exception as e:
                    print(f"[DEBUG] simulation_score 변환 실패: {e}")
                    simulation_score = 0
            else:
                print(f"[DEBUG] LLM에서 simulation_score 키 없음: {list(parsed.keys())}")

            print(f"[DEBUG] 추출된 simulation_score: {simulation_score}")
            print(f"[DEBUG] simulation_score 타입: {type(simulation_score)}")

            # 위험도에 따른 점수 계산 (시뮬레이션 점수 우선)
            if simulation_score == 10:
                risk_level = "LOW"
                score = 10
            elif simulation_score == -5:
                risk_level = "MEDIUM"
                score = -5
            elif simulation_score == -10:
                risk_level = "HIGH"
                score = -10
            else:
                # 시뮬레이션 점수가 없으면 수동으로 판단
                print(f"[DEBUG] 시뮬레이션 점수가 없어 수동 판단 시작")

                # 사용자 답변과 올바른 답변의 유사도 판단
                print(f"[DEBUG] 수동 분석 시작 - 사용자 답변: '{answer}'")
                print(f"[DEBUG] 수동 분석 시작 - 올바른 답변: '{correct_answer}'")
                print(f"[DEBUG] 수동 분석 시작 - 잘못된 예시들: {wrong_examples}")

                if self._is_similar_to_correct(answer, correct_answer):
                    print(f"[DEBUG] 수동 분석 결과: 올바른 답변과 유사함 → LOW")
                    risk_level = "LOW"
                    score = 10
                    simulation_score = 10
                elif self._is_similar_to_wrong(answer, wrong_examples):
                    print(f"[DEBUG] 수동 분석 결과: 잘못된 답변과 유사함 → HIGH")
                    risk_level = "HIGH"
                    score = -10
                    simulation_score = -10
                else:
                    print(f"[DEBUG] 수동 분석 결과: 중간 정도 → MEDIUM")
                    risk_level = "MEDIUM"
                    score = -5
                    simulation_score = -5

            return {
                "risk": risk_level,
                "score": score,
                "explanation": parsed.get("reason", "분석 결과가 없습니다."),
                "feedback": self._generate_feedback(risk_level, score),
                "simulation_score": simulation_score,
                "correct_answer": correct_answer,
                "wrong_examples": wrong_examples
            }

        except Exception as e:
            print(f"[ERROR] 시뮬레이션 분석 실패: {str(e)}")
            print(f"[DEBUG] LLM 실패로 수동 분석 시작")

            # LLM 실패 시 수동 분석 사용
            manual_result = self._manual_analysis(question, answer, correct_answer, wrong_examples)

            return {
                "risk": manual_result["risk"],
                "score": manual_result["score"],
                "explanation": manual_result["reason"],
                "feedback": manual_result["feedback"],
                "simulation_score": manual_result["score"],  # 수동 분석은 점수만 반환
                "correct_answer": correct_answer,
                "wrong_examples": wrong_examples
            }

    def _is_similar_to_correct(self, user_answer: str, correct_answer: str) -> bool:
        """사용자 답변이 올바른 답변과 유사한지 판단"""
        # 키워드 기반 유사도 판단
        correct_keywords = ["확인", "직접", "방문", "알려드릴 수 없", "거부", "그럴 리 없", "아니", "안", "못"]
        user_lower = user_answer.lower()

        # 부정적 표현이 포함되어 있으면 올바른 답변으로 간주
        for keyword in correct_keywords:
            if keyword in user_lower:
                return True

        # 체포 관련 질문에 대한 부정적 답변은 올바름
        if "체포" in user_answer or "당할" in user_answer:
            return True

        return False

    def _is_similar_to_wrong(self, user_answer: str, wrong_examples: List[str]) -> bool:
        """사용자 답변이 잘못된 예시와 유사한지 판단"""
        import re

        # 계좌번호 패턴 감지 (무조건 HIGH 위험)
        if re.search(r'\d{3,4}[-\s]?\d{3,4}[-\s]?\d{3,4}', user_answer):
            print(f"[DEBUG] 계좌번호 패턴 감지: {user_answer}")
            return True

        # 주민번호 패턴 감지 (무조건 HIGH 위험)
        if re.search(r'\d{6}[-\s]?\d{7}', user_answer):
            print(f"[DEBUG] 주민번호 패턴 감지: {user_answer}")
            return True

        # 개인정보 제공 관련 키워드
        wrong_keywords = ["계좌", "카드", "주민", "신분증", "송금", "입금", "결제", "번호", "네", "알려드리", "보내드리"]
        user_lower = user_answer.lower()

        # 긍정적 응답은 잘못된 답변
        if any(word in user_lower for word in ["네", "알려드리", "보내드리", "하겠습니다"]):
            return True

        for keyword in wrong_keywords:
            if keyword in user_lower:
                return True
        return False

    def _manual_analysis(self, question: str, answer: str, correct_answer: str, wrong_examples: List[str]) -> Dict[
        str, Any]:
        """LLM 실패 시 수동 분석"""
        print(f"[DEBUG] 수동 분석 시작: {answer}")

        # 개인정보 직접 제공 시 무조건 HIGH 위험
        import re
        if re.search(r'\d{3,4}[-\s]?\d{3,4}[-\s]?\d{3,4}', answer) or re.search(r'\d{6}[-\s]?\d{7}', answer):
            return {
                "risk": "HIGH",
                "score": -10,
                "reason": "개인정보를 직접 제공하여 매우 위험합니다.",
                "feedback": "🚨 매우 위험! 개인정보를 절대 알려주면 안 됩니다!"
            }

        # 체포 관련 질문에 대한 특별 처리
        if "체포" in question:
            if self._is_similar_to_correct(answer, correct_answer):
                return {
                    "risk": "LOW",
                    "score": 10,
                    "reason": "체포 협박에 대해 단호하게 거부하는 올바른 대응입니다.",
                    "feedback": "✅ 좋은 대답입니다! 보이스피싱에 대응하는 올바른 방법입니다."
                }
            else:
                return {
                    "risk": "HIGH",
                    "score": -10,
                    "reason": "체포 협박에 대해 적극적으로 대응하지 않아 위험합니다.",
                    "feedback": "⚠️ 매우 위험한 대답입니다! 실제 보이스피싱에 속을 수 있습니다."
                }

        # 일반적인 분석
        if self._is_similar_to_correct(answer, correct_answer):
            return {
                "risk": "LOW",
                "score": 10,
                "reason": "올바른 답변과 유사한 안전한 대응입니다.",
                "feedback": "✅ 좋은 대답입니다! 보이스피싱에 대응하는 올바른 방법입니다."
            }
        elif self._is_similar_to_wrong(answer, wrong_examples):
            return {
                "risk": "HIGH",
                "score": -10,
                "reason": "잘못된 답변과 유사한 위험한 대응입니다.",
                "feedback": "⚠️ 매우 위험한 대답입니다! 실제 보이스피싱에 속을 수 있습니다."
            }
        else:
            return {
                "risk": "MEDIUM",
                "score": -5,
                "reason": "중간 정도의 답변으로, 더 신중한 대응이 필요합니다.",
                "feedback": "⚠️ 주의가 필요한 대답입니다. 더 신중하게 생각해보세요."
            }

    def _generate_feedback(self, risk_level: str, score: int) -> str:
        """위험도에 따른 피드백 생성"""
        if risk_level == "HIGH":
            return "⚠️ 매우 위험한 대답입니다! 실제 보이스피싱에 속을 수 있습니다."
        elif risk_level == "MEDIUM":
            return "⚠️ 주의가 필요한 대답입니다. 더 신중하게 생각해보세요."
        else:
            return "✅ 좋은 대답입니다! 보이스피싱에 대응하는 올바른 방법입니다."


# API 라우터
api_router = APIRouter(prefix="/api", tags=["simulation"])

# 웹 페이지 라우터
web_router = APIRouter(prefix="/simulation", tags=["simulation-web"])


# 시나리오 데이터 구조
class Scenario(BaseModel):
    id: int
    title: str
    description: str
    rounds: List[Dict[str, Any]]


class AnswerRequest(BaseModel):
    scenario_id: int
    question: str
    answer: str


class AnswerResponse(BaseModel):
    risk: str
    score: int
    explanation: str
    feedback: str
    correct_answer: str
    wrong_examples: List[str]


class ResultRequest(BaseModel):
    user_id: str
    scenario_id: int
    risk: str
    score: int


# 미리 정의된 보이스피싱 시나리오
SCENARIOS = {
    1: {
        "id": 1,
        "title": "검찰 사칭 시나리오",
        "description": "검찰청을 사칭하여 개인정보를 요구하는 전형적인 보이스피싱",
        "rounds": [
            {
                "round": 1,
                "question": "여기는 검찰청입니다. 고객님 명의로 범죄 계좌가 발견됐습니다. 계좌번호를 알려주세요.",
                "audio_url": "/static/audio/scene1_round1.mp3",
                "correct_answer": "제가 직접 확인하겠습니다.",
                "wrong_examples": ["네, 제 계좌는 1234-5678-9000입니다", "어떤 계좌인가요?"]
            },
            {
                "round": 2,
                "question": "안전을 위해 주민등록번호도 필요합니다. 지금 불러주세요.",
                "audio_url": "/static/audio/scene1_round2.mp3",
                "correct_answer": "주민번호는 알려드릴 수 없습니다.",
                "wrong_examples": ["900101-1234567입니다", "왜 필요한가요?"]
            },
            {
                "round": 3,
                "question": "즉시 지정 계좌로 송금하지 않으면 체포됩니다.",
                "audio_url": "/static/audio/scene1_round3.mp3",
                "correct_answer": "그럴 리 없습니다. 직접 방문하겠습니다.",
                "wrong_examples": ["송금하겠습니다.", "얼마나 보내야 하나요?"]
            }
        ]
    },
    2: {
        "id": 2,
        "title": "대출 사기 시나리오",
        "description": "대출을 빙자하여 개인정보와 수수료를 요구하는 보이스피싱",
        "rounds": [
            {
                "round": 1,
                "question": "안녕하세요. 대출 심사팀입니다. 1억 대출이 승인되었습니다. 신분증 사본을 보내주세요.",
                "audio_url": "/static/audio/scene2_round1.mp3",
                "correct_answer": "어떤 은행인가요? 직접 방문하겠습니다.",
                "wrong_examples": ["네, 신분증 보내드리겠습니다", "어떻게 보내나요?"]
            },
            {
                "round": 2,
                "question": "대출 수수료 50만원을 먼저 입금해주세요. 급합니다.",
                "audio_url": "/static/audio/scene2_round2.mp3",
                "correct_answer": "수수료는 대출 후에 차감하는 것이 맞습니다.",
                "wrong_examples": ["네, 입금하겠습니다", "어느 계좌로 보내나요?"]
            }
        ]
    },
    3: {
        "id": 3,
        "title": "택배 사기 시나리오",
        "description": "택배를 빙자하여 개인정보와 수수료를 요구하는 보이스피싱",
        "rounds": [
            {
                "round": 1,
                "question": "택배가 도착했습니다. 주소가 불분명해서 개인정보를 확인해야 합니다.",
                "audio_url": "/static/audio/scene3_round1.mp3",
                "correct_answer": "택배사에 직접 문의하겠습니다.",
                "wrong_examples": ["네, 확인해드리겠습니다", "어떤 정보가 필요한가요?"]
            },
            {
                "round": 2,
                "question": "배송비 3만원을 추가로 지불해야 합니다. 카드번호를 알려주세요.",
                "audio_url": "/static/audio/scene3_round2.mp3",
                "correct_answer": "택배는 이미 결제가 완료되었습니다. 확인하겠습니다.",
                "wrong_examples": ["네, 카드번호는 1234-5678-9000-1234입니다", "어떻게 결제하나요?"]
            }
        ]
    }
}


# 웹 페이지 라우터
@web_router.get("/", response_class=HTMLResponse)
async def simulation_index():
    """시뮬레이션 메인 페이지"""
    return HTMLResponse("""
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🎮 보이스피싱 시뮬레이션</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            .container { 
                max-width: 800px; 
                margin: 0 auto; 
                background: white; 
                border-radius: 20px; 
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header { 
                background: linear-gradient(135deg, #ff6b6b, #ee5a24); 
                color: white; 
                padding: 30px; 
                text-align: center;
            }
            .header h1 { font-size: 2.5em; margin-bottom: 10px; }
            .header p { font-size: 1.2em; opacity: 0.9; }

            .content { padding: 30px; }

            .scenario-select { 
                background: #f8f9fa; 
                padding: 20px; 
                border-radius: 15px; 
                margin-bottom: 30px;
            }
            .scenario-select h3 { margin-bottom: 15px; color: #333; }
            select { 
                width: 100%; 
                padding: 15px; 
                border: 2px solid #ddd; 
                border-radius: 10px; 
                font-size: 16px; 
                margin-bottom: 15px;
            }
            .start-btn { 
                background: linear-gradient(135deg, #4CAF50, #45a049); 
                color: white; 
                border: none; 
                padding: 15px 30px; 
                border-radius: 10px; 
                font-size: 18px; 
                cursor: pointer; 
                width: 100%;
                transition: transform 0.2s;
            }
            .start-btn:hover { transform: translateY(-2px); }

            .game-area { 
                display: none; 
                background: #f8f9fa; 
                padding: 20px; 
                border-radius: 15px;
            }
            .question-box { 
                background: white; 
                padding: 20px; 
                border-radius: 10px; 
                margin-bottom: 20px; 
                border-left: 5px solid #007bff;
            }
            .audio-control { 
                background: #007bff; 
                color: white; 
                border: none; 
                padding: 10px 20px; 
                border-radius: 8px; 
                cursor: pointer; 
                margin: 10px 0;
            }
            .answer-input { 
                width: 100%; 
                padding: 15px; 
                border: 2px solid #ddd; 
                border-radius: 10px; 
                font-size: 16px; 
                margin-bottom: 15px;
            }
            .submit-btn { 
                background: linear-gradient(135deg, #007bff, #0056b3); 
                color: white; 
                border: none; 
                padding: 15px 30px; 
                border-radius: 10px; 
                font-size: 16px; 
                cursor: pointer; 
                width: 100%;
            }

            .result-area { 
                display: none; 
                background: white; 
                padding: 20px; 
                border-radius: 10px; 
                margin-top: 20px;
            }
            .risk-high { border-left: 5px solid #dc3545; }
            .risk-medium { border-left: 5px solid #ffc107; }
            .risk-low { border-left: 5px solid #28a745; }

            .progress-bar { 
                background: #e9ecef; 
                height: 10px; 
                border-radius: 5px; 
                margin: 20px 0; 
                overflow: hidden;
            }
            .progress-fill { 
                height: 100%; 
                background: linear-gradient(135deg, #4CAF50, #45a049); 
                transition: width 0.3s ease;
            }

            .hidden { display: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎮 보이스피싱 시뮬레이션</h1>
                <p>AI와 함께 보이스피싱 대응 능력을 훈련하세요!</p>
            </div>

            <div class="content">
                <!-- 시나리오 선택 -->
                <div class="scenario-select">
                    <h3>📚 시나리오 선택하기</h3>
                    <select id="scenarioSelect">
                        <option value="">시나리오를 선택하세요</option>
                    </select>
                    <button class="start-btn" onclick="startScenario()">시작하기 ▶</button>
                </div>

                <!-- 게임 진행 영역 -->
                <div class="game-area" id="gameArea">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>

                    <div class="question-box">
                        <h3>📞 질문</h3>
                        <p id="questionText"></p>
                        <button class="audio-control" onclick="playAudio()">🔊 음성 재생</button>
                    </div>

                    <div class="answer-input-area">
                        <h3>💬 나의 대답</h3>
                        <textarea class="answer-input" id="answerInput" placeholder="여기에 답변을 입력하세요..."></textarea>
                        <button class="submit-btn" onclick="submitAnswer()">전송하기</button>
                    </div>
                </div>

                <!-- 결과 영역 -->
                <div class="result-area" id="resultArea">
                    <h3>📝 결과</h3>
                    <div id="resultContent"></div>
                    <button class="start-btn" onclick="nextRound()" style="margin-top: 20px;">다음 라운드</button>
                </div>
            </div>
        </div>

        <script>
            let currentScenario = null;
            let currentRound = 1;
            let totalRounds = 1;
            let totalScore = 0;

            // 페이지 로드 시 시나리오 목록 가져오기
            window.onload = async function() {
                // 상태 초기화
                resetGameState();

                try {
                    const response = await fetch('/api/scenarios');
                    const data = await response.json();

                    const select = document.getElementById('scenarioSelect');
                    data.scenarios.forEach(scenario => {
                        const option = document.createElement('option');
                        option.value = scenario.id;
                        option.textContent = scenario.title;
                        select.appendChild(option);
                    });
                } catch (error) {
                    console.error('시나리오 로드 실패:', error);
                }
            };

            // 페이지 새로고침 시 상태 초기화
            window.addEventListener('beforeunload', function() {
                resetGameState();
            });

            // 게임 상태 초기화
            function resetGameState() {
                currentScenario = null;
                currentRound = 1;
                totalRounds = 1;
                totalScore = 0;

                // UI 초기화
                document.getElementById('gameArea').style.display = 'none';
                document.getElementById('resultArea').style.display = 'none';
                document.getElementById('scenarioSelect').value = '';
                document.getElementById('answerInput').value = '';
                document.getElementById('progressFill').style.width = '0%';
            }

            // 시나리오 시작
            async function startScenario() {
                const scenarioId = document.getElementById('scenarioSelect').value;
                if (!scenarioId) {
                    alert('시나리오를 선택해주세요.');
                    return;
                }

                try {
                    const response = await fetch(`/api/start/${scenarioId}`);
                    const data = await response.json();

                    currentScenario = data;
                    currentRound = 1;
                    totalRounds = data.total_rounds;
                    totalScore = 0;

                    // 게임 영역 표시
                    document.getElementById('gameArea').style.display = 'block';
                    document.getElementById('resultArea').style.display = 'none';

                    // 첫 번째 라운드 표시
                    await loadRound(scenarioId, 1);

                } catch (error) {
                    console.error('시나리오 시작 실패:', error);
                    alert('시나리오를 시작할 수 없습니다.');
                }
            }

            // 라운드 로드
            async function loadRound(scenarioId, roundNumber) {
                try {
                    const response = await fetch(`/api/round/${scenarioId}/${roundNumber}`);
                    const data = await response.json();

                    document.getElementById('questionText').textContent = data.question;
                    document.getElementById('progressFill').style.width = `${(roundNumber / totalRounds) * 100}%`;

                } catch (error) {
                    console.error('라운드 로드 실패:', error);
                }
            }

            // 음성 재생 (실제 구현에서는 audio_url 사용)
            function playAudio() {
                alert('음성 재생 기능은 실제 오디오 파일이 필요합니다.');
            }

            // 답변 제출
            async function submitAnswer() {
                const answer = document.getElementById('answerInput').value.trim();
                if (!answer) {
                    alert('답변을 입력해주세요.');
                    return;
                }

                try {
                    console.log('답변 제출 시작:', {
                        scenario_id: currentScenario.id,
                        question: document.getElementById('questionText').textContent,
                        answer: answer
                    });

                    const response = await fetch('/api/answer', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            scenario_id: currentScenario.id,
                            question: document.getElementById('questionText').textContent,
                            answer: answer
                        })
                    });

                    console.log('API 응답 상태:', response.status);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const result = await response.json();
                    console.log('API 응답 데이터:', result);

                    // 결과 표시
                    displayResult(result);

                    // 점수 누적 (에러가 아닌 경우에만)
                    if (result.risk !== 'ERROR') {
                        totalScore += result.score;
                    }

                } catch (error) {
                    console.error('답변 평가 실패:', error);

                    // 에러 발생 시 기본 결과 표시
                    const errorResult = {
                        risk: 'ERROR',
                        score: 0,
                        explanation: `API 호출 실패: ${error.message}`,
                        feedback: '⚠️ 시스템 오류가 발생했습니다. 다시 시도해주세요.'
                    };

                    displayResult(errorResult);
                }
            }

            // 결과 표시
            function displayResult(result) {
                const resultArea = document.getElementById('resultArea');
                const resultContent = document.getElementById('resultContent');

                console.log('결과 데이터:', result); // 디버깅용

                // 응답 데이터 검증 및 기본값 설정
                const risk = result.risk || 'UNKNOWN';
                const score = result.score !== undefined ? result.score : 0;
                const explanation = result.explanation || '설명이 없습니다.';
                const feedback = result.feedback || '피드백이 없습니다.';
                const correctAnswer = result.correct_answer || '올바른 답변이 없습니다.';
                const wrongExamples = result.wrong_examples || [];
                const userAnswer = document.getElementById('answerInput').value.trim();

                let riskClass = '';
                if (risk === 'HIGH') riskClass = 'risk-high';
                else if (risk === 'MEDIUM') riskClass = 'risk-medium';
                else if (risk === 'LOW') riskClass = 'risk-low';
                else if (risk === 'ERROR') riskClass = 'risk-high'; // 에러 시 빨간색
                else riskClass = 'risk-medium'; // 기본값

                // 잘못된 예시들을 HTML로 변환
                const wrongExamplesHtml = wrongExamples.map(example => `<li>${example}</li>`).join('');

                resultContent.innerHTML = `
                    <div class="${riskClass}">
                        <h4>📊 분석 결과</h4>

                        <div style="margin-bottom: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 5px solid #2196f3;">
                            <h5 style="color: #1976d2; margin-bottom: 10px;">💬 당신의 답변</h5>
                            <p style="font-size: 18px; font-weight: bold; color: #333;">"${userAnswer}"</p>
                        </div>

                        <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                            <h5 style="color: #333; margin-bottom: 10px;">🎯 위험도 평가</h5>
                            <p><strong>위험도:</strong> <span style="color: ${risk === 'HIGH' ? '#dc3545' : risk === 'MEDIUM' ? '#ffc107' : '#28a745'}; font-weight: bold;">${risk}</span></p>
                            <p><strong>점수:</strong> <span style="color: ${score > 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${score > 0 ? '+' : ''}${score}점</span></p>
                            <p><strong>총점:</strong> <span style="color: #333; font-weight: bold;">${totalScore}점</span></p>
                        </div>

                        <div style="margin-bottom: 20px; padding: 15px; background: #fff3e0; border-radius: 8px; border-left: 5px solid #ff9800;">
                            <h5 style="color: #e65100; margin-bottom: 10px;">❓ 왜 이렇게 평가되었나요?</h5>
                            <p style="color: #333; line-height: 1.6;">${explanation}</p>
                        </div>

                        <div style="margin-bottom: 20px; padding: 15px; background: #e8f5e8; border-radius: 8px; border-left: 5px solid #4caf50;">
                            <h5 style="color: #2e7d32; margin-bottom: 10px;">✅ 올바른 답변 예시</h5>
                            <p style="color: #2e7d32; font-weight: bold; font-size: 16px;">"${correctAnswer}"</p>
                        </div>

                        <div style="margin-bottom: 20px; padding: 15px; background: #ffebee; border-radius: 8px; border-left: 5px solid #f44336;">
                            <h5 style="color: #c62828; margin-bottom: 10px;">❌ 하면 안 되는 답변 예시</h5>
                            <ul style="color: #c62828; margin-left: 20px; line-height: 1.6;">
                                ${wrongExamplesHtml}
                            </ul>
                        </div>

                        <div style="margin-top: 20px; padding: 15px; background: #f3e5f5; border-radius: 8px; border-left: 5px solid #9c27b0;">
                            <h5 style="color: #6a1b9a; margin-bottom: 10px;">💡 피드백</h5>
                            <p style="color: #6a1b9a; font-weight: bold; font-size: 16px;">${feedback}</p>
                        </div>
                    </div>
                `;

                resultArea.style.display = 'block';
                document.getElementById('gameArea').style.display = 'none';
            }

            // 다음 라운드
            async function nextRound() {
                currentRound++;

                if (currentRound > totalRounds) {
                    // 시나리오 완료
                    alert(`시나리오 완료! 최종 점수: ${totalScore}점`);
                    document.getElementById('gameArea').style.display = 'none';
                    document.getElementById('resultArea').style.display = 'none';
                    document.getElementById('scenarioSelect').value = '';
                    return;
                }

                // 다음 라운드 로드
                await loadRound(currentScenario.id, currentRound);

                // 입력 필드 초기화
                document.getElementById('answerInput').value = '';

                // 게임 영역 표시
                document.getElementById('gameArea').style.display = 'block';
                document.getElementById('resultArea').style.display = 'none';
            }
        </script>
    </body>
    </html>
    """)


# API 라우터
@api_router.get("/scenarios")
async def get_scenarios():
    """사용 가능한 시나리오 목록 반환"""
    scenarios = []
    for scenario_id, scenario in SCENARIOS.items():
        scenarios.append({
            "id": scenario["id"],
            "title": scenario["title"],
            "description": scenario["description"]
        })
    return {"scenarios": scenarios}


@api_router.get("/start/{scenario_id}")
async def start_scenario(scenario_id: int):
    """특정 시나리오 시작 - 첫 번째 라운드 정보 제공"""
    if scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다")

    scenario = SCENARIOS[scenario_id]
    first_round = scenario["rounds"][0]

    return {
        "id": scenario_id,
        "title": scenario["title"],
        "current_round": 1,
        "total_rounds": len(scenario["rounds"]),
        "question": first_round["question"],
        "audio_url": first_round["audio_url"]
    }


@api_router.get("/round/{scenario_id}/{round_number}")
async def get_round(scenario_id: int, round_number: int):
    """특정 라운드 정보 제공"""
    if scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다")

    scenario = SCENARIOS[scenario_id]
    if round_number < 1 or round_number > len(scenario["rounds"]):
        raise HTTPException(status_code=404, detail="라운드를 찾을 수 없습니다")

    round_data = scenario["rounds"][round_number - 1]

    return {
        "scenario_id": scenario_id,
        "round": round_number,
        "question": round_data["question"],
        "audio_url": round_data["audio_url"]
    }


@api_router.post("/answer")
async def evaluate_answer(request: AnswerRequest):
    """사용자 답변 평가 - AI가 위험도 판별 + 점수 계산"""
    try:
        print(f"[DEBUG] 답변 평가 시작: scenario_id={request.scenario_id}")
        print(f"[DEBUG] 질문: {request.question}")
        print(f"[DEBUG] 답변: {request.answer}")

        # 현재 시나리오와 라운드 정보 가져오기
        if request.scenario_id not in SCENARIOS:
            raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다")

        scenario = SCENARIOS[request.scenario_id]
        current_round = None

        # 현재 질문에 해당하는 라운드 찾기
        for round_data in scenario["rounds"]:
            if round_data["question"] == request.question:
                current_round = round_data
                break

        if not current_round:
            raise HTTPException(status_code=404, detail="해당 질문의 라운드를 찾을 수 없습니다")

        print(f"[DEBUG] 현재 라운드: {current_round}")

        # 시뮬레이션 전용 AI 분석기 생성
        analyzer = SimulationAnalyzer()

        # 시뮬레이션 분석 실행
        result = analyzer.analyze_simulation_answer(
            request.question,
            request.answer,
            current_round["correct_answer"],
            current_round["wrong_examples"]
        )

        print(f"[DEBUG] 시뮬레이션 분석 결과: {result}")

        # 시뮬레이션 점수에 따른 위험도 및 점수 계산
        simulation_score = result.get("simulation_score", 0)

        if simulation_score == 10:
            risk_level = "LOW"
            score = 10
        elif simulation_score == -5:
            risk_level = "MEDIUM"
            score = -5
        elif simulation_score == -10:
            risk_level = "HIGH"
            score = -10
        else:
            # 기본값
            risk_level = "MEDIUM"
            score = -5

        # 피드백 생성
        if risk_level == "HIGH":
            feedback = "⚠️ 매우 위험한 대답입니다! 실제 보이스피싱에 속을 수 있습니다."
        elif risk_level == "MEDIUM":
            feedback = "⚠️ 주의가 필요한 대답입니다. 더 신중하게 생각해보세요."
        else:
            feedback = "✅ 좋은 대답입니다! 보이스피싱에 대응하는 올바른 방법입니다."

        return AnswerResponse(
            risk=risk_level,
            score=score,
            explanation=result.get("explanation", "분석 결과가 없습니다."),
            feedback=feedback,
            correct_answer=result.get("correct_answer", ""),
            wrong_examples=result.get("wrong_examples", [])
        )

    except Exception as e:
        print(f"[ERROR] 답변 평가 실패: {str(e)}")
        import traceback
        print(f"[ERROR] 상세 에러: {traceback.format_exc()}")

        # 에러 발생 시 기본 응답 반환
        return AnswerResponse(
            risk="ERROR",
            score=0,
            explanation=f"AI 분석 중 오류가 발생했습니다: {str(e)}",
            feedback="⚠️ 시스템 오류가 발생했습니다. 다시 시도해주세요.",
            correct_answer="",
            wrong_examples=[]
        )


@api_router.post("/result")
async def save_result(request: ResultRequest):
    """시뮬레이션 결과 저장 (선택사항)"""
    # 실제 구현에서는 데이터베이스에 저장
    # 현재는 메모리에 임시 저장
    return {
        "status": "success",
        "message": "결과가 저장되었습니다.",
        "data": {
            "user_id": request.user_id,
            "scenario_id": request.scenario_id,
            "risk": request.risk,
            "score": request.score
        }
    }


@api_router.get("/scenario/{scenario_id}")
async def get_scenario_detail(scenario_id: int):
    """시나리오 상세 정보 제공"""
    if scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다")

    return SCENARIOS[scenario_id]


# 메인 라우터 (API + 웹 페이지)
router = APIRouter()
router.include_router(api_router)
router.include_router(web_router)