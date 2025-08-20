from google.cloud import speech_v1 as speech

def longrun_diarization_gcs(gs_uri: str, language_code="ko-KR") -> list[dict]:
    client = speech.SpeechClient()

    diar = speech.SpeakerDiarizationConfig(
        enable_speaker_diarization=True, min_speaker_count=2, max_speaker_count=2
    )
    cfg = speech.RecognitionConfig(
        language_code=language_code,
        enable_automatic_punctuation=True,
        diarization_config=diar,
        use_enhanced=True,
        model="phone_call",
        audio_channel_count=1,
        enable_separate_recognition_per_channel=False,
    )
    audio = speech.RecognitionAudio(uri=gs_uri)
    op = client.long_running_recognize(config=cfg, audio=audio)
    resp = op.result(timeout=3*60*60)

    if not resp.results:
        return []

    words = resp.results[-1].alternatives[0].words

    def sec_to_tag(sec: float) -> str:
        m = int(sec // 60); s = sec - 60*m
        return f"{m:02d}:{s:04.1f}"

    timeline, cur_spk, cur_words, cur_start = [], None, [], None
    for w in words:
        spk = w.speaker_tag
        st = w.start_time.total_seconds() if w.start_time else 0.0
        if cur_spk != spk:
            if cur_words:
                timeline.append({"t": sec_to_tag(cur_start or 0.0), "spk": cur_spk, "text": " ".join(cur_words)})
            cur_spk, cur_words, cur_start = spk, [], st
        cur_words.append(w.word)

    if cur_words:
        timeline.append({"t": sec_to_tag(cur_start or 0.0), "spk": cur_spk, "text": " ".join(cur_words)})

    for seg in timeline:
        seg["role"] = "USER" if seg["spk"] == 1 else "SCAMMER"
    return timeline
