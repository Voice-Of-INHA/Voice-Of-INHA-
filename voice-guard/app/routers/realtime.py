from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json, time, base64

router = APIRouter(prefix="/ws", tags=["realtime"])

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
