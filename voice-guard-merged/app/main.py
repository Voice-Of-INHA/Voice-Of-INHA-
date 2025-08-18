# app/main.py
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .config import settings
from .db import Base, engine
from .routers import call_logs, uploads, realtime

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

# 라우터 마운트
app.include_router(call_logs.router)
app.include_router(uploads.router)
app.include_router(realtime.router)

# 자격증명/경로 설정
def _setup_gcp_credentials():
    base_app = os.path.dirname(__file__)  # app/
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

# 앱 시작 시 GCP 자격증명 설정
_setup_gcp_credentials()

@app.get("/")
def index():
    # HTML 파일 경로 후보들 (우선순위 순)
    base_app = os.path.dirname(__file__)  # app/
    proj_root = os.path.dirname(base_app)  # voice-guard-merged/
    
    html_candidates = [
        os.path.join(proj_root, "static", "stt-test.html"),      # voice-guard-merged/static/stt-test.html
        os.path.join(proj_root, "stt-test.html"),                # voice-guard-merged/stt-test.html
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

@app.get("/health")
def health():
    return {"status": "ok", "service": "VoiceGuard API - 통합 시스템"}

@app.get("/diag/creds")
def diag_creds():
    path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    ok = bool(path and os.path.exists(path))
    return {"ok": ok, "path": path}
