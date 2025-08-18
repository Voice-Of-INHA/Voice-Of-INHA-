# app/stt_service.py
import asyncio
import queue
import threading
import traceback
from typing import Optional

from google.cloud import speech_v1 as speech

SPACEPIECE = "\u2581"  # '▁'

def clean_text(s: str) -> str:
    if not s:
        return s
    s = s.replace(SPACEPIECE, " ")
    return " ".join(s.split()).strip()

def build_streaming_config(
    sample_rate_hz: int = 16000,
    language_code: str = "ko-KR",
    model: str = "default",
    enable_automatic_punctuation: bool = True,
) -> speech.StreamingRecognitionConfig:
    cfg = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=sample_rate_hz,
        language_code=language_code,
        model=model,  # 리전 미지원 대비 "default"
        enable_automatic_punctuation=enable_automatic_punctuation,
    )
    return speech.StreamingRecognitionConfig(
        config=cfg,
        interim_results=True,
        single_utterance=False,
    )

class GoogleStreamingSTT:
    """
    start(on_json)  : 내부 스레드에서 Google STT 시작
    feed_audio(b)   : 16kHz mono int16 PCM 청크 입력
    close()         : 종료
    on_json(payload): 코루틴. {"type":"stt_update","is_final":bool,"transcript":str,"confidence":float|None}
                      오류 시 {"type":"error","stage":"stt","message":..., "trace":...}
    """
    def __init__(self, sample_rate_hz: int = 16000):
        self.client = speech.SpeechClient()
        self.streaming_config = build_streaming_config(sample_rate_hz=sample_rate_hz)
        self._audio_q: "queue.Queue[Optional[bytes]]" = queue.Queue(maxsize=64)
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def _request_generator(self):
        from google.cloud.speech_v1 import StreamingRecognizeRequest
        # 설정은 전송하지 않고 오디오 데이터만 전송
        while self._running:
            chunk = self._audio_q.get()
            if chunk is None:
                break
            yield StreamingRecognizeRequest(audio_content=chunk)

    async def start(self, on_json):
        self._running = True
        loop = asyncio.get_running_loop()

        def consume():
            try:
                # config를 여기서 전달하고, _request_generator()에서는 오디오만 전송
                responses = self.client.streaming_recognize(
                    config=self.streaming_config,
                    requests=self._request_generator()
                )
                for response in responses:
                    for result in response.results:
                        if not result.alternatives:
                            continue
                        alt = result.alternatives[0]
                        payload = {
                            "type": "stt_update",
                            "is_final": result.is_final,
                            "transcript": clean_text(alt.transcript),
                            "confidence": getattr(alt, "confidence", None),
                        }
                        asyncio.run_coroutine_threadsafe(on_json(payload), loop)
            except Exception as e:
                tb = traceback.format_exc()
                asyncio.run_coroutine_threadsafe(
                    on_json({"type":"error","stage":"stt","message":str(e),"trace":tb}),
                    loop
                )

        self._thread = threading.Thread(target=consume, daemon=True)
        self._thread.start()

    def feed_audio(self, pcm_chunk: bytes):
        if self._running:
            try:
                self._audio_q.put_nowait(pcm_chunk)
            except queue.Full:
                pass  # 드롭

    def close(self):
        self._running = False
        try:
            self._audio_q.put_nowait(None)
        except Exception:
            pass
        if self._thread:
            self._thread.join(timeout=3.0)
            self._thread = None
