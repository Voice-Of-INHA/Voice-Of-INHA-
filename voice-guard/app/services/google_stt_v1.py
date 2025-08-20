from google.cloud import speech_v1 as speech
from urllib.parse import urlparse
from collections import Counter
import logging
import os

log = logging.getLogger("stt")

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
    - ko-KR: phone_call/enhanced 조합은 종종 불안정 → model="default" 권장
    - 모든 result의 words를 합쳐서 조립 (일부 환경에서 마지막 result만 words가 꽉 차지 않음)
    - 단어 타임스탬프/화자 태그가 꼭 나오도록 enable_word_time_offsets=True
    """
    client = speech.SpeechClient()

    diar = speech.SpeakerDiarizationConfig(
        enable_speaker_diarization=True, min_speaker_count=2, max_speaker_count=2
    )
    encoding = _guess_encoding_from_uri(gs_uri)

    cfg_kwargs = dict(
        language_code=language_code,
        model="default",                       # 한국어 안전 조합
        enable_automatic_punctuation=True,
        diarization_config=diar,
        audio_channel_count=1,
        enable_separate_recognition_per_channel=False,
        enable_word_time_offsets=True,         # ← words[].start/end_time 보장
        max_alternatives=1,
        profanity_filter=False,
    )
    if encoding != speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED:
        cfg_kwargs["encoding"] = encoding

    cfg = speech.RecognitionConfig(**cfg_kwargs)
    audio = speech.RecognitionAudio(uri=gs_uri)

    log.info(f"[STT] long_running_recognize: uri={gs_uri} enc={encoding.name} lang={language_code}")
    op = client.long_running_recognize(config=cfg, audio=audio)
    resp = op.result(timeout=3 * 60 * 60)

    if not resp.results:
        log.warning("[STT] no results")
        return []

    # ── 모든 result의 words를 합쳐 조립 ─────────────────────────────────────────────
    all_words = []
    per_result_counts = []
    for idx, r in enumerate(resp.results):
        if r.alternatives:
            w = r.alternatives[0].words or []
            per_result_counts.append(len(w))
            if w:
                all_words.extend(w)
        else:
            per_result_counts.append(0)

    total_words = len(all_words)
    last_end_sec = (
        all_words[-1].end_time.total_seconds() if all_words and all_words[-1].end_time else None
    )
    spk_dist = Counter([w.speaker_tag for w in all_words])

    log.info(
        "[STT] results=%d  words_total=%d  last_end=%.2fs  per_result=%s  spk_dist=%s",
        len(resp.results),
        total_words,
        last_end_sec or -1,
        per_result_counts[:10] + (["…"] if len(per_result_counts) > 10 else []),
        dict(spk_dist),
    )

    if total_words == 0:
        # 드물게 diarization words가 비어 있으면 전체 transcript를 로그로 남겨 원인 파악
        sample_txt = (resp.results[-1].alternatives[0].transcript[:120] + "…") if resp.results and resp.results[-1].alternatives else ""
        log.warning("[STT] words empty (diarization). last transcript sample=%r", sample_txt)
        return []

    # ── 타임라인 병합 ─────────────────────────────────────────────────────────────
    def _sec_to_tag(sec: float) -> str:
        m = int(sec // 60)
        s = sec - 60 * m
        return f"{m:02d}:{s:04.1f}"

    timeline: list[dict] = []
    cur_spk, cur_words, cur_start = None, [], None

    for w in all_words:
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

    # 역할 라벨링(간단 규칙). 필요하면 나중에 '첫 발화자=USER' 대신 통계 기반으로 개선 가능.
    for seg in timeline:
        seg["role"] = "USER" if seg["spk"] == 1 else "SCAMMER"

    log.info("[STT] timeline_segments=%d  first=%r", len(timeline), timeline[0] if timeline else None)
    return timeline
