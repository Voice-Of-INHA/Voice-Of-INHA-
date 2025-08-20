from google.cloud import speech_v1 as speech
from urllib.parse import urlparse
import os

def _guess_encoding_from_uri(gs_uri: str) -> speech.RecognitionConfig.AudioEncoding:
    """
    GCS URI의 확장자로 대략적인 인코딩 추정.
    확실치 않으면 ENCODING_UNSPECIFIED을 반환하여 서버 측 자동판별에 맡김.
    """
    ext = os.path.splitext(urlparse(gs_uri).path)[1].lower()
    if ext in (".webm", ".weba"):
        return speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
    if ext in (".ogg", ".opus"):
        return speech.RecognitionConfig.AudioEncoding.OGG_OPUS
    if ext in (".wav",):
        return speech.RecognitionConfig.AudioEncoding.LINEAR16
    return speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED


def longrun_diarization_gcs(gs_uri: str, language_code: str = "ko-KR") -> list[dict]:
    """
    GCS의 오디오를 장문 인식 + 화자 분할하여 타임라인 반환.
    - ko-KR: phone_call 미지원 → 기본 모델(default) 사용
    - words[].speaker_tag를 기준으로 발화 구간 병합
    """
    client = speech.SpeechClient()

    diar = speech.SpeakerDiarizationConfig(
        enable_speaker_diarization=True,
        min_speaker_count=2,
        max_speaker_count=2,
    )

    encoding = _guess_encoding_from_uri(gs_uri)

    # ✅ ko-KR에서 안전한 설정: 기본 모델 + 자동 문장부호 + 화자 분할
    cfg_kwargs = dict(
        language_code=language_code,
        model="default",
        enable_automatic_punctuation=True,
        diarization_config=diar,
        audio_channel_count=1,
        enable_separate_recognition_per_channel=False,
    )
    if encoding != speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED:
        cfg_kwargs["encoding"] = encoding

    cfg = speech.RecognitionConfig(**cfg_kwargs)
    audio = speech.RecognitionAudio(uri=gs_uri)

    op = client.long_running_recognize(config=cfg, audio=audio)
    resp = op.result(timeout=3 * 60 * 60)

    if not resp.results:
        return []

    words = resp.results[-1].alternatives[0].words

    def _sec_to_tag(sec: float) -> str:
        m = int(sec // 60)
        s = sec - 60 * m
        return f"{m:02d}:{s:04.1f}"

    timeline: list[dict] = []
    cur_spk, cur_words, cur_start = None, [], None

    for w in words:
        spk = w.speaker_tag
        st = w.start_time.total_seconds() if w.start_time else 0.0
        if cur_spk != spk:
            if cur_words:
                timeline.append(
                    {"t": _sec_to_tag(cur_start or 0.0), "spk": cur_spk, "text": " ".join(cur_words)}
                )
            cur_spk, cur_words, cur_start = spk, [], st
        cur_words.append(w.word)

    if cur_words:
        timeline.append(
            {"t": _sec_to_tag(cur_start or 0.0), "spk": cur_spk, "text": " ".join(cur_words)}
        )

    # speaker_tag는 단순 라벨(1/2가 고정 아님) — 필요에 따라 역할 매핑
    for seg in timeline:
        seg["role"] = "USER" if seg["spk"] == 1 else "SCAMMER"

    return timeline
