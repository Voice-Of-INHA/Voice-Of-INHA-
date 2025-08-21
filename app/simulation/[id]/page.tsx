"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

// 인터페이스 정의
interface Round {
  round: number;
  question: string;
  audio_url: string;
}

interface Scenario {
  id: number;
  title: string;
  rounds: Round[];
  guideline: string;
}

interface UserResponse {
  round: number;
  audioBlob: Blob;
  transcription?: string;
}

interface TranscriptResponse {
  round: number;
  transcript: string;
}

interface AllResponsesData {
  success: boolean;
  responses: TranscriptResponse[];
}

interface AnalysisResult {
  analysis: string;
}

interface WavRecording {
  audioData: number[];
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  sampleRate: number;
}

// WebKit AudioContext 타입 정의(사파리 대응)
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    currentWavRecording?: WavRecording | null;
  }
}

// 개선된 VAD (Voice Activity Detection) 모듈
const VoiceActivityDetector = {
  // 조정된 임계값들
  VOLUME_THRESHOLD: 15, // 더 낮은 임계값으로 민감도 증가
  SILENCE_DURATION: 1500, // 1.5초로 단축
  MIN_SPEECH_DURATION: 500, // 최소 발화 시간 (0.5초)
  
  analyser: null as AnalyserNode | null,
  dataArray: null as Uint8Array | null,
  isInitialized: false,
  
  // 음성 상태 추적
  lastVoiceTime: 0,
  speechStartTime: 0,
  isSpeaking: false,
  volumeHistory: [] as number[],
  
  init(audioContext: AudioContext, source: MediaStreamAudioSourceNode) {
    try {
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 512; // 더 세밀한 분석을 위해 증가
      this.analyser.smoothingTimeConstant = 0.8; // 더 부드러운 평활화
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;
      
      source.connect(this.analyser);
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      this.isInitialized = true;
      
      // 상태 초기화
      this.lastVoiceTime = 0;
      this.speechStartTime = 0;
      this.isSpeaking = false;
      this.volumeHistory = [];
      
      console.log("개선된 VAD 초기화 완료:", { 
        bufferLength, 
        fftSize: this.analyser.fftSize,
        smoothingTimeConstant: this.analyser.smoothingTimeConstant
      });
    } catch (error) {
      console.error("VAD 초기화 실패:", error);
      this.isInitialized = false;
    }
  },

  getVolume(): number {
    if (!this.isInitialized || !this.analyser || !this.dataArray) return 0;
    
    try {
      
      // 더 정교한 볼륨 계산 (RMS 방식)
      let sum = 0;
      let count = 0;
      
      // 중간 주파수 대역에 집중 (인간 음성 주파수)
      const start = Math.floor(this.dataArray.length * 0.1);
      const end = Math.floor(this.dataArray.length * 0.8);
      
      for (let i = start; i < end; i++) {
        const value = this.dataArray[i];
        sum += value * value;
        count++;
      }
      
      const rms = Math.sqrt(sum / count);
      
      // 볼륨 히스토리 관리 (최근 10개 값)
      this.volumeHistory.push(rms);
      if (this.volumeHistory.length > 10) {
        this.volumeHistory.shift();
      }
      
      // 평균 볼륨 계산
      const avgVolume = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;
      
      return avgVolume;
    } catch (e) {
      console.error("볼륨 측정 오류:", e);
      return 0;
    }
  },

  isVoiceDetected(): boolean {
    const currentTime = Date.now();
    const volume = this.getVolume();
    const isVoice = volume > this.VOLUME_THRESHOLD;
    
    if (isVoice) {
      this.lastVoiceTime = currentTime;
      
      if (!this.isSpeaking) {
        this.speechStartTime = currentTime;
        this.isSpeaking = true;
        console.log("🎤 음성 감지 시작!", { volume, threshold: this.VOLUME_THRESHOLD });
      }
    }
    
    // 음성이 감지되지 않고 일정 시간이 지났다면
    if (!isVoice && this.isSpeaking) {
      const silenceDuration = currentTime - this.lastVoiceTime;
      const speechDuration = this.lastVoiceTime - this.speechStartTime;
      
      if (silenceDuration > this.SILENCE_DURATION && speechDuration > this.MIN_SPEECH_DURATION) {
        this.isSpeaking = false;
        console.log("🔇 음성 종료 감지!", { 
          silenceDuration, 
          speechDuration,
          minSpeechDuration: this.MIN_SPEECH_DURATION,
          silenceThreshold: this.SILENCE_DURATION
        });
        return false;
      }
    }
    
    return this.isSpeaking;
  },

  // 음성 종료 체크 (별도 메서드)
  checkSpeechEnd(): boolean {
    if (!this.isSpeaking) return false;
    
    const currentTime = Date.now();
    const silenceDuration = currentTime - this.lastVoiceTime;
    const speechDuration = this.lastVoiceTime - this.speechStartTime;
    
    const shouldEnd = silenceDuration > this.SILENCE_DURATION && speechDuration > this.MIN_SPEECH_DURATION;
    
    if (shouldEnd) {
      this.isSpeaking = false;
      console.log("✅ 음성 종료 확정!", { 
        silenceDuration, 
        speechDuration,
        totalSpeechTime: speechDuration
      });
    }
    
    return shouldEnd;
  },

  reset() {
    this.lastVoiceTime = 0;
    this.speechStartTime = 0;
    this.isSpeaking = false;
    this.volumeHistory = [];
    console.log("VAD 상태 리셋");
  },

  cleanup() {
    this.analyser = null;
    this.dataArray = null;
    this.isInitialized = false;
    this.reset();
  },
};

