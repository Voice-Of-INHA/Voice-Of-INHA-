"use client";

import { useEffect, useState, useRef } from "react";
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

// WebKit AudioContext 타입 정의(사파리 대응)
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// VAD (Voice Activity Detection) 모듈
const VoiceActivityDetector = {
  VOLUME_THRESHOLD: 20, // 임계값
  SILENCE_DURATION: 2000, // 2초
  analyser: null as AnalyserNode | null,
  dataArray: null as Uint8Array | null,
  isInitialized: false,

  init(audioContext: AudioContext, source: MediaStreamAudioSourceNode) {
    try {
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;
      source.connect(this.analyser);
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      this.isInitialized = true;
      console.log("VAD 초기화 완료:", { bufferLength, fftSize: this.analyser.fftSize });
    } catch (error) {
      console.error("VAD 초기화 실패:", error);
      this.isInitialized = false;
    }
  },

  getVolume(): number {
    if (!this.isInitialized || !this.analyser || !this.dataArray) return 0;
    try {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i];
      const volume = sum / this.dataArray.length;
      if (Math.random() < 0.1) console.log("VAD 볼륨:", volume);
      return volume;
    } catch (e) {
      console.error("볼륨 측정 오류:", e);
      return 0;
    }
  },

  isVoiceDetected(): boolean {
    const volume = this.getVolume();
    const isDetected = volume > this.VOLUME_THRESHOLD;
    if (isDetected && Math.random() < 0.05) console.log("🎤 음성 감지!", volume);
    return isDetected;
  },

  cleanup() {
    this.analyser = null;
    this.dataArray = null;
    this.isInitialized = false;
  },
};

