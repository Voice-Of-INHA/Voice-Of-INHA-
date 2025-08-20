# app/routers/simulation.py
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Dict, Any
import os, re, json, tempfile

# ===============================
# 시뮬레이션 전용 LLM 분석기
# ===============================
class SimulationAnalyzer:
    def __init__(self):
        self.client = self._make_vertex_client()

    def _make_vertex_client(self):
        from google import genai
        project = os.getenv("GCP_PROJECT_ID")
        location = os.getenv("GCP_LOCATION", "us-central1")
        if not project:
            raise RuntimeError("GCP_PROJECT_ID 환경변수를 설정하세요.")
        return genai.Client(vertexai=True, project=project, location=location)

    def _extract_json(self, txt: str) -> str:
        if not txt:
            return ""
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", txt, flags=re.S)
        if m:
            return m.group(1)
        s, e = txt.find("{"), txt.rfind("}")
        if s != -1 and e != -1 and e > s:
            return txt[s:e+1]
        return txt.strip()

    def _lenient_json_loads(self, s: str) -> dict:
        s = (s or "").strip()
        if not s:
            return {}
        if "'" in s and '"' not in s:
            s = re.sub(r"'", '"', s)
        s = re.sub(r",\s*([}\]])", r"\1", s)
        if s.count("{") > s.count("}"):
            s += "}" * (s.count("{") - s.count("}"))
        try:
            return json.loads(s)
        except Exception:
            return {}

    def _generate_with_models(self, prompt: str) -> str:
        from google.genai import types
        models = [
            "gemini-2.5-flash"
        ]
        last = None
        for m in models:
            try:
                resp = self.client.models.generate_content(
                    model=m,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        max_output_tokens=2048,
                        response_mime_type="application/json",
                    ),
                )
                text = getattr(resp, "text", "") or ""
                if not text:
                    try:
                        text = resp.candidates[0].content.parts[0].text
                    except Exception:
                        text = ""
                if text.strip():
                    return text
            except Exception as e:
                last = e
                continue
        if last:
            raise last
        return ""

    def analyze_dialogue(self, transcript: str) -> Dict[str, Any]:
        # 총합 코칭용 프롬프트 (로직/프롬프트 변경 없음)
        prompt = f"""
너의 역할: ‘보이스피싱 대응 훈련’에서 사용자의 **전체 대응 패턴**을 코치처럼 평가하는 전문가.
입력은 Q1/A1, Q2/A2, Q3/A3로 구성된 **대화 전체 기록**이며, 각 턴별이 아니라 **총합 관점**에서만 피드백을 준다.
개인정보(주민번호, 계좌, OTP, 인증번호 등)를 새로 **생성·추정·요구 금지**. 링크/앱을 제안하거나 상호작용 유도 금지.
**오직 JSON만** 출력하라(코드펜스·설명문 금지).

[입력 대화]
{transcript}

[평가 목표(총합 관점)]
- 사용자의 전반적 대응 습관을 파악: 거절/지연/직접확인/대면요구 등 **안전 습관** vs. 권위·긴급성에 휘둘림, 정보 누설, 송금·앱 설치 의사 표명 등 **위험 습관**.
- “왜 위험한지”를 사용자 관점으로 설명하고, “다음엔 어떻게 할지”를 **행동 지침**으로 제시.
- 상황을 일반화한 **개선 답변 템플릿**(예: 개인정보요구/송금강요/앱·링크 설치요구)을 제공.

[채점 규칙(0~100, 하나의 score만)]
- 기본 100점에서 위험 신호를 차감하고, 안전 신호를 소폭 가산. 최종 0~100로 클램프.
  · **중대 위험 차감(예시)**: 민감정보 제공·낭독(-40~-60), 송금/결제 동의·문의(-35~-50), 원격제어/앱 설치 의사(-35~-50)
  · **중간 위험 차감**: 신분증/카드정보 일부 제공, 유도 질문에 순응(-15~-30), 링크·첨부 실행 의사(-15~-30)
  · **경미 위험 차감**: ‘왜 필요한지’만 묻고 끊지 않음, 추가 검증 부재(-5~-10)
  · **안전 가점(소폭)**: 전화 즉시 종료/콜백 제안, **공식 채널·대면 확인** 고집, 개인정보·송금 **일절 거부**(+3~+10 항목당, 최대 +20)
- 위험도 매핑: score ≥ 80 → "LOW", 50~79 → "MEDIUM", ≤ 49 → "HIGH"

[출력 형식: JSON만]
{{
  "score": <정수 0~100>,
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "pattern_summary": "전체 대응 패턴 요약(최대 180자, 사용자 관점)",
  "good_signals": ["안전 신호 1", "안전 신호 2", "..."],
  "risk_signals": ["위험 신호 1", "위험 신호 2", "..."],
  "coaching": {{
    "why_risky": "사용자 관점 설명(최대 180자): 현재 습관이 왜 취약한지",
    "do_next_time": "다음 번 행동 지침 3~5단계(최대 200자, 명령형)",
    "principles": ["원칙1", "원칙2", "원칙3"],
    "better_answer_templates": {{
      "personal_info_request": "개인정보 요구 상황 공손·단호 거절 템플릿 1~2문장",
      "money_or_transfer": "송금/결제 요구 상황 거절·검증 유도 템플릿 1~2문장",
      "app_or_link_install": "앱/링크/원격 제어 요구 차단 템플릿 1~2문장"
    }}
  }},
  "overall_comment": "격려 + 핵심 개선 포인트(최대 150자)"
}}

[추가 제약]
- 질문별 세부 채점표를 만들지 말고, **총합 스코어 1개**만 제공.
- 특정 기관·직원 정보나 개인식별정보를 **새로 만들거나 요구하지 말 것**.
- 모든 텍스트는 **한국어**로 간결하고 실전형으로 작성.
""".strip()

        # LLM 호출 및 파싱
        try:
            raw = self._generate_with_models(prompt)
            llm = self._lenient_json_loads(self._extract_json(raw))  # ← LLM 전체 JSON
        except Exception as e:
            # 실패 시 기본 폴백 JSON
            llm = {
                "score": 50,
                "risk_level": "MEDIUM",
                "pattern_summary": "LLM 분석 실패로 임시 점수와 요약을 제공합니다.",
                "good_signals": [],
                "risk_signals": [],
                "coaching": {
                    "why_risky": "임시 설명",
                    "do_next_time": "전화 끊기 → 공식 콜백 → 대면 확인",
                    "principles": ["개인정보 미제공", "송금 금지", "공식 채널 확인"],
                    "better_answer_templates": {
                        "personal_info_request": "개인정보는 전화로 제공하지 않습니다. 공식 창구로 확인하겠습니다.",
                        "money_or_transfer": "지금은 송금할 수 없습니다. 경찰서/은행에 직접 확인하겠습니다.",
                        "app_or_link_install": "앱 설치나 링크 접속은 하지 않겠습니다. 공식 경로로만 확인합니다."
                    }
                },
                "overall_comment": "임시 코멘트"
            }

        # 위험도/점수 요약(상단 배지용)
        score = int(llm.get("score", 0))
        risk_level = (llm.get("risk_level") or "").upper() or ("LOW" if score >= 80 else "MEDIUM" if score >= 50 else "HIGH")
        # 요약용 필드(기존 프론트 호환)
        explanation = llm.get("coaching", {}).get("why_risky") or llm.get("overall_comment", "") or "분석 결과가 없습니다."
        feedback = llm.get("coaching", {}).get("do_next_time") or "개선 지침을 확인할 수 없습니다."

        # 응답: 요약 + LLM 원문(JSON) 같이 반환
        return {
            "risk": risk_level,        # "LOW/MEDIUM/HIGH"
            "score": score,            # 0~100
            "explanation": explanation,
            "feedback": feedback,
            "llm": llm,                # ← 전체 LLM 출력
        }

