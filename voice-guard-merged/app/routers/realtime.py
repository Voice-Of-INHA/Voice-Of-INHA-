# app/routers/realtime.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import time
import base64
import os
from typing import Dict, Any

from ..ai import GoogleStreamingSTT, rule_hit_labels, should_call_llm, calculate_rule_score, VertexRiskAnalyzer

router = APIRouter(prefix="/ws", tags=["realtime"])

# 자격증명/경로 설정
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

@router.websocket("/stt")
async def stt_socket(ws: WebSocket):
    await ws.accept()
    
    # GCP 자격증명 설정
    _setup_gcp_credentials()
    
    stt = GoogleStreamingSTT()
    risk_analyzer = VertexRiskAnalyzer()
    
    current_transcript = ""
    risk_score = 0
    fraud_type = "정상"
    keywords = []
    
    async def on_stt_update(payload: Dict[str, Any]):
        nonlocal current_transcript, risk_score, fraud_type, keywords
        
        if payload.get("type") == "stt_update":
            transcript = payload.get("transcript", "")
            is_final = payload.get("is_final", False)
            
            if transcript:
                current_transcript = transcript
                
                # 룰 기반 필터링
                rule_labels = rule_hit_labels(transcript)
                rule_score = calculate_rule_score(rule_labels)
                
                # LLM 분석이 필요한 경우
                if should_call_llm(transcript) and is_final:
                    try:
                        ai_result = await risk_analyzer.analyze_risk(transcript)
                        risk_score = ai_result.get("risk_score", 0)
                        fraud_type = "의심" if risk_score >= 30 else "정상"
                        keywords = ai_result.get("labels", [])
                    except Exception as e:
                        print(f"AI 분석 오류: {e}")
                        risk_score = rule_score
                        keywords = rule_labels
                else:
                    risk_score = rule_score
                    keywords = rule_labels
                
                await ws.send_json({
                    "type": "analysis_update",
                    "transcript": transcript,
                    "is_final": is_final,
                    "risk_score": risk_score,
                    "fraud_type": fraud_type,
                    "keywords": keywords,
                    "confidence": payload.get("confidence"),
                    "timestamp": time.time()
                })
        
        elif payload.get("type") == "error":
            await ws.send_json({
                "type": "error",
                "message": payload.get("message", "Unknown error"),
                "stage": payload.get("stage", "unknown")
            })
    
    try:
        await stt.start(on_stt_update)
        
        while True:
            # WebSocket에서 오디오 데이터 수신
            data = await ws.receive_bytes()
            stt.feed_audio(data)
            
    except WebSocketDisconnect:
        print("WebSocket 연결 종료")
    except Exception as e:
        print(f"WebSocket 오류: {e}")
        await ws.send_json({
            "type": "error",
            "message": str(e)
        })
    finally:
        stt.close()

@router.websocket("/analysis")
async def analysis_socket(ws: WebSocket):
    await ws.accept()
    risk = 0
    started = False
    try:
        while True:
            # 프론트는 텍스트 JSON으로 보낸다고 가정 (base64 오디오 포함)
            msg = await ws.receive_text()
            payload = json.loads(msg)
            typ = payload.get("type")

            if typ == "start":
                started = True
                await ws.send_json({"event":"session_started","ts": time.time()})

            elif typ == "audio" and started:
                # data: base64 오디오 청크 (여기서 AI 분석 호출 가능)
                _b64 = payload.get("data")
                # bytes_data = base64.b64decode(_b64)  # 실제 분석용 바이트

                # 데모: 위험도 점차 증가
                risk = min(100, risk + 5)
                await ws.send_json({
                    "event":"partial",
                    "riskScore": risk,
                    "keywords": ["계좌","원격"] if risk >= 25 else [],
                    "ts": time.time()
                })

            elif typ == "stop":
                await ws.send_json({
                    "event":"final",
                    "riskScore": risk,
                    "fraudType": "의심" if risk >= 60 else "정상",
                    "confidence": 0.85
                })
                await ws.close()
                break

            else:
                await ws.send_json({"event":"error","message":"invalid message"})
    except WebSocketDisconnect:
        pass