export default function SimulationPage() {
  const router = useRouter();
  const params = useParams();
  const scenarioId = params.id as string;

  // 더미 데이터 사용
  const dummyScenario: Scenario = {
    id: 1,
    title: "검찰/경찰 사칭",
    rounds: [
      {
        round: 1,
        question: "안녕하세요. 서울 지방 검찰청 김종의 수사관입니다. 현재 본인 명의로 대포통장이 개설되어 연락드렸습니다. 김종의씨 맞으신가요?",
        audio_url: "https://voiceofinha-dev-bucket.s3.ap-northeast-2.amazonaws.com/scenario/%E1%84%80%E1%85%A5%E1%86%B7%E1%84%8E%E1%85%A1%E1%86%AF%E1%84%8E%E1%85%A5%E1%86%BC1.mp3"
      },
      {
        round: 2,
        question: "예, 지금 본인 명의로 된 대포통장이 발견되었으니, 빨리 조취를 취해야 합니다…",
        audio_url: "https://voiceofinha-dev-bucket.s3.ap-northeast-2.amazonaws.com/scenario/%E1%84%80%E1%85%A5%E1%86%B7%E1%84%8E%E1%85%A1%E1%86%AF%E1%84%8E%E1%85%A5%E1%86%BC2.mp3"
      },
      {
        round: 3,
        question: "지금 저희 검찰청 홈페이지에 들어가셔서 이름과 주민번호를 입력하면…",
        audio_url: "https://voiceofinha-dev-bucket.s3.ap-northeast-2.amazonaws.com/scenario/%E1%84%80%E1%85%A5%E1%86%B7%E1%84%8E%E1%85%A1%E1%86%AF%E1%84%8E%E1%85%A5%E1%86%BC3.mp3"
      }
    ],
    guideline: "경찰서에서는 대포통장 관련 전화를 걸지 않습니다. \n보이스피싱 범죄의 전형적인 수법 중 하나가 \"자신을 경찰, 검찰이라고 사칭하며 대포통장과 관련된 전화를 거는 것\"입니다. \n만약 경찰서나 검찰청이라고 속이는 전화를 받았다면, 해당 기관의 공식 전화번호로 직접 전화하여 사실 여부를 확인해야 합니다.\n"
  };

  // 시나리오 상태
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [isLoadingScenario, setIsLoadingScenario] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  // 플레이 상태
  const [currentRound, setCurrentRound] = useState(0);
  const [phase, setPhase] = useState<"preparing" | "playing" | "listening" | "processing" | "completed">("preparing");
  const [userResponses, setUserResponses] = useState<UserResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // 더미 시나리오 설정
  useEffect(() => {
    console.log("더미 시나리오 설정");
    setScenario(dummyScenario);
  }, []);

  // WAV 녹음 시작
  const startWavRecording = useCallback(() => {
    if (!audioContextRef.current || !streamRef.current) {
      throw new Error('오디오 컨텍스트가 초기화되지 않음')
    }

    // 녹음 데이터 초기화
    recordedChunksRef.current = [];

    // AudioContext 설정
    const audioContext = audioContextRef.current;
    const source = audioContext.createMediaStreamSource(streamRef.current);

    // ScriptProcessorNode 설정
    const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    
    const audioData: number[] = []
    
    scriptProcessor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      for (let i = 0; i < input.length; i++) {
        audioData.push(input[i])
      }
    }
    
    source.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)
    
    // 녹음 데이터 저장
    window.currentWavRecording = {
      audioData,
      processor: scriptProcessor,
      source,
      sampleRate: audioContext.sampleRate
    }

    console.log("WAV 녹음 시작");
  }, []);

  // WAV 녹음 중단
  const stopWavRecording = useCallback((): Blob | null => {
    const recording = window.currentWavRecording
    if (!recording) return null
    
    try {
      recording.source.disconnect()
      recording.processor.disconnect()
      
      // WAV 파일 생성
      const wavBuffer = createWavBuffer(recording.audioData, recording.sampleRate)
      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' })
      
      // 정리
      window.currentWavRecording = null
      
      console.log("WAV 녹음 중단, 파일 크기:", wavBlob.size);
      return wavBlob
    } catch (error) {
      console.error('WAV 녹음 중단 실패:', error)
      return null
    }
  }, []);

  // WAV 버퍼 생성
  const createWavBuffer = useCallback((audioData: number[], sampleRate: number): ArrayBuffer => {
    const length = audioData.length
    const buffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(buffer)
    
    // WAV 헤더 작성
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }
    
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + length * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true) // 모노
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, length * 2, true)
    
    // 오디오 데이터 작성
    let offset = 44
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
      offset += 2
    }
    
    return buffer
  }, []);

  // 모든 응답을 수집하여 분석하는 함수 (더미 구현)
  const analyzeAllResponses = useCallback(async () => {
    if (!scenario) return;
    
    try {
      setPhase("processing");
      setIsLoading(true);

      console.log("최종 분석 중... (더미 구현)");
      
      // 더미 분석 결과
      const dummyAnalysis = `
## 시뮬레이션 결과 분석

**시나리오**: ${scenario.title}

**총 라운드**: ${scenario.rounds.length}
**완료된 응답**: ${userResponses.length}

### 응답 분석
${userResponses.map((r, idx) => `
**라운드 ${r.round}**
- 응답: ${r.transcription || "[음성 변환 완료]"}
- 상태: ✅ 완료
`).join('\n')}

### 종합 평가
보이스피싱 대응 능력이 향상되었습니다. 
실제 상황에서는 즉시 전화를 끊고 공식 기관에 확인 전화를 하시기 바랍니다.

**추천 행동요령**:
1. 검찰/경찰을 사칭하는 전화는 즉시 끊기
2. 개인정보 절대 제공 금지  
3. 공식 기관 번호로 직접 확인
4. 가족/지인과 상의하기
      `;

      // 더미 결과를 sessionStorage에 저장
      const finalResult = {
        scenario: {
          id: scenario.id,
          title: scenario.title,
          rounds: scenario.rounds
        },
        userResponses: userResponses,
        analysis: dummyAnalysis,
        timestamp: new Date().toISOString()
      };
      
      sessionStorage.setItem("simulationResult", JSON.stringify(finalResult));

      setPhase("completed");
      
      // 결과 페이지로 이동
      setTimeout(() => {
        router.push("/simulation/results");
      }, 2000);

    } catch (error) {
      console.error("최종 분석 실패:", error);
      alert(`분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      setPhase("preparing");
    } finally {
      setIsLoading(false);
    }
  }, [scenario, userResponses, router]);

  // 녹음 완료 → STT (더미 구현)
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    try {
      setIsLoading(true);
      console.log(`라운드 ${currentRound + 1} 음성 처리 중... (더미 STT)`);

      // 더미 STT 결과
      const dummyTranscripts = [
        "안녕하세요. 저는 그런 통장을 만든 적이 없는데요?",
        "정말 검찰청에서 전화하신 게 맞나요? 확인해보겠습니다.",
        "개인정보는 전화로 말씀드릴 수 없습니다. 직접 방문하겠습니다."
      ];

      const dummyTranscript = dummyTranscripts[currentRound] || "네, 알겠습니다.";

      // 더미 지연
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 사용자 응답 저장
      const userResponse: UserResponse = {
        round: currentRound + 1,
        audioBlob: audioBlob,
        transcription: dummyTranscript,
      };
      
      setUserResponses(prev => [...prev, userResponse]);

      // 다음 라운드로 진행
      const nextRound = currentRound + 1;
      console.log(`현재 라운드: ${currentRound + 1}, 다음 라운드: ${nextRound + 1}, 총 라운드: ${scenario!.rounds.length}`);
      
      if (nextRound < scenario!.rounds.length) {
        console.log(`라운드 ${nextRound + 1} 시작 예정...`);
        setCurrentRound(nextRound);
      } else {
        // 모든 라운드 완료시 분석 시작
        console.log("모든 라운드 완료! 최종 분석 시작...");
        await analyzeAllResponses();
      }

    } catch (error) {
      console.error("STT 처리 실패:", error);
      const msg = error instanceof Error ? error.message : "알 수 없는 오류";
      if (confirm(`음성 인식 실패: ${msg}\n다시 시도할까요?`)) {
        setPhase("listening");
        startListening();
      } else {
        setPhase("preparing");
        alert("다시 시도하려면 페이지를 새로고침하세요.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentRound, scenario, analyzeAllResponses]);

  // 리스닝 중단
  const stopListening = useCallback(() => {
    console.log("리스닝 중단");
    setPhase("processing");
    
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    // VAD 상태 리셋
    VoiceActivityDetector.reset();

    // MediaRecorder 녹음 중단
    if (window.currentWavRecording) {
      const wavBlob = stopWavRecording();
      if (wavBlob) {
        handleRecordingComplete(wavBlob);
      } else {
        console.error("WAV 녹음 중단되지 않음");
        setPhase("listening");
      }
    } else {
      console.error("WAV 녹음이 중단되지 않음");
      setPhase("listening");
    }
  }, [stopWavRecording, handleRecordingComplete]);

  // 리스닝 시작
  const startListening = useCallback(() => {
    console.log("음성 인식 시작");
    setPhase("listening");
    
    if (!VoiceActivityDetector.isInitialized) {
      console.error("VAD가 초기화되지 않음");
      return;
    }

    // VAD 상태 리셋
    VoiceActivityDetector.reset();

    try {
      // WAV 직접 녹음 시작
      startWavRecording();
      console.log("WAV 녹음 시작됨");
    } catch (error) {
      console.error("녹음 시작 실패:", error);
      return;
    }

    // 개선된 VAD 루프
    vadIntervalRef.current = setInterval(() => {
      // 음성 종료 체크
      if (VoiceActivityDetector.checkSpeechEnd()) {
        console.log("VAD: 음성 종료 감지, 녹음 중단");
        stopListening();
      }
    }, 100); // 100ms 간격으로 체크

    // 하드 타임아웃 (안전장치 - 30초)
    setTimeout(() => {
      if (window.currentWavRecording) {
        console.log("타임아웃 도달, 강제 녹음 중단");
        stopListening();
      }
    }, 30_000);
  }, [startWavRecording, stopListening]);

  // 현재 라운드 시작
  const startCurrentRound = useCallback(async () => {
    if (!scenario) return;

    console.log(`=== 라운드 ${currentRound + 1} 시작 (총 ${scenario.rounds.length}라운드) ===`);

    // 모든 라운드 완료 체크
    if (currentRound >= scenario.rounds.length) {
      console.log("모든 라운드 완료! 최종 분석 시작...");
      await analyzeAllResponses();
      return;
    }

    setPhase("playing");
    const round = scenario.rounds[currentRound];

    console.log(`라운드 ${currentRound + 1} 질문:`, round.question);
    console.log(`라운드 ${currentRound + 1} 오디오 URL:`, round.audio_url);

    const audio = new Audio(round.audio_url);
    audioRef.current = audio;

    audio.onended = () => {
      console.log(`라운드 ${currentRound + 1} 오디오 재생 완료, 리스닝 시작`);
      // 약간의 딜레이 후 리스닝 시작
      setTimeout(() => {
        startListening();
      }, 500);
    };
    
    audio.onerror = (e) => {
      console.error("오디오 재생 실패:", e);
      alert("오디오를 재생할 수 없습니다. 리스닝으로 바로 진행합니다.");
      setTimeout(() => {
        startListening();
      }, 500);
    };

    try {
      await audio.play();
      console.log(`라운드 ${currentRound + 1} 오디오 재생 시작`);
    } catch (e) {
      console.error("오디오 재생 오류:", e);
      // 자동재생 제한 등의 경우 바로 리스닝으로 진행
      console.log("오디오 자동재생 실패, 리스닝으로 바로 진행");
      setTimeout(() => {
        startListening();
      }, 500);
    }
  }, [scenario, currentRound, analyzeAllResponses, startListening]);

  // 오디오 시스템 초기화
  const initializeAudio = useCallback(async () => {
    console.log("오디오 초기화 시작...");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // AudioContext (크로스브라우저)
      const ACtor = window.AudioContext || window.webkitAudioContext!;
      audioContextRef.current = new ACtor();
      
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }
      
      // VAD 초기화
      const source = audioContextRef.current.createMediaStreamSource(stream);
      VoiceActivityDetector.init(audioContextRef.current, source);

      console.log("오디오 초기화 완료");
      return true;
    } catch (error) {
      console.error("오디오 초기화 실패:", error);
      throw error;
    }
  }, []);

  // 정리
  const cleanup = useCallback(() => {
    console.log("오디오 정리 시작");
    
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    if (window.currentWavRecording) {
      window.currentWavRecording = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    VoiceActivityDetector.cleanup();
    console.log("오디오 정리 완료");
  }, []);

  // 오디오 초기화
  useEffect(() => {
    const init = async () => {
      try {
        await initializeAudio();
        setIsAudioReady(true);
      } catch (error) {
        console.error("오디오 초기화 실패:", error);
        alert("마이크 권한이 필요합니다. 브라우저 설정을 확인해주세요.");
        setIsAudioReady(false);
      }
    };
    init();
    return () => cleanup();
  }, [initializeAudio, cleanup]);

  // 시뮬레이션 시작
  useEffect(() => {
    if (isAudioReady && scenario && currentRound === 0) {
      console.log("=== 시뮬레이션 시작 ===");
      console.log("시나리오 정보:", {
        id: scenario.id,
        title: scenario.title,
        totalRounds: scenario.rounds.length
      });
      
      // 약간의 딜레이 후 시작
      setTimeout(() => {
        startCurrentRound();
      }, 1000);
    }
  }, [isAudioReady, scenario, currentRound, startCurrentRound]);

  // currentRound 변화 감지하여 다음 라운드 시작
  useEffect(() => {
    if (scenario && currentRound > 0 && currentRound < scenario.rounds.length) {
      console.log(`=== currentRound 상태 변화 감지: ${currentRound} ===`);
      console.log(`자동으로 라운드 ${currentRound + 1} 시작...`);
      
      // 짧은 딜레이 후 라운드 시작
      setTimeout(() => {
        startCurrentRound();
      }, 1000);
    }
  }, [currentRound, scenario, startCurrentRound]);

  // 수동 테스트 버튼들 (개발용)
  const handleManualNext = () => {
    if (scenario && currentRound < scenario.rounds.length - 1) {
      console.log("수동으로 다음 라운드로 진행");
      setCurrentRound(prev => prev + 1);
    } else if (scenario && currentRound === scenario.rounds.length - 1) {
      console.log("수동으로 시뮬레이션 완료");
      analyzeAllResponses();
    }
  };

  const handleManualStop = () => {
    console.log("수동으로 리스닝 중단");
    if (phase === "listening") {
      stopListening();
    }
  };

  const getPhaseMessage = () => {
    switch (phase) {
      case "preparing":
        return "시뮬레이션을 준비하고 있습니다...";
      case "playing":
        return `라운드 ${currentRound + 1}: 상대방이 말하고 있습니다...`;
      case "listening":
        return "🎤 당신의 응답을 기다리고 있습니다. 말씀해주세요!";
      case "processing":
        return "응답을 처리하고 있습니다...";
      case "completed":
        return "시뮬레이션이 완료되었습니다!";
      default:
        return "";
    }
  };

  const getPhaseIcon = () => {
    switch (phase) {
      case "preparing":
        return "⚙️";
      case "playing":
        return "📞";
      case "listening":
        return "🎤";
      case "processing":
        return "⏳";
      case "completed":
        return "✅";
      default:
        return "";
    }
  };

  const getVolumeLevel = () => {
    if (VoiceActivityDetector.isInitialized) {
      const volume = VoiceActivityDetector.getVolume();
      const percentage = Math.min(100, (volume / 50) * 100); // 50을 최대값으로 가정
      return percentage;
    }
    return 0;
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">보이스피싱 시뮬레이션</h1>

          {isLoadingScenario && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
              <p className="text-gray-400">시나리오를 불러오는 중...</p>
            </div>
          )}

          {scenarioError && (
            <div className="text-center">
              <p className="text-red-400 mb-4">⚠️ {scenarioError}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
              >
                다시 시도
              </button>
            </div>
          )}

          {scenario && !isLoadingScenario && !scenarioError && (
            <>
              <h2 className="text-xl text-gray-300 mb-4">{scenario.title}</h2>
              <div className="flex items-center justify-center space-x-2">
                <span className="text-4xl">{getPhaseIcon()}</span>
                <p className="text-lg text-gray-400">{getPhaseMessage()}</p>
              </div>
            </>
          )}
        </div>

        {!scenario || isLoadingScenario || scenarioError ? (
          <div className="text-center">
            {isLoadingScenario && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
                <p className="text-gray-400">시나리오를 준비하고 있습니다...</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 진행 상황 */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400">진행 상황</span>
                <span className="text-white">
                  {Math.min(currentRound + 1, scenario.rounds.length)} / {scenario.rounds.length}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${((currentRound + 1) / scenario.rounds.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* 현재 라운드 */}
            {currentRound < scenario.rounds.length && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-8">
                <div className="flex items-center space-x-3 mb-4">
                  <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    라운드 {currentRound + 1}
                  </span>
                </div>

                {phase === "playing" && (
                  <div className="text-gray-300">
                    <p className="mb-2">📞 상대방:</p>
                    <p className="text-lg italic border-l-4 border-red-500 pl-4">
                      &ldquo;{scenario.rounds[currentRound].question}&rdquo;
                    </p>
                  </div>
                )}

                {phase === "listening" && (
                  <div className="text-center">
                    <div className="animate-pulse mb-4">
                      <div className="w-16 h-16 bg-red-600 rounded-full mx-auto flex items-center justify-center">
                        <span className="text-2xl">🎤</span>
                      </div>
                    </div>
                    <p className="text-white text-lg mb-2">음성을 감지하고 있습니다</p>
                    <p className="text-gray-400 text-sm mb-4">말씀이 끝나면 자동으로 다음 단계로 진행됩니다</p>
                    
                    {/* 음성 레벨 표시 */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <p className="text-gray-400 text-sm mb-2">음성 레벨</p>
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all duration-200 ${
                            getVolumeLevel() > VoiceActivityDetector.VOLUME_THRESHOLD 
                              ? 'bg-green-500' 
                              : 'bg-gray-600'
                          }`}
                          style={{ width: `${Math.min(100, getVolumeLevel())}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>조용함</span>
                        <span>임계값: {VoiceActivityDetector.VOLUME_THRESHOLD}</span>
                        <span>큼</span>
                      </div>
                    </div>

                    {/* 테스트 버튼들 */}
                    <div className="mt-4 space-x-2">
                      <button
                        onClick={handleManualStop}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm"
                      >
                        수동 중단
                      </button>
                      <button
                        onClick={handleManualNext}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                      >
                        다음 라운드
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 로딩 */}
            {isLoading && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
                <p className="text-gray-400">처리 중...</p>
              </div>
            )}

            {/* 완료된 라운드 미리보기 */}
            {userResponses.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-8">
                <h3 className="text-lg font-semibold text-white mb-4">완료된 응답</h3>
                <div className="space-y-3">
                  {userResponses.map((r, idx) => (
                    <div key={idx} className="bg-gray-800 p-3 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">라운드 {r.round}</span>
                        <span className="text-green-400">✓</span>
                      </div>
                      <p className="text-gray-300 text-sm">{r.transcription || "음성 변환 중..."}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 디버그 정보 */}
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-8">
                <h3 className="text-sm font-semibold text-white mb-2">디버그 정보</h3>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>현재 페이즈: {phase}</p>
                  <p>현재 라운드: {currentRound}</p>
                  <p>오디오 준비: {isAudioReady ? '✅' : '❌'}</p>
                  <p>VAD 초기화: {VoiceActivityDetector.isInitialized ? '✅' : '❌'}</p>
                  <p>음성 감지 중: {VoiceActivityDetector.isSpeaking ? '✅' : '❌'}</p>
                  <p>현재 볼륨: {VoiceActivityDetector.isInitialized ? VoiceActivityDetector.getVolume().toFixed(1) : 'N/A'}</p>
                </div>
              </div>
            )}

            <div className="mt-8 text-center">
              <p className="text-gray-500 text-sm">이 시뮬레이션은 보이스피싱 대응 능력 향상을 위한 연습입니다.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}