# app/main.py
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .config import settings
from .db import Base, engine
from .routers import call_logs, uploads, realtime, voice_guard, simulation

# DB 모델 자동생성
Base.metadata.create_all(bind=engine)

app = FastAPI(title="VoiceGuard API - 통합 시스템")

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

# 시뮬레이션 시스템 추가 (API + 웹 페이지)
app.include_router(simulation.router)

@app.get("/")
def index():
    return HTMLResponse("""
    <h1>VoiceGuard - 통합 시스템</h1>
    <p>세 시스템이 연결되었습니다:</p>
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
        <li><strong>🎮 보이스피싱 시뮬레이션</strong> (새로운 기능)</li>
        <ul>
            <li><a href="/simulation/">시뮬레이션 메인 페이지</a></li>
            <li><a href="/api/scenarios">시나리오 목록 API</a></li>
            <li><a href="/api/start/1">검찰 사칭 시나리오 시작</a></li>
        </ul>
    </ul>
    <p><strong>WebSocket 엔드포인트:</strong></p>
    <ul>
        <li><code>ws://localhost:8000/ws/analysis</code> - 기존 데모 분석</li>
        <li><code>ws://localhost:8000/voice-guard/ws/stt</code> - AI 실시간 분석</li>
    </ul>
    <p><strong>시뮬레이션 API:</strong></p>
    <ul>
        <li><code>GET /api/scenarios</code> - 시나리오 목록</li>
        <li><code>GET /api/start/{id}</code> - 시나리오 시작</li>
        <li><code>POST /api/answer</code> - 답변 평가</li>
        <li><code>POST /api/result</code> - 결과 저장</li>
    </ul>
    <p><strong>시뮬레이션 웹:</strong></p>
    <ul>
        <li><code><a href="/simulation/">/simulation/</a></code> - 시뮬레이션 메인 페이지</li>
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
            },
            "simulation": {
                "name": "보이스피싱 시뮬레이션",
                "description": "AI 기반 보이스피싱 대응 훈련 시스템",
                "endpoints": {
                    "api": "/api/*",
                    "web": "/simulation/"
                }
            }
        },
        "connection": "세 시스템이 독립적으로 실행되며, 상위 레벨에서 연결됨"
    }
