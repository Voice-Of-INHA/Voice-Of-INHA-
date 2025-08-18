# app/main.py
import os, json, asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse

from .stt_service import GoogleStreamingSTT
from .rule_filter import should_call_llm, rule_hit_labels
from .risk_analyzer_vertex import VertexRiskAnalyzer

# -----------------------------
# 경로/자격증명 유틸
# -----------------------------
def _pick_first_existing(paths):
    for p in paths:
        if p and isinstance(p, str) and os.path.exists(p):
            return p
    return None

def _paths():
    base_app = os.path.dirname(__file__)   # .../api/app
    base_root = os.path.dirname(base_app)  # .../api (현재 루트)
    return base_app, base_root

base_app, base_root = _paths()

# 키 자동 탐색
key_candidates = [
    os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "",
    os.path.join(base_root, "keys", "gcp-stt-key.json"),
]
key_path = _pick_first_existing(key_candidates)
if key_path:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path
    try:
        with open(key_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        if not os.getenv("GCP_PROJECT_ID") and meta.get("project_id"):
            os.environ["GCP_PROJECT_ID"] = meta["project_id"]
    except Exception:
        pass
os.environ.setdefault("GCP_LOCATION", "us-central1")

# HTML 파일
html_candidates = [
    os.path.join(base_root, "stt-test.html"),
    os.path.join(base_app,  "stt-test.html"),
]
html_path = _pick_first_existing(html_candidates)

# -----------------------------
# FastAPI
# -----------------------------
app = FastAPI(title="Voice Guard STT+Risk API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

@app.get("/", response_class=HTMLResponse)
async def root():
    if html_path and os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    return HTMLResponse(
        "<h1>STT Test</h1><p>stt-test.html 파일을 찾지 못했습니다.</p>"
        f"<p>확인한 경로: {html_candidates}</p>"
    )

# -----------------------------
# WebSocket
# -----------------------------
@app.websocket("/ws/stt")
async def ws_stt(ws: WebSocket):
    await ws.accept()
    loop = asyncio.get_running_loop()  # ✅ anyio 대신 표준 asyncio 사용

    stt = GoogleStreamingSTT(sample_rate_hz=16000)
    analyzer = VertexRiskAnalyzer(model_name="gemini-1.5-flash")
    recent_utts: list[str] = []

    async def send_obj(d: dict):
        await ws.send_text(json.dumps(d, ensure_ascii=False))

    async def on_stt_payload(payload: dict):
        # partial은 그대로 전달
        if payload.get("type") != "stt_update":
            await send_obj(payload)
            return

        if not payload.get("is_final"):
            await send_obj(payload)
            return

        # final이면 위험도 분석
        text = (payload.get("transcript") or "").strip()
        conf = payload.get("confidence")
        if text:
            recent_utts.append(text)

        if not should_call_llm(text):
            payload["risk"] = {
                "risk_score": 5, "risk_level": "LOW",
                "labels": ["의심 없음"], "evidence": [],
                "reason": "룰 기반 필터에서 위험 신호 없음",
                "actions": []
            }
            await send_obj(payload)
            return

        snippets = rule_hit_labels(text)
        try:
            result = analyzer.analyze(
                final_text=text, recent_utts=recent_utts,
                asr_conf=conf, snippets=snippets
            )
        except Exception as e:
            result = {
                "risk_score": 5, "risk_level": "LOW",
                "labels": ["의심 없음"], "evidence": [],
                "reason": f"LLM 호출 실패: {e}",
                "actions": []
            }
        payload["risk"] = result
        await send_obj(payload)

    # STT 시작: on_json 코루틴을 스레드에서 안전하게 호출
    async def _cb(d: dict):
        try:
            await on_stt_payload(d)
        except Exception as e:
            await send_obj({"type": "error", "stage": "ws-on_stt_payload", "message": str(e)})

    try:
        await stt.start(_cb)
        await ws.send_text("[WS] open")
        await ws.send_text("▶️ started (mic → 16k PCM → WS)")

        while True:
            msg = await ws.receive()
            if "bytes" in msg and msg["bytes"] is not None:
                stt.feed_audio(msg["bytes"])
            elif "text" in msg and msg["text"] is not None:
                t = msg["text"].strip()
                if t == "close" or t == "__END__":
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await send_obj({"type": "error", "stage": "ws", "message": str(e)})
        except:
            pass
    finally:
        stt.close()
        try:
            await ws.close()
        except:
            pass

# -----------------------------
# 진단 엔드포인트
# -----------------------------
@app.get("/diag/creds")
def diag_creds():
    try:
        key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not key_path or not os.path.exists(key_path):
            return {"ok": False, "error": f"KEY not found: {key_path}"}
        with open(key_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        return {"ok": True, "key_path": key_path, "project": os.getenv("GCP_PROJECT_ID") or meta.get("project_id")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/diag/stt")
def diag_stt():
    try:
        from google.cloud import speech_v1 as speech
        speech.SpeechClient()
        return {"ok": True, "msg": "SpeechClient init OK"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/diag/vertex")
def diag_vertex():
    try:
        import vertexai
        try:
            from vertexai.generative_models import GenerativeModel
        except Exception:
            from vertexai.preview.generative_models import GenerativeModel
        vertexai.init(project=os.getenv("GCP_PROJECT_ID"),
                      location=os.getenv("GCP_LOCATION","us-central1"))
        GenerativeModel("gemini-1.5-flash")
        return {"ok": True, "msg": "Vertex init OK",
                "project": os.getenv("GCP_PROJECT_ID"),
                "location": os.getenv("GCP_LOCATION")}
    except Exception as e:
        return {"ok": False, "error": str(e)}
