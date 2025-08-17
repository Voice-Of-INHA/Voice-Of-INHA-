# app/main.py
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .stt_service import GoogleStreamingSTT
from .rule_filter import should_call_llm, rule_hit_labels
from .risk_analyzer_vertex import VertexRiskAnalyzer


app = FastAPI(title="Voice Guard STT API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------- 자격증명/경로 -------------
def _paths():
    base_app = os.path.dirname(__file__)          # .../app
    base_api = os.path.dirname(base_app)          # .../
    proj_root = os.path.dirname(base_api)
    return base_app, base_api, proj_root


base_app, base_api, proj_root = _paths()

key_candidates = [
    os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "",
    os.path.join(base_api, "keys", "gcp-stt-key.json"),
    os.path.join(proj_root, "keys", "gcp-stt-key.json"),
]
key_path = next((p for p in key_candidates if p and os.path.exists(p)), None)
if key_path and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path

# GCP 프로젝트 ID 자동 설정
if not os.environ.get("GCP_PROJECT_ID"):
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


@app.get("/")
def index():
    # HTML 파일 경로 후보들 (우선순위 순)
    html_candidates = [
        os.path.join(proj_root, "stt-test.html"),      # voice-guard/stt-test.html
        os.path.join(base_api, "stt-test.html"),       # api/stt-test.html  
        os.path.join(base_app, "stt-test.html"),       # api/app/stt-test.html
    ]
    
    # 존재하는 첫 번째 파일 선택
    html_path = next((p for p in html_candidates if os.path.exists(p)), None)
    
    if not html_path:
        return HTMLResponse(
            "<h1>STT Test</h1>"
            "<p>stt-test.html 파일을 찾을 수 없습니다.</p>"
            "<p>다음 경로 중 하나에 파일을 두세요:</p>"
            "<ul>" + "".join([f"<li>{p}</li>" for p in html_candidates]) + "</ul>"
        )
    
    try:
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    except Exception as e:
        return HTMLResponse(f"<h1>STT Test</h1><p>HTML 파일 읽기 실패: {e}</p>")


@app.get("/health")
def health():
    return {"status": "ok"}


# ------------- Diagnostics -------------
@app.get("/diag/creds")
def diag_creds():
    path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    ok = bool(path and os.path.exists(path))
    return {"ok": ok, "path": path}


@app.get("/diag/stt")
def diag_stt():
    try:
        from google.cloud import speech_v1 as speech
        _ = speech.SpeechClient()
        return {"ok": True, "msg": "SpeechClient OK"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/diag/vertex")
def diag_vertex():
    try:
        import vertexai, os as _os
        try:
            from vertexai.generative_models import GenerativeModel  # type: ignore
        except Exception:
            from vertexai.preview.generative_models import GenerativeModel  # type: ignore
        vertexai.init(project=_os.getenv("GCP_PROJECT_ID"), location=_os.getenv("GCP_LOCATION", "us-central1"))
        _ = GenerativeModel("gemini-1.5-flash")
        return {"ok": True, "msg": "Vertex init OK", "project": _os.getenv("GCP_PROJECT_ID"), "location": _os.getenv("GCP_LOCATION")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ------------- WebSocket: /ws/stt -------------
@app.websocket("/ws/stt")
async def ws_stt(ws: WebSocket):
    await ws.accept()
    stt = None
    
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
                        from .rule_filter import calculate_rule_score
                        current_score = calculate_rule_score(labels)
                        await ws.send_text(f"[RULE_SCORE] 룰 기반 위험도: {current_score}점 ({', '.join(labels)})")
                    else:  # 룰 필터에 걸리지 않은 경우
                        await ws.send_text(f"[ANALYSIS] LLM 분석 시작...")
                        try:
                            analyzer = VertexRiskAnalyzer()
                            # analyze() 메서드에 필요한 매개변수 전달
                            data = analyzer.analyze(
                                final_text=text,
                                recent_utts=session_utterances[-5:],  # 최근 5개 발화 기록
                                asr_conf=None,   # STT 신뢰도 (현재는 None)
                                snippets=labels  # 의심 스니펫
                            )
                            current_score = data.get("risk_score", 0)
                            await ws.send_text(f"[RISK] {data}")
                        except Exception as e:
                            await ws.send_text(f"[RISK_ERROR] {e}")
                    
                    # 3단계: 누적 점수 계산 및 출력
                    total_risk_score += current_score
                    session_utterances.append(text)
                    
                    await ws.send_text(f"[ACCUMULATED] 누적 점수: {total_risk_score}점 (현재: +{current_score}점)")
                    
                    # 4단계: 위험도 단계별 경고
                    if total_risk_score >= 100:
                        await ws.send_text(f"[WARNING] 🚨 위험도 초과! 누적 점수: {total_risk_score}점 - 즉시 통화 종료 권장!")
                    elif total_risk_score >= 80:
                        await ws.send_text(f"[WARNING] ⚠️ 위험도 매우 높음! 누적 점수: {total_risk_score}점 - 즉시 경계 필요!")
                    elif total_risk_score >= 60:
                        await ws.send_text(f"[WARNING] ⚠️ 위험도 높음! 누적 점수: {total_risk_score}점 - 주의 필요!")
                    elif total_risk_score >= 40:
                        await ws.send_text(f"[WARNING] ⚠️ 위험도 증가! 누적 점수: {total_risk_score}점 - 경계 필요!")
                    elif total_risk_score >= 20:
                        await ws.send_text(f"[INFO] ℹ️ 위험도 감지! 누적 점수: {total_risk_score}점 - 주의 필요!")
                else:
                    # PARTIAL 결과
                    text = payload.get("transcript", "")
                    await ws.send_text(f"[PART] {text}")
            elif payload.get("type") == "error":
                # 오류 메시지
                await ws.send_text(f"[ERROR] {payload.get('message', 'Unknown error')}")
        except Exception as e:
            print(f"WebSocket 전송 오류: {e}")

    try:
        stt = GoogleStreamingSTT()
        await stt.start(on_json)
        await ws.send_text("[WS] open")
        await ws.send_text("▶️ started (mic → 16k PCM → WS)")
        await ws.send_text(f"[SESSION] 새로운 세션 시작 - 누적 점수: {total_risk_score}점")

        while True:
            # 브라우저에서 바이너리(PCM int16) 전송
            data = await ws.receive_bytes()
            if data == b"__END__":
                break
            stt.feed_audio(data)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_text(f"[error] {e!s}")
        except Exception:
            pass
    finally:
        # 세션 종료 시 최종 누적 점수 표시
        if total_risk_score > 0:
            await ws.send_text(f"[SESSION_END] 세션 종료 - 최종 누적 점수: {total_risk_score}점")
            if total_risk_score >= 100:
                await ws.send_text(f"[FINAL_WARNING] 🚨 최종 위험도: 매우 높음 - 즉시 조치 필요!")
            elif total_risk_score >= 60:
                await ws.send_text(f"[FINAL_WARNING] ⚠️ 최종 위험도: 높음 - 주의 필요!")
            elif total_risk_score >= 30:
                await ws.send_text(f"[FINAL_WARNING] ℹ️ 최종 위험도: 중간 - 경계 필요!")
        
        if stt:
            stt.close()
        try:
            await ws.close()
        except Exception:
            pass
