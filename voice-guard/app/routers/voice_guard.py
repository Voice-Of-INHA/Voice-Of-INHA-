# app/routers/voice_guard.py
# voice-guard의 원본 로직을 그대로 유지
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from ..ai import GoogleStreamingSTT, rule_hit_labels, calculate_rule_score, VertexRiskAnalyzer, get_risk_level, \
    analyze_rule_based

router = APIRouter(prefix="/voice-guard", tags=["voice-guard"])


# 자격증명/경로 설정 (voice-guard 원본 로직)
def _setup_gcp_credentials():
    base_app = os.path.dirname(os.path.dirname(__file__))  # app/
    proj_root = os.path.dirname(base_app)  # voice-guard-merged/

    key_candidates = [
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "",
        os.path.join(proj_root, "keys", "gcp-stt-key.json"),
    ]
    key_path = next((p for p in key_candidates if p and os.path.exists(p)), None)
    if key_path and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path

    # GCP 프로젝트 ID 자동 설정
    if not os.environ.get("GCP_PROJECT_ID") and key_path:
        try:
            with open(key_path, 'r', encoding='utf-8') as f:
                import json
                key_data = json.load(f)
                project_id = key_data.get('project_id')
                if project_id:
                    os.environ["GCP_PROJECT_ID"] = project_id
                    print(f"✅ GCP_PROJECT_ID 자동 설정: {project_id}")
        except Exception as e:
            print(f"⚠️ GCP_PROJECT_ID 자동 설정 실패: {e}")

    # GCP 위치 기본값 설정
    if not os.environ.get("GCP_LOCATION"):
        os.environ["GCP_LOCATION"] = "us-central1"
        print(f"✅ GCP_LOCATION 기본값 설정: us-central1")


@router.get("/")
def voice_guard_index():
    # HTML 파일 경로 후보들 (우선순위 순)
    base_app = os.path.dirname(os.path.dirname(__file__))  # app/
    proj_root = os.path.dirname(base_app)  # voice-guard-merged/

    html_candidates = [
        os.path.join(proj_root, "static", "stt-test.html"),  # voice-guard-merged/static/stt-test.html
        os.path.join(proj_root, "stt-test.html"),  # voice-guard-merged/stt-test.html
    ]

    # 존재하는 첫 번째 파일 선택
    html_path = next((p for p in html_candidates if os.path.exists(p)), None)

    if not html_path:
        return HTMLResponse(
            "<h1>VoiceGuard STT Test</h1>"
            "<p>stt-test.html 파일을 찾을 수 없습니다.</p>"
            "<p>다음 경로 중 하나에 파일을 두세요:</p>"
            "<ul>" + "".join([f"<li>{p}</li>" for p in html_candidates]) + "</ul>"
        )

    try:
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    except Exception as e:
        return HTMLResponse(f"<h1>VoiceGuard STT Test</h1><p>HTML 파일 읽기 실패: {e}</p>")


@router.get("/health")
def voice_guard_health():
    return {"status": "ok", "service": "VoiceGuard AI"}


@router.get("/diag/creds")
def voice_guard_diag_creds():
    path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    ok = bool(path and os.path.exists(path))
    return {"ok": ok, "path": path}