export default function SimulationPage() {
  const router = useRouter();
  const params = useParams();
  const scenarioId = params.id as string;

  // 시나리오 상태
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [isLoadingScenario, setIsLoadingScenario] = useState(true);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  // 플레이 상태
  const [currentRound, setCurrentRound] = useState(0);
  const [phase, setPhase] = useState<"preparing" | "playing" | "listening" | "processing" | "completed">("preparing");
  const [userResponses, setUserResponses] = useState<UserResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // 시나리오 가져오기
  useEffect(() => {
    const fetchScenario = async () => {
      try {
        setIsLoadingScenario(true);
        setScenarioError(null);
        const response = await fetch(`/api/scenarios/${scenarioId}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `시나리오를 가져올 수 없습니다: ${response.status}`);
        }
        const scenarioData = (await response.json()) as Scenario;
        setScenario(scenarioData);
      } catch (error) {
        console.error("시나리오 가져오기 실패:", error);
        setScenarioError(error instanceof Error ? error.message : "시나리오를 가져오는 중 오류가 발생했습니다.");
      } finally {
        setIsLoadingScenario(false);
      }
    };
    if (scenarioId) fetchScenario();
  }, [scenarioId]);

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
  }, []);

  // 라운드 스타트
  useEffect(() => {
    if (isAudioReady && scenario && !isLoadingScenario) {
      console.log("=== 시뮬레이션 시작 ===");
      console.log("오디오 준비 완료, 첫 번째 라운드 시작");
      console.log("시나리오 정보:", {
        id: scenario.id,
        title: scenario.title,
        totalRounds: scenario.rounds.length
      });
      startCurrentRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAudioReady, scenario, isLoadingScenario]);

  // currentRound 상태 변화 감지하여 자동으로 다음 라운드 시작
  useEffect(() => {
    if (scenario && currentRound > 0 && currentRound < scenario.rounds.length) {
      console.log(`=== currentRound 상태 변화 감지: ${currentRound} ===`);
      console.log(`자동으로 라운드 ${currentRound + 1} 시작...`);
      
      // 짧은 딜레이 후 라운드 시작
      setTimeout(() => {
        startCurrentRound();
      }, 100);
    }
  }, [currentRound, scenario]);

  // 오디오 시스템 초기화
  const initializeAudio = async () => {
    console.log("오디오 초기화 시작...");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000, // 16kHz로 설정
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
    
    // VAD 초기화는 여기서만 한 번
    const source = audioContextRef.current.createMediaStreamSource(stream);
    VoiceActivityDetector.init(audioContextRef.current, source);

    console.log("WAV 녹음 설정 완료");
  };

  // 현재 라운드 시작
  const startCurrentRound = async () => {
    if (!scenario) return;

    console.log(`=== 라운드 ${currentRound + 1} 시작 (총 ${scenario.rounds.length}라운드) ===`);
    console.log(`현재 currentRound 상태: ${currentRound}`);
    console.log(`배열 인덱스: ${currentRound}, 실제 라운드 번호: ${currentRound + 1}`);

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
      startListening();
    };
    
    audio.onerror = (e) => {
      console.error("오디오 재생 실패:", e);
      alert("오디오를 재생할 수 없습니다. 리스닝으로 바로 진행합니다.");
      startListening();
    };

    try {
      await audio.play();
      console.log(`라운드 ${currentRound + 1} 오디오 재생 시작`);
    } catch (e) {
      console.error("오디오 재생 오류:", e);
      // 자동재생 제한 등의 경우 바로 리스닝으로 진행
      console.log("오디오 자동재생 실패, 리스닝으로 바로 진행");
      startListening();
    }
  };

  // 리스닝 시작
  const startListening = () => {
    console.log("음성 인식 시작");
    setPhase("listening");
    if (!VoiceActivityDetector.isInitialized) {
      console.error("VAD가 초기화되지 않음");
      return;
    }

    try {
      // WAV 직접 녹음 시작
      startWavRecording();
      console.log("WAV 녹음 시작됨");
    } catch (error) {
      console.error("녹음 시작 실패:", error);
      return;
    }

    // VAD 루프
    vadIntervalRef.current = setInterval(() => {
      const isVoice = VoiceActivityDetector.isVoiceDetected();
      if (isVoice) {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            console.log("침묵 감지, 녹음 중단");
            stopListening();
          }, VoiceActivityDetector.SILENCE_DURATION);
        }
      }
    }, 100);

    // 하드 타임아웃(안전장치)
    setTimeout(() => {
      if ((window as any).currentWavRecording) {
        console.log("타임아웃 도달, 녹음 중단");
        stopListening();
      }
    }, 50_000);
  };

  // 리스닝 중단
  const stopListening = () => {
    setPhase("processing");
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // MediaRecorder 녹음 중단
    if ((window as any).currentWavRecording) {
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
  };

  // 녹음 완료 → STT
  const handleRecordingComplete = async (audioBlob: Blob) => {
    try {
      setIsLoading(true);
      const fileName = `round_${currentRound + 1}.wav`;

      const formData = new FormData();
      formData.append("audio_file", audioBlob, fileName);
      formData.append("round", String(currentRound + 1));

      console.log(`라운드 ${currentRound + 1} STT 요청 (POST)`);
      const res = await fetch("/api/simulation/stt", { 
        method: "POST", 
        body: formData 
      });

      if (!res.ok) {
        throw new Error(`STT POST 실패 (status ${res.status})`);
      }

      const sttResult = await res.json();
      if (!sttResult?.success) {
        throw new Error(sttResult?.error || "STT POST 실패");
      }

      console.log(`라운드 ${currentRound + 1} POST 완료, transcript:`, sttResult.transcript);
      
      // POST 완료 후 transcript를 받을 때까지 폴링
      await waitForTranscript(currentRound + 1);

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
  };

  // transcript를 받을 때까지 대기하는 함수
  const waitForTranscript = async (round: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 60; // 최대 60초 대기

      const checkTranscript = async () => {
        try {
          attempts++;
          console.log(`라운드 ${round} transcript 확인 중... (${attempts}/${maxAttempts})`);
          
          const getResponse = await fetch(`/api/simulation/stt?round=${round}`, {
            method: "GET",
            cache: "no-cache" // 캐시 방지
          });
          
          if (!getResponse.ok) {
            throw new Error(`transcript GET 실패: ${getResponse.status}`);
          }
          
          const getResult = await getResponse.json();
          
          if (getResult.success && getResult.transcript) {
            console.log(`라운드 ${round} transcript 받음:`, getResult.transcript);
            
            // transcript를 받았으므로 userResponses에 저장
            const userResponse: UserResponse = {
              round: round,
              audioBlob: new Blob(), // 실제로는 wavBlob을 저장할 수 있음
              transcription: getResult.transcript,
            };
            
            setUserResponses((prev) => [...prev, userResponse]);
            
            // 다음 라운드로 진행
            const nextRound = round + 1;
            console.log(`현재 라운드: ${round}, 다음 라운드: ${nextRound}, 총 라운드: ${scenario!.rounds.length}`);
            
            if (nextRound <= scenario!.rounds.length) {
              console.log(`라운드 ${nextRound} 시작 예정...`);
              
              // currentRound 상태만 업데이트하면 useEffect가 자동으로 다음 라운드 시작
              setCurrentRound(nextRound - 1); // 배열 인덱스는 0부터 시작
              console.log(`currentRound 상태 업데이트: ${nextRound - 1}`);
            } else {
              // 모든 라운드 완료시 분석 시작
              console.log("모든 라운드 완료! 최종 분석 시작...");
              analyzeAllResponses();
            }
            
            resolve();
          } else {
            // transcript가 아직 준비되지 않음
            if (attempts >= maxAttempts) {
              throw new Error(`transcript 대기 시간 초과 (${maxAttempts}초)`);
            }
            
            // 1초 후 다시 시도
            setTimeout(checkTranscript, 1000);
          }
        } catch (error) {
          console.error(`라운드 ${round} transcript 확인 실패:`, error);
          reject(error);
        }
      };
      
      // 즉시 첫 번째 확인 시작
      checkTranscript();
    });
  };

  // 모든 응답을 수집하여 분석하는 함수
  const analyzeAllResponses = async () => {
    if (!scenario) return;
    
    try {
      setPhase("processing");
      setIsLoading(true);

      console.log("최종 분석을 위해 모든 응답 수집 중...");
      
      // 모든 라운드 응답을 GET으로 한번에 가져오기
      const allResponsesRes = await fetch("/api/simulation/stt", {
        method: "GET",
        cache: "no-cache"
      });
      
      if (!allResponsesRes.ok) {
        throw new Error(`모든 응답 조회 실패: ${allResponsesRes.status}`);
      }
      
      const allResponsesData = await allResponsesRes.json();
      console.log("모든 응답 데이터:", allResponsesData);

      if (!allResponsesData.success || !allResponsesData.responses) {
        throw new Error("응답 데이터가 올바르지 않습니다.");
      }

      // Q&A 형태로 transcript 생성
      const transcript = scenario.rounds
        .map((round, index) => {
          const roundNumber = index + 1;
          const userResponse = allResponsesData.responses.find(
            (r: any) => r.round === roundNumber
          );
          const answer = userResponse?.transcript || "[응답 없음]";
          
          return `Q${roundNumber}: ${round.question}\nA${roundNumber}: ${answer}`;
        })
        .join("\n\n");

      console.log("최종 분석용 transcript:", transcript);

      // /api/simulation/analyze에 POST 요청
      const analysisRes = await fetch("/api/simulation/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transcript,
          scenario_id: scenario.id,
          scenario_title: scenario.title
        }),
      });

      if (!analysisRes.ok) {
        throw new Error(`분석 요청 실패: ${analysisRes.status}`);
      }
      
      const analysisResult = await analysisRes.json();
      console.log("최종 분석 결과:", analysisResult);

      // 결과를 sessionStorage에 저장
      const finalResult = {
        scenario: {
          id: scenario.id,
          title: scenario.title,
          rounds: scenario.rounds
        },
        userResponses: allResponsesData.responses,
        analysis: analysisResult.analysis,
        timestamp: new Date().toISOString()
      };
      
      sessionStorage.setItem("simulationResult", JSON.stringify(finalResult));

      setPhase("completed");
      
      // 결과 페이지로 이동
      setTimeout(() => {
        router.push("/simulation/results");
      }, 1000);

    } catch (error) {
      console.error("최종 분석 실패:", error);
      alert(`분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      setPhase("preparing");
    } finally {
      setIsLoading(false);
    }
  };

  // WAV 녹음 시작
  const startWavRecording = () => {
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
    ;(window as any).currentWavRecording = {
      audioData,
      processor: scriptProcessor,
      source,
      sampleRate: audioContext.sampleRate
    }
  }

  // WAV 녹음 중단
  const stopWavRecording = (): Blob | null => {
    const recording = (window as any).currentWavRecording
    if (!recording) return null
    
    try {
      recording.source.disconnect()
      recording.processor.disconnect()
      
      // WAV 파일 생성
      const wavBuffer = createWavBuffer(recording.audioData, recording.sampleRate)
      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' })
      
      // 정리
      ;(window as any).currentWavRecording = null
      
      return wavBlob
    } catch (error) {
      console.error('WAV 녹음 중단 실패:', error)
      return null
    }
  }

  // WAV 버퍼 생성
  const createWavBuffer = (audioData: number[], sampleRate: number): ArrayBuffer => {
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
  }

  // 정리
  const cleanup = () => {
    console.log("오디오 정리 시작");
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ((window as any).currentWavRecording) {
      (window as any).currentWavRecording = null;
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
                  {Math.min(currentRound, scenario.rounds.length)} / {scenario.rounds.length}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${(Math.min(currentRound, scenario.rounds.length) / scenario.rounds.length) * 100}%`,
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
                    <p className="text-gray-400 text-sm">말씀이 끝나면 자동으로 다음 단계로 진행됩니다</p>
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
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
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

            <div className="mt-8 text-center">
              <p className="text-gray-500 text-sm">이 시뮬레이션은 보이스피싱 대응 능력 향상을 위한 연습입니다.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}