# ===============================
# API 라우터
# ===============================
api_router = APIRouter(prefix="/api/simulation", tags=["simulation"])

class BulkAnalyzeRequest(BaseModel):
    transcript: str

class AnalyzeResponse(BaseModel):
    risk: str
    score: int
    explanation: str
    feedback: str
    llm: Dict[str, Any]   # ← LLM 전체 JSON 그대로 전달

@api_router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: BulkAnalyzeRequest):
    transcript = (request.transcript or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="transcript가 비어있습니다.")
    analyzer = SimulationAnalyzer()
    result = analyzer.analyze_dialogue(transcript)
    return AnalyzeResponse(**result)

# === STT 업로드 엔드포인트 (프론트: WAV 업로드 → 서버: 바로 STT) ===
@api_router.post("/stt")
async def stt(audio_file: UploadFile = File(...)):
    """
    프론트에서 이미 WebM→WAV(16kHz mono PCM s16le)로 변환하여 업로드.
    서버는 WAV를 그대로 Google STT에 전달.
    """
    try:
        # ADC(서비스계정) 준비
        def _adc():
            base_app = os.path.dirname(os.path.dirname(__file__))  # app/
            proj_root = os.path.dirname(base_app)                  # 프로젝트 루트
            key_candidates = [
                os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "",
                os.path.join(proj_root, "keys", "gcp-stt-key.json"),
            ]
            key_path = next((p for p in key_candidates if p and os.path.exists(p)), None)
            if key_path and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path
        _adc()

        # 업로드 WAV 임시 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            raw = await audio_file.read()
            tmp.write(raw)
            wav_path = tmp.name

        # Google STT 호출
        from google.cloud import speech
        client = speech.SpeechClient()
        with open(wav_path, "rb") as f:
            wav = f.read()

        audio = speech.RecognitionAudio(content=wav)
        cfg = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            language_code="ko-KR",
            enable_automatic_punctuation=True,
            model="latest_short",
            max_alternatives=1,
            sample_rate_hertz=16000,  # 프론트에서 16kHz로 리샘플됨
        )
        resp = client.recognize(config=cfg, audio=audio)
        text = ""
        for r in resp.results:
            if r.alternatives:
                text += r.alternatives[0].transcript

        return {"success": True, "transcript": text}

    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        try:
            if 'wav_path' in locals() and os.path.exists(wav_path):
                os.unlink(wav_path)
        except Exception:
            pass