@router.get("/diag/stt")
def voice_guard_diag_stt():
    try:
        from google.cloud import speech_v1 as speech
        _ = speech.SpeechClient()
        return {"ok": True, "msg": "SpeechClient OK"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/diag/vertex")
def voice_guard_diag_vertex():
    try:
        import vertexai, os as _os
        try:
            from vertexai.generative_models import GenerativeModel  # type: ignore
        except Exception:
            from vertexai.preview.generative_models import GenerativeModel  # type: ignore
        vertexai.init(project=_os.getenv("GCP_PROJECT_ID"), location=_os.getenv("GCP_LOCATION", "us-central1"))
        _ = GenerativeModel("gemini-1.5-flash")
        return {"ok": True, "msg": "Vertex init OK", "project": _os.getenv("GCP_PROJECT_ID"),
                "location": _os.getenv("GCP_LOCATION")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# voice-guard의 원본 STT WebSocket (그대로 유지)
@router.websocket("/ws/stt")
async def ws_stt(ws: WebSocket):
    await ws.accept()
    stt = None

    # GCP 자격증명 설정
    _setup_gcp_credentials()

    # 누적 점수 시스템
    total_risk_score = 0
    session_utterances = []

    async def on_json(payload: dict):
        """STT 결과를 WebSocket으로 전송"""
        nonlocal total_risk_score, session_utterances  # 외부 변수 접근
        try:
            if payload.get("type") == "stt_update":
                if payload.get("is_final"):
                    # FINAL 결과
                    text = payload.get("transcript", "")
                    await ws.send_text(f"[FINAL] {text}")

                    # 1단계: 룰 필터링
                    labels = rule_hit_labels(text)
                    await ws.send_text(f"[FILTER] 룰 필터 결과: {labels}")

                    # 2단계: 분석 실행 및 점수 계산
                    current_score = 0

                    if labels:  # 룰 필터에 걸린 경우
                        await ws.send_text(f"[RULE_SCORE] 룰 기반 점수 계산...")
                        # 새로운 형식으로 rule filter 결과 반환
                        rule_data = analyze_rule_based(text)
                        current_score = rule_data.get("riskScore", 0)
                        await ws.send_text(f"[RISK] {rule_data}")
                    else:  # 룰 필터에 걸리지 않은 경우
                        await ws.send_text(f"[ANALYSIS] LLM 분석 시작...")
                        try:
                            analyzer = VertexRiskAnalyzer()
                            # 현재 발화만 분석 (문맥 제한하여 이전 발화 영향 방지)
                            data = analyzer.analyze(text, [])  # 빈 문맥으로 전달
                            current_score = data.get("riskScore", 0)
                            await ws.send_text(f"[RISK] {data}")
                        except Exception as e:
                            await ws.send_text(f"[RISK_ERROR] {e}")
                            # LLM 분석 실패 시 명시적으로 0점 설정
                            current_score = 0
                            await ws.send_text(f"[DEBUG] LLM 분석 실패로 0점 설정")

                    # 디버깅: 현재 점수 확인
                    await ws.send_text(f"[DEBUG] 현재 발화 점수: {current_score}점")

                    # 3단계: 누적 점수 계산 및 출력
                    total_risk_score += current_score
                    session_utterances.append(text)

                    await ws.send_text(f"[ACCUMULATED] 누적 점수: {total_risk_score}점 (현재: +{current_score}점)")

                    # 4단계: 위험도 단계별 경고 (100점 체계)
                    if total_risk_score >= 80:
                        await ws.send_text(f"[WARNING] 🚨 위험도 초과! 누적 점수: {total_risk_score}점 - 즉시 통화 종료 권장!")
                    elif total_risk_score >= 60:
                        await ws.send_text(f"[WARNING] ⚠️ 위험도 매우 높음! 누적 점수: {total_risk_score}점 - 즉시 경계 필요!")
                    elif total_risk_score >= 40:
                        await ws.send_text(f"[WARNING] ⚠️ 위험도 높음! 누적 점수: {total_risk_score}점 - 주의 필요!")
                    elif total_risk_score >= 20:
                        await ws.send_text(f"[WARNING] ⚠️ 위험도 증가! 누적 점수: {total_risk_score}점 - 경계 필요!")
                    elif total_risk_score >= 10:
                        await ws.send_text(f"[INFO] ℹ️ 위험도 감지! 누적 점수: {total_risk_score}점 - 주의 필요!")
                else:
                    # PARTIAL 결과
                    text = payload.get("transcript", "")
                    await ws.send_text(f"[PART] {text}")

            elif payload.get("type") == "error":
                await ws.send_text(f"[ERROR] {payload.get('message', 'Unknown error')}")

        except Exception as e:
            await ws.send_text(f"[ERROR] on_json 처리 오류: {e}")

    try:
        stt = GoogleStreamingSTT()
        await stt.start(on_json)

        while True:
            # WebSocket에서 오디오 데이터 수신
            try:
                data = await ws.receive_bytes()
                stt.feed_audio(data)
            except Exception as e:
                # 텍스트 메시지 처리 (예: "__END__")
                try:
                    text_data = await ws.receive_text()
                    if text_data == "__END__":
                        await ws.send_text("[INFO] STT 종료 신호 수신")
                        break
                    else:
                        await ws.send_text(f"[INFO] 텍스트 메시지 수신: {text_data}")
                except Exception as text_e:
                    print(f"WebSocket 데이터 수신 오류: {e}")
                    break

    except WebSocketDisconnect:
        print("WebSocket 연결 종료")
    except Exception as e:
        print(f"WebSocket 오류: {e}")
        await ws.send_text(f"[ERROR] {str(e)}")
    finally:
        if stt:
            stt.close()