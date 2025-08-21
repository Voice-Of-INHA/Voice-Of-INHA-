'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface STTResponse {
  success: boolean;
  transcript?: string;
  error?: string;
}

interface AnalyzeResponse {
  risk: string;
  score: number;
  explanation: string;
  feedback: string;
  llm: {
    score: number;
    risk_level: string;
    pattern_summary: string;
    good_signals: string[];
    risk_signals: string[];
    coaching: {
      why_risky: string;
      do_next_time: string;
      principles: string[];
      better_answer_templates: {
        personal_info_request: string;
        money_or_transfer: string;
        app_or_link_install: string;
      };
    };
    overall_comment: string;
  };
}

interface Scenario {
  id: string;
  title: string;
  description?: string;
  questions?: string[];
}

type GameState = 'idle' | 'loading_scenarios' | 'scenario_selection' | 'playing_question' | 'waiting_for_speech' | 'recording' | 'processing' | 'completed';

export default function AutoSimulationPage() {
  const [transcript, setTranscript] = useState<string>('');
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [status, setStatus] = useState<string>('시작 준비됨');
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [currentQuestions, setCurrentQuestions] = useState<string[]>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const vadTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 기본 질문 (백엔드에서 못 가져올 경우 폴백)
  const DEFAULT_QUESTIONS = [
    "여기는 검찰청입니다. 고객님 명의로 범죄 계좌가 발견됐습니다. 계좌번호를 알려주세요.",
    "안전을 위해 주민등록번호도 필요합니다. 지금 불러주세요.",
    "즉시 지정 계좌로 송금하지 않으면 체포됩니다."
  ];

  // VAD 설정
  const VAD_CONFIG = {
    silenceThreshold: 20,
    speechThreshold: 30,
    silenceDuration: 2000,
    maxRecordingTime: 20000,
    vadCheckInterval: 100,
    waitTimeout: 30000,
  };

  // 백엔드 헬스 체크
  const checkBackendHealth = async () => {
    try {
      console.log('백엔드 헬스 체크 시작...');
      const response = await fetch('/api/proxy?path=health');
      
      if (response.ok) {
        setBackendStatus('online');
        console.log('백엔드 연결 성공');
      } else {
        setBackendStatus('offline');
        console.log('백엔드 응답 오류:', response.status);
      }
    } catch (error) {
      console.error('백엔드 헬스 체크 실패:', error);
      setBackendStatus('offline');
    }
  };

  // 시나리오 목록 로드
  const loadScenarios = async () => {
    try {
      setGameState('loading_scenarios');
      setStatus('시나리오 목록 불러오는 중...');
      
      const response = await fetch('/api/proxy?path=scenarios');
      
      if (response.ok) {
        const data = await response.json();
        console.log('시나리오 목록 로드 성공:', data);
        setScenarios(data);
      } else {
        console.error('시나리오 목록 불러오기 실패, 기본 시나리오 사용');
        setScenarios([
          { 
            id: '1', 
            title: '검찰/경찰 사칭', 
            description: '검찰청 수사관을 사칭하여 대포통장 개설 의혹을 제기하는 시나리오',
            questions: DEFAULT_QUESTIONS
          },
          { 
            id: '2', 
            title: '대출 사기', 
            description: '저금리 대출을 미끼로 수수료를 요구하는 시나리오',
            questions: [
              "안녕하세요, 저희는 A은행 대출상담팀입니다. 특별 저금리 대출이 가능하신데 관심 있으시나요?",
              "승인을 위해 먼저 수수료 50만원을 선입금해주시면 즉시 대출이 실행됩니다.",
              "지금 바로 계좌번호를 알려주시면 대출 승인을 진행하겠습니다."
            ]
          }
        ]);
      }
      setGameState('scenario_selection');
      setStatus('시나리오를 선택해주세요');
    } catch (error) {
      console.error('시나리오 목록 불러오기 오류:', error);
      setScenarios([
        { 
          id: '1', 
          title: '검찰/경찰 사칭', 
          description: '기본 시나리오',
          questions: DEFAULT_QUESTIONS
        }
      ]);
      setGameState('scenario_selection');
      setStatus('기본 시나리오로 진행합니다');
    }
  };

  // 음성 합성 초기화
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const voices = speechSynthesis.getVoices();
        console.log('음성 목록:', voices.map(v => `${v.name} (${v.lang})`));
      };
      
      speechSynthesis.addEventListener('voiceschanged', loadVoices);
      loadVoices();
      
      return () => {
        speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, []);

  // 컴포넌트 마운트시 백엔드 상태 확인
  useEffect(() => {
    checkBackendHealth();
  }, []);

  // WebM을 WAV로 변환
  const convertWebMToWAV = async (webmBlob: Blob, targetSampleRate: number = 16000): Promise<Blob> => {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const frames = Math.ceil(audioBuffer.duration * targetSampleRate);
    const offlineContext = new OfflineAudioContext(1, frames, targetSampleRate);
    const source = offlineContext.createBufferSource();
    
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    
    const renderedBuffer = await offlineContext.startRendering();
    audioContext.close();
    
    return new Blob([bufferToWav(renderedBuffer)], { type: 'audio/wav' });
  };

  // AudioBuffer를 WAV 형식으로 변환
  const bufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    let offset = 44;
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return arrayBuffer;
  };

  // 질문 재생
  const playQuestion = async (questionNumber: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('음성 합성을 지원하지 않는 브라우저입니다.'));
        return;
      }

      const question = currentQuestions[questionNumber - 1] || DEFAULT_QUESTIONS[questionNumber - 1];
      console.log(`질문 재생 Q${questionNumber}: ${question}`);
      setStatus(`Q${questionNumber} 재생 중...`);
      
      const questionLine = `Q${questionNumber}: ${question}`;
      setTranscript(prev => prev + (prev ? '\n' : '') + questionLine + '\n');

      speechSynthRef.current = new SpeechSynthesisUtterance(question);
      
      const voices = speechSynthesis.getVoices();
      const koreanVoice = voices.find(voice => 
        voice.lang.includes('ko') || voice.name.includes('Korean')
      );
      
      if (koreanVoice) {
        speechSynthRef.current.voice = koreanVoice;
      }
      
      speechSynthRef.current.rate = 0.9;
      speechSynthRef.current.pitch = 1.0;
      speechSynthRef.current.volume = 0.8;
      
      speechSynthRef.current.onend = () => {
        console.log(`질문 완료 Q${questionNumber}`);
        setStatus(`Q${questionNumber} 완료. 답변을 기다립니다...`);
        resolve();
      };
      
      speechSynthRef.current.onerror = (event) => {
        console.error(`질문 실패 Q${questionNumber}:`, event.error);
        setStatus(`음성 재생 실패: ${event.error}`);
        reject(new Error(`음성 재생 실패: ${event.error}`));
      };
      
      speechSynthesis.speak(speechSynthRef.current);
    });
  };

  // VAD 시작
  const startVAD = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!analyserRef.current) {
        reject(new Error('분석기가 초기화되지 않았습니다.'));
        return;
      }

      console.log(`VAD 시작 - 음성 감지 대기 중...`);
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let speechDetected = false;
      let lastSpeechTime = 0;
      let isSpeaking = false;
      let vadStartTime = Date.now();
      let consecutiveSilenceCount = 0;
      let wasInterrupted = false;

      const checkVAD = () => {
        if (!analyserRef.current || gameState === 'processing' || gameState === 'completed') {
          resolve();
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const now = Date.now();

        if ((now - vadStartTime) % 3000 < VAD_CONFIG.vadCheckInterval) {
          console.log(`VAD 음량=${average.toFixed(1)}, 상태=${isSpeaking ? '말함' : '대기'}, 경과=${Math.floor((now - vadStartTime)/1000)}s`);
        }

        if (average > VAD_CONFIG.speechThreshold) {
          if (!isSpeaking) {
            isSpeaking = true;
            speechDetected = true;
            consecutiveSilenceCount = 0;
            wasInterrupted = false;
            console.log(`음성 감지 - 녹음 시작! 음량=${average.toFixed(1)}`);
            setStatus(`음성 감지됨! 녹음 중... (${average.toFixed(1)})`);
            setGameState('recording');
            startRecording();
          }
          lastSpeechTime = now;
          consecutiveSilenceCount = 0;
        } 
        else if (average < VAD_CONFIG.silenceThreshold && isSpeaking) {
          const silenceDuration = now - lastSpeechTime;
          consecutiveSilenceCount++;
          
          if (consecutiveSilenceCount > 20 && silenceDuration < 1000 && !wasInterrupted) {
            wasInterrupted = true;
            console.log(`목소리 끊김 감지 - 연속 침묵: ${consecutiveSilenceCount}`);
            setStatus(`목소리가 끊긴 것 같습니다. 다시 말씀해 주세요... (${Math.floor(silenceDuration/100)/10}s)`);
          }
          
          if (silenceDuration > VAD_CONFIG.silenceDuration) {
            console.log(`침묵 감지 - ${silenceDuration}ms 침묵으로 녹음 종료`);
            if (wasInterrupted) {
              console.log(`주의: 목소리가 끊긴 상태로 녹음이 종료되었습니다.`);
              setStatus('목소리가 끊긴 상태로 녹음이 종료되었습니다. 처리 중...');
            } else {
              setStatus('침묵 감지됨. 녹음 종료 중...');
            }
            isSpeaking = false;
            stopRecording();
            resolve();
            return;
          } else {
            const remainingTime = (VAD_CONFIG.silenceDuration - silenceDuration) / 1000;
            if (wasInterrupted) {
              setStatus(`목소리 끊김 - ${remainingTime.toFixed(1)}초 후 종료됩니다`);
            } else {
              setStatus(`침묵 ${Math.floor(silenceDuration/100)/10}s/${VAD_CONFIG.silenceDuration/1000}s`);
            }
          }
        }

        if (!speechDetected && (now - vadStartTime) > VAD_CONFIG.waitTimeout) {
          console.log(`타임아웃 - ${VAD_CONFIG.waitTimeout/1000}초 대기 후 답변 없음`);
          setStatus('답변 시간 초과. 다음 질문으로...');
          const emptyAnswer = `A${currentRound}: (답변 없음 - 시간 초과)`;
          setTranscript(prev => prev + emptyAnswer + '\n');
          setTimeout(() => proceedToNextRound(), 1000);
          resolve();
          return;
        }

        if (gameState === 'waiting_for_speech' || gameState === 'recording') {
          vadTimerRef.current = setTimeout(checkVAD, VAD_CONFIG.vadCheckInterval);
        }
      };

      setStatus('말씀해 주세요... (자동으로 감지됩니다)');
      checkVAD();
    });
  }, [gameState, currentRound]);

  // 나머지 함수들 (마이크 초기화, 녹음, STT 등)은 동일하게 유지...
  const initializeMicrophone = async (): Promise<void> => {
    try {
      console.log(`마이크 초기화 - 권한 요청 중...`);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      streamRef.current = stream;
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      console.log(`마이크 초기화 완료`);
      setStatus('마이크 초기화 완료');
    } catch (error) {
      console.error(`마이크 초기화 실패:`, error);
      throw new Error(`마이크 초기화 실패: ${error}`);
    }
  };

  const startRecording = () => {
    if (!mediaRecorderRef.current) return;

    console.log(`녹음 시작 Q${currentRound}`);
    chunksRef.current = [];
    
    mediaRecorderRef.current.ondataavailable = (event) => {
      chunksRef.current.push(event.data);
    };

    mediaRecorderRef.current.onstop = async () => {
      try {
        console.log(`녹음 완료 - 총 청크: ${chunksRef.current.length}`);
        setGameState('processing');
        setStatus('음성 변환 중...');
        
        const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
        console.log(`변환 시작 WebM → WAV (${webmBlob.size} bytes)`);
        
        const wavBlob = await convertWebMToWAV(webmBlob, 16000);
        console.log(`변환 완료 WAV 크기: ${wavBlob.size} bytes`);
        
        await performAutoSTT(wavBlob, currentRound);
      } catch (error) {
        console.error(`녹음 처리 에러:`, error);
        const errorAnswer = `A${currentRound}: (처리 실패: ${error})`;
        setTranscript(prev => prev + errorAnswer + '\n');
        setStatus(`처리 실패: ${error}`);
        setTimeout(() => proceedToNextRound(), 2000);
      }
    };

    mediaRecorderRef.current.start();

    hardTimeoutRef.current = setTimeout(() => {
      if (gameState === 'recording') {
        console.log(`최대 녹음 시간 ${VAD_CONFIG.maxRecordingTime/1000}초 도달`);
        stopRecording();
      }
    }, VAD_CONFIG.maxRecordingTime);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log(`녹음 중지`);
      mediaRecorderRef.current.stop();
    }
    
    if (vadTimerRef.current) {
      clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
  };

  const performAutoSTT = async (wavBlob: Blob, questionNumber: number) => {
    const formData = new FormData();
    formData.append('audio_file', wavBlob, `a${questionNumber}.wav`);

    console.log(`자동 POST Q${questionNumber} STT 요청 - 파일 크기: ${wavBlob.size} bytes`);
    setStatus('STT 분석 중...');

    try {
      const response = await fetch('/api/simulation/stt', {
        method: 'POST',
        body: formData,
      });

      console.log(`STT 응답 Status: ${response.status} ${response.statusText}`);
      const data: STTResponse = await response.json();
      console.log(`STT 결과 Q${questionNumber}:`, data);
      
      if (data.success) {
        const transcriptText = (data.transcript || '').trim();
        const answerLine = `A${questionNumber}: ${transcriptText || '(빈 텍스트)'}`;
        setTranscript(prev => prev + answerLine + '\n');
        
        console.log(`성공 Q${questionNumber}: "${transcriptText}"`);
        setStatus(`A${questionNumber} 완료: "${transcriptText}"`);
        
        setTimeout(() => {
          proceedToNextRound();
        }, 1500);
        
      } else {
        console.error(`STT 실패 Q${questionNumber}: ${data.error}`);
        const answerLine = `A${questionNumber}: (STT 실패: ${data.error || 'unknown'})`;
        setTranscript(prev => prev + answerLine + '\n');
        setStatus(`STT 실패, 다음 질문으로...`);
        
        setTimeout(() => {
          proceedToNextRound();
        }, 2000);
      }
      
    } catch (error) {
      console.error(`STT 에러 Q${questionNumber}:`, error);
      const answerLine = `A${questionNumber}: (네트워크 오류: ${error})`;
      setTranscript(prev => prev + answerLine + '\n');
      setStatus(`네트워크 오류, 다음 질문으로...`);
      
      setTimeout(() => {
        proceedToNextRound();
      }, 2000);
    }
  };

  const proceedToNextRound = () => {
    console.log(`라운드 진행 현재: ${currentRound}/3`);
    
    if (currentRound >= 3) {
      console.log(`게임 완료 ===================`);
      console.log(`최종 결과물 전체 대화:`);
      console.log(transcript);
      console.log(`완료 3라운드 모두 완료! ===================`);
      
      setGameState('completed');
      setStatus('3라운드 완료! 분석하기 버튼을 눌러주세요.');
      cleanup();
      return;
    }

    const nextRound = currentRound + 1;
    console.log(`다음 라운드 Q${nextRound} 자동 시작`);
    
    setCurrentRound(nextRound);
    setGameState('playing_question');
    setStatus(`Q${nextRound} 준비 중...`);
    
    setTimeout(async () => {
      try {
        await playQuestion(nextRound);
        setGameState('waiting_for_speech');
        await startVAD();
      } catch (error) {
        console.error(`다음 라운드 실패 Q${nextRound}:`, error);
        setStatus(`Q${nextRound} 실패: ${error}`);
        setGameState('idle');
      }
    }, 2000);
  };

  // 시나리오 선택 후 시뮬레이션 시작
  const startSimulationWithScenario = async () => {
    if (!selectedScenario) {
      alert('시나리오를 선택해주세요!');
      return;
    }

    const scenario = scenarios.find(s => s.id === selectedScenario);
    if (scenario && scenario.questions) {
      setCurrentQuestions(scenario.questions);
    } else {
      setCurrentQuestions(DEFAULT_QUESTIONS);
    }

    try {
      console.log(`시뮬레이션 시작 - 시나리오: ${scenario?.title}`);
      setStatus('시뮬레이션 시작 중...');
      
      await initializeMicrophone();
      
      setCurrentRound(1);
      setGameState('playing_question');
      
      await playQuestion(1);
      setGameState('waiting_for_speech');
      await startVAD();
      
    } catch (error) {
      console.error(`시작 실패:`, error);
      setStatus(`시작 실패: ${error}`);
      setGameState('idle');
    }
  };

  // 정리 및 기타 함수들...
  const cleanup = () => {
    console.log(`리소스 정리 중...`);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    } catch (error) {
      console.error('AudioContext cleanup error:', error);
    }
    
    audioContextRef.current = null;
    analyserRef.current = null;
    
    if (vadTimerRef.current) {
      clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }

    if (speechSynthRef.current) {
      speechSynthesis.cancel();
      speechSynthRef.current = null;
    }
    
    mediaRecorderRef.current = null;
  };

  const stopGame = () => {
    console.log(`게임 중지 - 사용자가 중지함`);
    cleanup();
    setGameState('idle');
    setCurrentRound(0);
    setStatus('게임이 중지되었습니다.');
  };

  const performAnalysis = async () => {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) {
      alert('대화 텍스트가 없습니다.');
      return;
    }

    console.log(`최종 분석 ===================`);
    console.log(`총 결과물 전체 대화 내용:`);
    console.log(trimmedTranscript);
    console.log(`분석 요청 백엔드로 전송...`);
    
    setStatus('분석 중...');
    
    try {
      const response = await fetch('/api/simulation/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript: trimmedTranscript }),
      });

      console.log(`분석 응답 Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`분석 실패`, errorData);
        setStatus(`분석 에러: ${errorData.detail || response.statusText}`);
        return;
      }

      const data: AnalyzeResponse = await response.json();
      console.log(`분석 완료 ===================`);
      console.log(`위험도: ${data.risk}`);
      console.log(`점수: ${data.score}/100`);
      console.log(`설명: ${data.explanation}`);
      console.log(`피드백: ${data.feedback}`);
      console.log(`상세:`, data.llm);
      console.log(`전체 완료 ===================`);
      
      setAnalysisResult(data);
      setStatus('분석 완료!');
    } catch (error) {
      console.error(`분석 에러:`, error);
      setStatus(`분석 실패: ${error}`);
    }
  };

  const resetAll = () => {
    console.log(`초기화 - 모든 데이터 리셋`);
    cleanup();
    setTranscript('');
    setCurrentRound(0);
    setGameState('idle');
    setStatus('초기화 완료');
    setAnalysisResult(null);
    setSelectedScenario('');
    setCurrentQuestions([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 백엔드 상태 표시 */}
        <div className="absolute top-6 right-6 z-20">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm border ${
            backendStatus === 'online' 
              ? 'bg-green-100 border-green-600 text-green-800'
              : backendStatus === 'offline'
              ? 'bg-red-100 border-red-600 text-red-800'
              : 'bg-gray-100 border-gray-600 text-gray-800'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              backendStatus === 'online' 
                ? 'bg-green-400 animate-pulse'
                : backendStatus === 'offline'
                ? 'bg-red-400'
                : 'bg-gray-400 animate-pulse'
            }`} />
            <span className="text-sm font-medium">
              {backendStatus === 'checking' && '상태 확인 중...'}
              {backendStatus === 'online' && '서버 연결됨'}
              {backendStatus === 'offline' && '서버 연결 안됨'}
            </span>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          자동 보이스피싱 시뮬레이션
        </h1>

        {/* 시나리오 선택 화면 */}
        {gameState === 'idle' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-4">시뮬레이션 시작</h2>
              <button
                onClick={loadScenarios}
                disabled={backendStatus !== 'online'}
                className={`px-6 py-3 rounded-lg font-medium ${
                  backendStatus === 'online'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
              >
                {backendStatus === 'checking' ? '연결 확인 중...' : '시나리오 불러오기'}
              </button>
            </div>
          </div>
        )}

        {/* 로딩 화면 */}
        {gameState === 'loading_scenarios' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">시나리오 목록을 불러오는 중...</p>
            </div>
          </div>
        )}

        {/* 시나리오 선택 화면 */}
        {gameState === 'scenario_selection' && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-6">시나리오를 선택하세요</h2>
            
            <div className="space-y-4 mb-6">
              {scenarios.map((scenario) => (
                <label 
                  key={scenario.id}
                  className={`flex items-start p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                    selectedScenario === scenario.id
                      ? 'bg-blue-50 border-blue-500'
                      : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="radio"
                    name="scenario"
                    value={scenario.id}
                    checked={selectedScenario === scenario.id}
                    onChange={(e) => setSelectedScenario(e.target.value)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 mr-4 mt-1 flex items-center justify-center ${
                    selectedScenario === scenario.id
                      ? 'border-blue-500'
                      : 'border-gray-400'
                  }`}>
                    {selectedScenario === scenario.id && (
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-lg mb-1">{scenario.title}</div>
                    {scenario.description && (
                      <div className="text-sm text-gray-600">{scenario.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-4">
              <button
                onClick={startSimulationWithScenario}
                disabled={!selectedScenario}
                className={`px-6 py-3 rounded-lg font-medium ${
                  selectedScenario
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
              >
                시뮬레이션 시작
              </button>
              
              <button
                onClick={() => setGameState('idle')}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                뒤로가기
              </button>
            </div>
          </div>
        )}

        {/* 게임 진행 화면 */}
        {(gameState === 'playing_question' || gameState === 'waiting_for_speech' || gameState === 'recording' || gameState === 'processing' || gameState === 'completed') && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="mb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  gameState === 'playing_question' ? 'bg-blue-100 text-blue-800' :
                  gameState === 'waiting_for_speech' ? 'bg-yellow-100 text-yellow-800' :
                  gameState === 'recording' ? 'bg-red-100 text-red-800' :
                  gameState === 'processing' ? 'bg-purple-100 text-purple-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {gameState === 'playing_question' ? '질문 재생' :
                   gameState === 'waiting_for_speech' ? '음성 대기' :
                   gameState === 'recording' ? '녹음 중' :
                   gameState === 'processing' ? '처리 중' :
                   '완료'}
                </div>
                
                {currentRound > 0 && (
                  <div className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                    라운드: {currentRound}/3
                  </div>
                )}
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <h3 className="font-medium text-blue-900 mb-2">자동 진행 상태</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>질문 자동 재생 → 음성 자동 감지 → 자동 녹음 → 자동 POST</li>
                  <li>success: true 확인 → transcript 저장 → 자동으로 다음 라운드</li>
                  <li>3라운드 완료 → 최종 결과물 콘솔 출력 → 분석 가능</li>
                  <li>F12 → 콘솔에서 전체 과정 실시간 모니터링</li>
                </ul>
              </div>
              
              <div className="space-x-2 mb-4">
                <button
                  onClick={stopGame}
                  disabled={gameState === 'completed'}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                >
                  중지
                </button>
                
                <button
                  onClick={performAnalysis}
                  disabled={gameState !== 'completed' || !transcript.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
                >
                  분석하기
                </button>
                
                <button
                  onClick={resetAll}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  초기화
                </button>
              </div>
              
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700">
                  상태: {status}
                </p>
              </div>

              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">VAD 설정:</h3>
                <div className="text-xs text-gray-600 grid grid-cols-2 gap-2">
                  <p>• 음성 감지: {VAD_CONFIG.speechThreshold}</p>
                  <p>• 침묵 감지: {VAD_CONFIG.silenceThreshold}</p>
                  <p>• 침묵 지속: {VAD_CONFIG.silenceDuration}ms</p>
                  <p>• 최대 녹음: {VAD_CONFIG.maxRecordingTime}ms</p>
                  <p>• 응답 대기: {VAD_CONFIG.waitTimeout}ms</p>
                  <p>• 체크 간격: {VAD_CONFIG.vadCheckInterval}ms</p>
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                대화 내용 (실시간 업데이트):
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="자동 모드: 시작하면 Q1/A1, Q2/A2, Q3/A3이 자동으로 진행되어 기록됩니다."
                className="w-full h-64 p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                readOnly={gameState !== 'completed'}
              />
            </div>
          </div>
        )}

        {/* 분석 결과 */}
        {analysisResult && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">최종 분석 결과</h2>
            
            <div className="mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  analysisResult.risk === 'LOW' ? 'bg-green-100 text-green-800' :
                  analysisResult.risk === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  위험도: {analysisResult.risk}
                </div>
                <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  점수: {analysisResult.score}/100
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">왜 위험한가:</h3>
                  <p className="text-gray-700 bg-red-50 p-3 rounded">{analysisResult.explanation}</p>
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">다음에 이렇게 하자:</h3>
                  <p className="text-gray-700 bg-green-50 p-3 rounded">{analysisResult.feedback}</p>
                </div>
              </div>
            </div>
            
            <details className="mb-4">
              <summary className="cursor-pointer font-medium text-gray-900 mb-2 hover:text-blue-600">
                상세 분석 결과 보기 (클릭)
              </summary>
              
              <div className="space-y-4 mt-4 border-t pt-4">
                {analysisResult.llm.good_signals.length > 0 && (
                  <div>
                    <h4 className="font-medium text-green-700 mb-2">안전 신호:</h4>
                    <ul className="list-disc list-inside space-y-1 bg-green-50 p-3 rounded">
                      {analysisResult.llm.good_signals.map((signal, index) => (
                        <li key={index} className="text-green-700">{signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {analysisResult.llm.risk_signals.length > 0 && (
                  <div>
                    <h4 className="font-medium text-red-700 mb-2">위험 신호:</h4>
                    <ul className="list-disc list-inside space-y-1 bg-red-50 p-3 rounded">
                      {analysisResult.llm.risk_signals.map((signal, index) => (
                        <li key={index} className="text-red-700">{signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">대응 원칙:</h4>
                  <ul className="list-disc list-inside space-y-1 bg-blue-50 p-3 rounded">
                    {analysisResult.llm.coaching.principles.map((principle, index) => (
                      <li key={index} className="text-blue-700">{principle}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">개선된 답변 템플릿:</h4>
                  <div className="space-y-3 bg-purple-50 p-4 rounded">
                    <div>
                      <span className="font-medium text-purple-800">개인정보 요구 시:</span>
                      <p className="text-gray-700 italic mt-1 ml-4">"{analysisResult.llm.coaching.better_answer_templates.personal_info_request}"</p>
                    </div>
                    <div>
                      <span className="font-medium text-purple-800">송금 요구 시:</span>
                      <p className="text-gray-700 italic mt-1 ml-4">"{analysisResult.llm.coaching.better_answer_templates.money_or_transfer}"</p>
                    </div>
                    <div>
                      <span className="font-medium text-purple-800">앱/링크 설치 요구 시:</span>
                      <p className="text-gray-700 italic mt-1 ml-4">"{analysisResult.llm.coaching.better_answer_templates.app_or_link_install}"</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">전체 코멘트:</h4>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded italic">{analysisResult.llm.overall_comment}</p>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface STTResponse {
  success: boolean;
  transcript?: string;
  error?: string;
}

interface AnalyzeResponse {
  risk: string;
  score: number;
  explanation: string;
  feedback: string;
  llm: {
    score: number;
    risk_level: string;
    pattern_summary: string;
    good_signals: string[];
    risk_signals: string[];
    coaching: {
      why_risky: string;
      do_next_time: string;
      principles: string[];
      better_answer_templates: {
        personal_info_request: string;
        money_or_transfer: string;
        app_or_link_install: string;
      };
    };
    overall_comment: string;
  };
}

const QUESTIONS = {
  1: "여기는 검찰청입니다. 고객님 명의로 범죄 계좌가 발견됐습니다. 계좌번호를 알려주세요.",
  2: "안전을 위해 주민등록번호도 필요합니다. 지금 불러주세요.",
  3: "즉시 지정 계좌로 송금하지 않으면 체포됩니다."
};

type GameState = 'idle' | 'playing_question' | 'waiting_for_speech' | 'recording' | 'processing' | 'completed';

export default function CompleteAutoSTTPage() {
  const [transcript, setTranscript] = useState<string>('');
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [status, setStatus] = useState<string>('시작 준비됨');
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const vadTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // VAD 설정
  const VAD_CONFIG = {
    silenceThreshold: 20,
    speechThreshold: 30,
    silenceDuration: 2000,
    maxRecordingTime: 20000,
    vadCheckInterval: 100,
    waitTimeout: 30000,
  };

  // 음성 합성 초기화
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const voices = speechSynthesis.getVoices();
        console.log('음성 목록:', voices.map(v => `${v.name} (${v.lang})`));
      };
      
      speechSynthesis.addEventListener('voiceschanged', loadVoices);
      loadVoices();
      
      return () => {
        speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, []);

  // WebM을 WAV로 변환
  const convertWebMToWAV = async (webmBlob: Blob, targetSampleRate: number = 16000): Promise<Blob> => {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const frames = Math.ceil(audioBuffer.duration * targetSampleRate);
    const offlineContext = new OfflineAudioContext(1, frames, targetSampleRate);
    const source = offlineContext.createBufferSource();
    
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    
    const renderedBuffer = await offlineContext.startRendering();
    audioContext.close();
    
    return new Blob([bufferToWav(renderedBuffer)], { type: 'audio/wav' });
  };

  // AudioBuffer를 WAV 형식으로 변환
  const bufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    let offset = 44;
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return arrayBuffer;
  };

  // 질문 재생
  const playQuestion = async (questionNumber: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('음성 합성을 지원하지 않는 브라우저입니다.'));
        return;
      }

      const question = QUESTIONS[questionNumber as keyof typeof QUESTIONS];
      console.log(`질문 재생 Q${questionNumber}: ${question}`);
      setStatus(`Q${questionNumber} 재생 중...`);
      
      const questionLine = `Q${questionNumber}: ${question}`;
      setTranscript(prev => prev + (prev ? '\n' : '') + questionLine + '\n');

      speechSynthRef.current = new SpeechSynthesisUtterance(question);
      
      const voices = speechSynthesis.getVoices();
      const koreanVoice = voices.find(voice => 
        voice.lang.includes('ko') || voice.name.includes('Korean')
      );
      
      if (koreanVoice) {
        speechSynthRef.current.voice = koreanVoice;
      }
      
      speechSynthRef.current.rate = 0.9;
      speechSynthRef.current.pitch = 1.0;
      speechSynthRef.current.volume = 0.8;
      
      speechSynthRef.current.onend = () => {
        console.log(`질문 완료 Q${questionNumber}`);
        setStatus(`Q${questionNumber} 완료. 답변을 기다립니다...`);
        resolve();
      };
      
      speechSynthRef.current.onerror = (event) => {
        console.error(`질문 실패 Q${questionNumber}:`, event.error);
        setStatus(`음성 재생 실패: ${event.error}`);
        reject(new Error(`음성 재생 실패: ${event.error}`));
      };
      
      speechSynthesis.speak(speechSynthRef.current);
    });
  };

  // VAD 시작
  const startVAD = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!analyserRef.current) {
        reject(new Error('분석기가 초기화되지 않았습니다.'));
        return;
      }

      console.log(`VAD 시작 - 음성 감지 대기 중...`);
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let speechDetected = false;
      let lastSpeechTime = 0;
      let isSpeaking = false;
      let vadStartTime = Date.now();
      let consecutiveSilenceCount = 0;
      let wasInterrupted = false;

      const checkVAD = () => {
        if (!analyserRef.current || gameState === 'processing' || gameState === 'completed') {
          resolve();
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const now = Date.now();

        if ((now - vadStartTime) % 3000 < VAD_CONFIG.vadCheckInterval) {
          console.log(`VAD 음량=${average.toFixed(1)}, 상태=${isSpeaking ? '말함' : '대기'}, 경과=${Math.floor((now - vadStartTime)/1000)}s`);
        }

        if (average > VAD_CONFIG.speechThreshold) {
          if (!isSpeaking) {
            isSpeaking = true;
            speechDetected = true;
            consecutiveSilenceCount = 0;
            wasInterrupted = false;
            console.log(`음성 감지 - 녹음 시작! 음량=${average.toFixed(1)}`);
            setStatus(`음성 감지됨! 녹음 중... (${average.toFixed(1)})`);
            setGameState('recording');
            startRecording();
          }
          lastSpeechTime = now;
          consecutiveSilenceCount = 0; // 음성이 감지되면 침묵 카운트 리셋
        } 
        else if (average < VAD_CONFIG.silenceThreshold && isSpeaking) {
          const silenceDuration = now - lastSpeechTime;
          consecutiveSilenceCount++;
          
          // 음성이 갑자기 끊겼는지 감지 (연속된 침묵이 급격히 증가)
          if (consecutiveSilenceCount > 20 && silenceDuration < 1000 && !wasInterrupted) {
            wasInterrupted = true;
            console.log(`목소리 끊김 감지 - 연속 침묵: ${consecutiveSilenceCount}`);
            setStatus(`목소리가 끊긴 것 같습니다. 다시 말씀해 주세요... (${Math.floor(silenceDuration/100)/10}s)`);
          }
          
          if (silenceDuration > VAD_CONFIG.silenceDuration) {
            console.log(`침묵 감지 - ${silenceDuration}ms 침묵으로 녹음 종료`);
            if (wasInterrupted) {
              console.log(`주의: 목소리가 끊긴 상태로 녹음이 종료되었습니다.`);
              setStatus('목소리가 끊긴 상태로 녹음이 종료되었습니다. 처리 중...');
            } else {
              setStatus('침묵 감지됨. 녹음 종료 중...');
            }
            isSpeaking = false;
            stopRecording();
            resolve();
            return;
          } else {
            const remainingTime = (VAD_CONFIG.silenceDuration - silenceDuration) / 1000;
            if (wasInterrupted) {
              setStatus(`목소리 끊김 - ${remainingTime.toFixed(1)}초 후 종료됩니다`);
            } else {
              setStatus(`침묵 ${Math.floor(silenceDuration/100)/10}s/${VAD_CONFIG.silenceDuration/1000}s`);
            }
          }
        }

        if (!speechDetected && (now - vadStartTime) > VAD_CONFIG.waitTimeout) {
          console.log(`타임아웃 - ${VAD_CONFIG.waitTimeout/1000}초 대기 후 답변 없음`);
          setStatus('답변 시간 초과. 다음 질문으로...');
          const emptyAnswer = `A${currentRound}: (답변 없음 - 시간 초과)`;
          setTranscript(prev => prev + emptyAnswer + '\n');
          setTimeout(() => proceedToNextRound(), 1000);
          resolve();
          return;
        }

        if (gameState === 'waiting_for_speech' || gameState === 'recording') {
          vadTimerRef.current = setTimeout(checkVAD, VAD_CONFIG.vadCheckInterval);
        }
      };

      setStatus('말씀해 주세요... (자동으로 감지됩니다)');
      checkVAD();
    });
  }, [gameState, currentRound]);

  // 마이크 초기화
  const initializeMicrophone = async (): Promise<void> => {
    try {
      console.log(`마이크 초기화 - 권한 요청 중...`);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      streamRef.current = stream;

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      console.log(`마이크 초기화 완료`);
      setStatus('마이크 초기화 완료');
    } catch (error) {
      console.error(`마이크 초기화 실패:`, error);
      throw new Error(`마이크 초기화 실패: ${error}`);
    }
  };

  // 녹음 시작
  const startRecording = () => {
    if (!mediaRecorderRef.current) return;

    console.log(`녹음 시작 Q${currentRound}`);
    chunksRef.current = [];
    
    mediaRecorderRef.current.ondataavailable = (event) => {
      chunksRef.current.push(event.data);
    };

    mediaRecorderRef.current.onstop = async () => {
      try {
        console.log(`녹음 완료 - 총 청크: ${chunksRef.current.length}`);
        setGameState('processing');
        setStatus('음성 변환 중...');
        
        const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
        console.log(`변환 시작 WebM → WAV (${webmBlob.size} bytes)`);
        
        const wavBlob = await convertWebMToWAV(webmBlob, 16000);
        console.log(`변환 완료 WAV 크기: ${wavBlob.size} bytes`);
        
        await performAutoSTT(wavBlob, currentRound);
      } catch (error) {
        console.error(`녹음 처리 에러:`, error);
        const errorAnswer = `A${currentRound}: (처리 실패: ${error})`;
        setTranscript(prev => prev + errorAnswer + '\n');
        setStatus(`처리 실패: ${error}`);
        setTimeout(() => proceedToNextRound(), 2000);
      }
    };

    mediaRecorderRef.current.start();

    hardTimeoutRef.current = setTimeout(() => {
      if (gameState === 'recording') {
        console.log(`최대 녹음 시간 ${VAD_CONFIG.maxRecordingTime/1000}초 도달`);
        stopRecording();
      }
    }, VAD_CONFIG.maxRecordingTime);
  };

  // 녹음 중지
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log(`녹음 중지`);
      mediaRecorderRef.current.stop();
    }
    
    if (vadTimerRef.current) {
      clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
  };

  // 자동 STT 처리
  const performAutoSTT = async (wavBlob: Blob, questionNumber: number) => {
    const formData = new FormData();
    formData.append('audio_file', wavBlob, `a${questionNumber}.wav`);

    console.log(`자동 POST Q${questionNumber} STT 요청 - 파일 크기: ${wavBlob.size} bytes`);
    setStatus('STT 분석 중...');

    try {
      const response = await fetch('/api/simulation/stt', {
        method: 'POST',
        body: formData,
      });

      console.log(`STT 응답 Status: ${response.status} ${response.statusText}`);
      const data: STTResponse = await response.json();
      console.log(`STT 결과 Q${questionNumber}:`, data);
      
      if (data.success) {
        const transcriptText = (data.transcript || '').trim();
        const answerLine = `A${questionNumber}: ${transcriptText || '(빈 텍스트)'}`;
        setTranscript(prev => prev + answerLine + '\n');
        
        console.log(`성공 Q${questionNumber}: "${transcriptText}"`);
        setStatus(`A${questionNumber} 완료: "${transcriptText}"`);
        
        setTimeout(() => {
          proceedToNextRound();
        }, 1500);
        
      } else {
        console.error(`STT 실패 Q${questionNumber}: ${data.error}`);
        const answerLine = `A${questionNumber}: (STT 실패: ${data.error || 'unknown'})`;
        setTranscript(prev => prev + answerLine + '\n');
        setStatus(`STT 실패, 다음 질문으로...`);
        
        setTimeout(() => {
          proceedToNextRound();
        }, 2000);
      }
      
    } catch (error) {
      console.error(`STT 에러 Q${questionNumber}:`, error);
      const answerLine = `A${questionNumber}: (네트워크 오류: ${error})`;
      setTranscript(prev => prev + answerLine + '\n');
      setStatus(`네트워크 오류, 다음 질문으로...`);
      
      setTimeout(() => {
        proceedToNextRound();
      }, 2000);
    }
  };

  // 다음 라운드 진행
  const proceedToNextRound = () => {
    console.log(`라운드 진행 현재: ${currentRound}/3`);
    
    if (currentRound >= 3) {
      console.log(`게임 완료 ===================`);
      console.log(`최종 결과물 전체 대화:`);
      console.log(transcript);
      console.log(`완료 3라운드 모두 완료! ===================`);
      
      setGameState('completed');
      setStatus('3라운드 완료! 분석하기 버튼을 눌러주세요.');
      cleanup();
      return;
    }

    const nextRound = currentRound + 1;
    console.log(`다음 라운드 Q${nextRound} 자동 시작`);
    
    setCurrentRound(nextRound);
    setGameState('playing_question');
    setStatus(`Q${nextRound} 준비 중...`);
    
    setTimeout(async () => {
      try {
        await playQuestion(nextRound);
        setGameState('waiting_for_speech');
        await startVAD();
      } catch (error) {
        console.error(`다음 라운드 실패 Q${nextRound}:`, error);
        setStatus(`Q${nextRound} 실패: ${error}`);
        setGameState('idle');
      }
    }, 2000);
  };

  // 완전 자동 게임 시작
  const startFullAutoGame = async () => {
    try {
      console.log(`완전 자동 시작 ===================`);
      setStatus('완전 자동 게임 시작 중...');
      
      await initializeMicrophone();
      
      setCurrentRound(1);
      setGameState('playing_question');
      
      await playQuestion(1);
      setGameState('waiting_for_speech');
      await startVAD();
      
    } catch (error) {
      console.error(`시작 실패:`, error);
      setStatus(`시작 실패: ${error}`);
      setGameState('idle');
    }
  };

  // 정리
  const cleanup = () => {
    console.log(`리소스 정리 중...`);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    } catch (error) {
      console.error('AudioContext cleanup error:', error);
    }
    
    audioContextRef.current = null;
    analyserRef.current = null;
    
    if (vadTimerRef.current) {
      clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    
    if (hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }

    if (speechSynthRef.current) {
      speechSynthesis.cancel();
      speechSynthRef.current = null;
    }
    
    mediaRecorderRef.current = null;
  };

  // 게임 중지
  const stopGame = () => {
    console.log(`게임 중지 - 사용자가 중지함`);
    cleanup();
    setGameState('idle');
    setCurrentRound(0);
    setStatus('게임이 중지되었습니다.');
  };

  // 분석 수행
  const performAnalysis = async () => {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) {
      alert('대화 텍스트가 없습니다.');
      return;
    }

    console.log(`최종 분석 ===================`);
    console.log(`총 결과물 전체 대화 내용:`);
    console.log(trimmedTranscript);
    console.log(`분석 요청 백엔드로 전송...`);
    
    setStatus('분석 중...');
    
    try {
      const response = await fetch('/api/simulation/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript: trimmedTranscript }),
      });

      console.log(`분석 응답 Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`분석 실패`, errorData);
        setStatus(`분석 에러: ${errorData.detail || response.statusText}`);
        return;
      }

      const data: AnalyzeResponse = await response.json();
      console.log(`분석 완료 ===================`);
      console.log(`위험도: ${data.risk}`);
      console.log(`점수: ${data.score}/100`);
      console.log(`설명: ${data.explanation}`);
      console.log(`피드백: ${data.feedback}`);
      console.log(`상세:`, data.llm);
      console.log(`전체 완료 ===================`);
      
      setAnalysisResult(data);
      setStatus('분석 완료!');
    } catch (error) {
      console.error(`분석 에러:`, error);
      setStatus(`분석 실패: ${error}`);
    }
  };

  // 초기화
  const resetAll = () => {
    console.log(`초기화 - 모든 데이터 리셋`);
    cleanup();
    setTranscript('');
    setCurrentRound(0);
    setGameState('idle');
    setStatus('초기화 완료');
    setAnalysisResult(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          완전 자동 보이스피싱 시뮬레이션
        </h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <div className="flex items-center gap-4 mb-4">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                gameState === 'idle' ? 'bg-gray-100 text-gray-800' :
                gameState === 'playing_question' ? 'bg-blue-100 text-blue-800' :
                gameState === 'waiting_for_speech' ? 'bg-yellow-100 text-yellow-800' :
                gameState === 'recording' ? 'bg-red-100 text-red-800' :
                gameState === 'processing' ? 'bg-purple-100 text-purple-800' :
                'bg-green-100 text-green-800'
              }`}>
                {gameState === 'idle' ? '대기 중' :
                 gameState === 'playing_question' ? '질문 재생' :
                 gameState === 'waiting_for_speech' ? '음성 대기' :
                 gameState === 'recording' ? '녹음 중' :
                 gameState === 'processing' ? '처리 중' :
                 '완료'}
              </div>
              
              {currentRound > 0 && (
                <div className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                  라운드: {currentRound}/3
                </div>
              )}
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg mb-4">
              <h3 className="font-medium text-blue-900 mb-2">완전 자동 모드</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>시작 버튼 한 번만 누르면 모든 것이 자동으로 진행</li>
                <li>질문 자동 재생 → 음성 자동 감지 → 자동 녹음 → 자동 POST</li>
                <li>success: true 확인 → transcript 저장 → 자동으로 다음 라운드</li>
                <li>3라운드 완료 → 최종 결과물 콘솔 출력 → 분석 가능</li>
                <li>F12 → 콘솔에서 전체 과정 실시간 모니터링</li>
              </ul>
            </div>
            
            <div className="space-x-2 mb-4">
              <button
                onClick={startFullAutoGame}
                disabled={gameState !== 'idle'}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 disabled:bg-gray-400 font-medium"
              >
                완전 자동 시작
              </button>
              
              <button
                onClick={stopGame}
                disabled={gameState === 'idle'}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
              >
                중지
              </button>
              
              <button
                onClick={performAnalysis}
                disabled={gameState !== 'completed' || !transcript.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
              >
                분석하기
              </button>
              
              <button
                onClick={resetAll}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                초기화
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700">
                상태: {status}
              </p>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">VAD 설정:</h3>
              <div className="text-xs text-gray-600 grid grid-cols-2 gap-2">
                <p>• 음성 감지: {VAD_CONFIG.speechThreshold}</p>
                <p>• 침묵 감지: {VAD_CONFIG.silenceThreshold}</p>
                <p>• 침묵 지속: {VAD_CONFIG.silenceDuration}ms</p>
                <p>• 최대 녹음: {VAD_CONFIG.maxRecordingTime}ms</p>
                <p>• 응답 대기: {VAD_CONFIG.waitTimeout}ms</p>
                <p>• 체크 간격: {VAD_CONFIG.vadCheckInterval}ms</p>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              대화 내용 (실시간 업데이트):
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="완전 자동 모드: 시작하면 Q1/A1, Q2/A2, Q3/A3이 자동으로 진행되어 기록됩니다."
              className="w-full h-64 p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              readOnly={gameState !== 'idle' && gameState !== 'completed'}
            />
          </div>
        </div>

        {analysisResult && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">최종 분석 결과</h2>
            
            <div className="mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  analysisResult.risk === 'LOW' ? 'bg-green-100 text-green-800' :
                  analysisResult.risk === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  위험도: {analysisResult.risk}
                </div>
                <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  점수: {analysisResult.score}/100
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">왜 위험한가:</h3>
                  <p className="text-gray-700 bg-red-50 p-3 rounded">{analysisResult.explanation}</p>
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">다음에 이렇게 하자:</h3>
                  <p className="text-gray-700 bg-green-50 p-3 rounded">{analysisResult.feedback}</p>
                </div>
              </div>
            </div>
            
            <details className="mb-4">
              <summary className="cursor-pointer font-medium text-gray-900 mb-2 hover:text-blue-600">
                상세 분석 결과 보기 (클릭)
              </summary>
              
              <div className="space-y-4 mt-4 border-t pt-4">
                {analysisResult.llm.good_signals.length > 0 && (
                  <div>
                    <h4 className="font-medium text-green-700 mb-2">안전 신호:</h4>
                    <ul className="list-disc list-inside space-y-1 bg-green-50 p-3 rounded">
                      {analysisResult.llm.good_signals.map((signal, index) => (
                        <li key={index} className="text-green-700">{signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {analysisResult.llm.risk_signals.length > 0 && (
                  <div>
                    <h4 className="font-medium text-red-700 mb-2">위험 신호:</h4>
                    <ul className="list-disc list-inside space-y-1 bg-red-50 p-3 rounded">
                      {analysisResult.llm.risk_signals.map((signal, index) => (
                        <li key={index} className="text-red-700">{signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">대응 원칙:</h4>
                  <ul className="list-disc list-inside space-y-1 bg-blue-50 p-3 rounded">
                    {analysisResult.llm.coaching.principles.map((principle, index) => (
                      <li key={index} className="text-blue-700">{principle}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">개선된 답변 템플릿:</h4>
                  <div className="space-y-3 bg-purple-50 p-4 rounded">
                    <div>
                      <span className="font-medium text-purple-800">개인정보 요구 시:</span>
                      <p className="text-gray-700 italic mt-1 ml-4">"{analysisResult.llm.coaching.better_answer_templates.personal_info_request}"</p>
                    </div>
                    <div>
                      <span className="font-medium text-purple-800">송금 요구 시:</span>
                      <p className="text-gray-700 italic mt-1 ml-4">"{analysisResult.llm.coaching.better_answer_templates.money_or_transfer}"</p>
                    </div>
                    <div>
                      <span className="font-medium text-purple-800">앱/링크 설치 요구 시:</span>
                      <p className="text-gray-700 italic mt-1 ml-4">"{analysisResult.llm.coaching.better_answer_templates.app_or_link_install}"</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">전체 코멘트:</h4>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded italic">{analysisResult.llm.overall_comment}</p>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}