# ===============================
# 초미니 HTML (하드코딩 Q1~Q3 + 발화 끝남 버튼)
#   - 프론트: WebM 녹음 → 브라우저에서 WAV(16k/mono/PCM16) 변환 → 업로드
# ===============================
web_router = APIRouter(prefix="/simulation", tags=["simulation-web"])

@web_router.get("/", response_class=HTMLResponse)
async def simulation_index():
    return HTMLResponse("""
<!doctype html><meta charset="utf-8"><title>보이스피싱 시뮬(하드코딩, 브라우저 WAV 업로드)</title>
<style>
body{font:14px system-ui,Segoe UI,Arial;margin:24px}
button{padding:8px 12px;margin:6px 6px 0 0}
textarea{width:100%;height:220px;margin-top:8px}
pre{background:#f6f7f9;padding:10px;border-radius:8px;white-space:pre-wrap;margin-top:8px}
.small{color:#666}
code{background:#eef;padding:2px 4px;border-radius:4px}
</style>
<h3>Q1/Q2/Q3 · 발화 끝남 → WebM 녹음 → 브라우저에서 WAV 변환 → STT</h3>
<div class="small">※ Q버튼을 누르면 질문이 추가되고, 자동 녹음 후 침묵 1초면 종료됩니다.</div>
<div>
  <button onclick="onQ(1)">Q1 발화 끝남</button>
  <button onclick="onQ(2)">Q2 발화 끝남</button>
  <button onclick="onQ(3)">Q3 발화 끝남</button>
  <button onclick="analyze()">분석하기</button>
</div>
<textarea id="tx" placeholder="Q1/A1, Q2/A2, Q3/A3 순으로 누적됩니다."></textarea>
<pre id="out" style="display:none"></pre>
<script>
const Q = {
  1: "여기는 검찰청입니다. 고객님 명의로 범죄 계좌가 발견됐습니다. 계좌번호를 알려주세요.",
  2: "안전을 위해 주민등록번호도 필요합니다. 지금 불러주세요.",
  3: "즉시 지정 계좌로 송금하지 않으면 체포됩니다."
};

let isRecording=false, mediaRecorder=null, chunks=[], ac=null, analyser=null, mic=null, dataArr=null, silenceTimer=null, hardTimeout=null;

function appendLine(line){
  const t = document.getElementById('tx');
  const nl = t.value && !t.value.endsWith("\\n");
  t.value += (nl?"\\n":"") + line + "\\n";
}

async function onQ(n){
  if(isRecording){ show('이미 녹음 중입니다. 잠시만…'); return; }
  appendLine(`Q${n}: ${Q[n]}`);
  await startRecording(n);
}

function show(txt){
  const out = document.getElementById('out');
  out.style.display='block';
  out.textContent = txt;
}

async function startRecording(turn){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      audio:{sampleRate:16000, channelCount:1, echoCancellation:true, noiseSuppression:true}
    });
    ac = new AudioContext();
    analyser = ac.createAnalyser();
    mic = ac.createMediaStreamSource(stream);
    mic.connect(analyser);
    analyser.fftSize = 256;
    dataArr = new Uint8Array(analyser.frequencyBinCount);

    mediaRecorder = new MediaRecorder(stream, {mimeType:'audio/webm;codecs=opus'});
    chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      try{
        stream.getTracks().forEach(t=>t.stop());
        const webm = new Blob(chunks, {type:'audio/webm;codecs=opus'});
        const wav = await toWavResampled(webm, 16000); // ← 브라우저에서 WAV로 변환
        await doSTT(wav, turn);
      }catch(e){
        appendLine(`A${turn}: (STT 실패: ${e})`);
        show('STT 실패: '+e);
      }finally{
        cleanup(); isRecording = false;
      }
    };

    mediaRecorder.start();
    isRecording = true;
    show(`Q${turn} 녹음 시작… (침묵 1초 시 자동 종료)`);

    hardTimeout = setTimeout(() => {
      if(isRecording) { show('최대 녹음 시간(50초) 도달, 자동 종료'); stopRecording(); }
    }, 50000);

    detectSilence(()=>stopRecording(), 1000, 30);
  }catch(e){
    show('마이크 권한 필요/오류: '+e);
  }
}

function stopRecording(){
  if(mediaRecorder && isRecording){
    mediaRecorder.stop(); isRecording=false; show('녹음 종료. STT 중…');
  }
  if(silenceTimer){ clearTimeout(silenceTimer); silenceTimer=null; }
  if(hardTimeout){ clearTimeout(hardTimeout); hardTimeout=null; }
}
 
function cleanup(){
  try{ if(ac){ ac.close(); } }catch(e){}
  ac=null; analyser=null; mic=null; dataArr=null;
}

function detectSilence(onSilence, timeoutMs, threshold){
  let quietSince = null;
  const loop = ()=>{
    if(!analyser || !isRecording) return;
    analyser.getByteFrequencyData(dataArr);
    let sum=0; for(let i=0;i<dataArr.length;i++) sum+=dataArr[i];
    const avg = sum/(dataArr.length||1);
    const now = performance.now();
    if(avg <= threshold){
      if(quietSince === null) quietSince = now;
      const quietFor = now - quietSince;
      if(!silenceTimer){
        silenceTimer = setTimeout(()=>{ onSilence(); }, Math.max(0, timeoutMs - quietFor));
      }
    }else{
      quietSince = null;
      if(silenceTimer){ clearTimeout(silenceTimer); silenceTimer=null; }
    }
    if(isRecording) requestAnimationFrame(loop);
  };
  loop();
}

// WebM → AudioBuffer → OfflineAudioContext(모노, 16kHz) → WAV
async function toWavResampled(webmBlob, targetRate){
  const arr = await webmBlob.arrayBuffer();
  const ac2 = new (window.AudioContext||window.webkitAudioContext)();
  const srcBuffer = await ac2.decodeAudioData(arr);
  const frames = Math.ceil(srcBuffer.duration * targetRate);
  const off = new OfflineAudioContext(1, frames, targetRate);
  const src = off.createBufferSource();
  src.buffer = srcBuffer;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  ac2.close();
  return new Blob([bufferToWav(rendered)], {type:'audio/wav'});
}

function bufferToWav(buffer){
  const ch = 1, len = buffer.length, rate = buffer.sampleRate;
  const ab = new ArrayBuffer(44 + len*ch*2);
  const v = new DataView(ab);
  const w = (o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  w(0,'RIFF'); v.setUint32(4,36+len*ch*2,true); w(8,'WAVE'); w(12,'fmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,ch,true);
  v.setUint32(24,rate,true); v.setUint32(28,rate*ch*2,true); v.setUint16(32,ch*2,true);
  v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,len*ch*2,true);
  let off=44, data = buffer.getChannelData(0);
  for(let i=0;i<len;i++){
    let s = Math.max(-1,Math.min(1,data[i]));
    v.setInt16(off, s<0 ? s*0x8000 : s*0x7FFF, true);
    off+=2;
  }
  return ab;
}

async function doSTT(wavBlob, turn){
  const fd = new FormData(); fd.append('audio_file', wavBlob, `a${turn}.wav`);
  const res = await fetch('/api/simulation/stt', {method:'POST', body:fd});
  let line;
  try{
    const data = await res.json();
    if(!data.success){
      line = `A${turn}: (STT 실패: ${data.error||'unknown'})`;
      show('STT 실패: '+(data.error||'unknown'));
    }else{
      const tx = (data.transcript||'').trim();
      line = `A${turn}: ${tx||'(빈 텍스트)'}`;
      show(`A${turn} STT 완료`);
    }
  }catch(e){
    line = `A${turn}: (STT 응답 파싱 실패: ${e})`;
    show('STT 응답 파싱 실패: '+e);
  }
  appendLine(line);
}

async function analyze(){
  const t = document.getElementById('tx').value.trim();
  if(!t){ alert('대화 텍스트가 없습니다.'); return; }
  show('분석 중…');
  const res = await fetch('/api/simulation/analyze',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({transcript:t})
  });
  const data = await res.json();
  if(!res.ok){ show('에러: '+(data.detail||res.statusText)); return; }

  const pretty = JSON.stringify(data.llm, null, 2);
  show(
`위험도: ${data.risk}
점수: ${data.score}

[요약 설명]
- 왜 위험한가: ${data.explanation}
- 다음에 이렇게 하자: ${data.feedback}

[LLM 전체 JSON 원문]
${pretty}`
  );
}
</script>
""")

# 메인 라우터
router = APIRouter()
router.include_router(api_router)
router.include_router(web_router)
