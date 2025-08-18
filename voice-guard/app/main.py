# app/main.py
import os, base64
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .config import settings
from .db import Base, engine
from .routers import call_logs, uploads, realtime, voice_guard

if "GCP_KEY_BASE64" in os.environ:
    key_content = base64.b64decode(os.environ["GCP_KEY_BASE64"]).decode("utf-8")
    os.makedirs("/app/keys", exist_ok=True)
    with open("/app/keys/gcp-stt-key.json", "w") as f:
        f.write(key_content)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/app/keys/gcp-stt-key.json"

# DB 모델 자동생성
Base.metadata.create_all(bind=engine)

app = FastAPI(title="VoiceGuard API - 통합 시스템")

# 👇 여기부터 붙여넣기
SERVE_STATIC = os.getenv("SERVE_STATIC", "false").lower() == "true"

BASE_DIR = Path(__file__).resolve().parent      # .../project-root/app
ROOT_DIR = BASE_DIR.parent                      # .../project-root
static_dir = (ROOT_DIR / "static").resolve()    # .../project-root/static

if SERVE_STATIC and static_dir.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
# 👆 여기까지

# CORS: 프론트 로컬 개발 주소 허용
origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 마운트 - 두 시스템 연결
# Voice_Of_Inha_Backend 시스템
app.include_router(call_logs.router)
app.include_router(uploads.router)
app.include_router(realtime.router)

# voice-guard 시스템 (별도 경로로 연결)
app.include_router(voice_guard.router)

@app.get("/")
def index():
    return HTMLResponse("""
    <h1>VoiceGuard - 통합 시스템</h1>
    <p>두 시스템이 연결되었습니다:</p>
    <ul>
        <li><strong>Voice_Of_Inha_Backend</strong> (기존 시스템)</li>
        <ul>
            <li><a href="/api/calls">통화 로그 API</a></li>
            <li><a href="/api/uploads/presign">파일 업로드 API</a></li>
            <li><a href="/ws/analysis">실시간 분석 (데모)</a></li>
        </ul>
        <li><strong>voice-guard</strong> (AI 시스템)</li>
        <ul>
            <li><a href="/voice-guard/">AI 테스트 페이지</a></li>
            <li><a href="/voice-guard/health">AI 헬스체크</a></li>
            <li><a href="/voice-guard/diag/creds">AI 자격증명 진단</a></li>
            <li><a href="/voice-guard/diag/stt">STT 진단</a></li>
            <li><a href="/voice-guard/diag/vertex">Vertex AI 진단</a></li>
        </ul>
    </ul>
    <p><strong>WebSocket 엔드포인트:</strong></p>
    <ul>
        <li><code>ws://localhost:8000/ws/analysis</code> - 기존 데모 분석</li>
        <li><code>ws://localhost:8000/voice-guard/ws/stt</code> - AI 실시간 분석</li>
    </ul>
    """)

@app.get("/health")
def health():
    return {"status": "ok", "service": "VoiceGuard API - 통합 시스템"}

@app.get("/systems")
def systems_info():
    return {
        "systems": {
            "voice_of_inha_backend": {
                "name": "Voice_Of_Inha_Backend",
                "description": "기존 백엔드 시스템 (DB + 기본 API)",
                "endpoints": {
                    "api": "/api/*",
                    "websocket": "/ws/analysis"
                }
            },
            "voice_guard": {
                "name": "voice-guard",
                "description": "AI 분석 시스템 (STT + Vertex AI)",
                "endpoints": {
                    "api": "/voice-guard/*",
                    "websocket": "/voice-guard/ws/stt"
                }
            }
        },
        "connection": "두 시스템이 독립적으로 실행되며, 상위 레벨에서 연결됨"
    }
