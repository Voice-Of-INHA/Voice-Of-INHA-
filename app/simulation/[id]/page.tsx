"use client"

import React, { useState, useRef, useEffect } from 'react';

// 시뮬레이션 질문들
const SIMULATION_QUESTIONS = {
  1: "여기는 검찰청입니다. 고객님 명의로 범죄 계좌가 발견됐습니다. 계좌번호를 알려주세요.",
  2: "안전을 위해 주민등록번호도 필요합니다. 지금 불러주세요.",
  3: "즉시 지정 계좌로 송금하지 않으면 체포됩니다. 어떻게 하시겠습니까?"
};

interface AnalysisResult {
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  explanation: string;
  feedback: string;
}

const VoicePhishingSimulation: React.FC = () => {
  // 시뮬레이션 상태
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [isSimulationActive, setIsSimulationActive] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [isQuestionPlaying, setIsQuestionPlaying] = useState(false);
  
  // 녹음 상태
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // 분석 결과
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // TTS 함수
  const speakQuestion = (questionText: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(questionText);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => setIsQuestionPlaying(true);
      utterance.onend = () => {
        setIsQuestionPlaying(false);
        // TTS 끝나면 자동으로 녹음 시작
        setTimeout(() => startRecording(), 500);
      };
      
      speechSynthesis.speak(utterance);
    }
  };

  // WebM을 WAV로 변환하는 함수
  const convertWebMToWav = async (webmBlob: Blob): Promise<Blob> => {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // 16kHz 모노로 리샘플링
    const targetSampleRate = 16000;
    const frames = Math.ceil(audioBuffer.duration * targetSampleRate);
    const offlineContext = new OfflineAudioContext(1, frames, targetSampleRate);
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    
    const renderedBuffer = await offlineContext.startRendering();
    audioContext.close();
    
    return bufferToWav(renderedBuffer);
  };

  // AudioBuffer를 WAV로 변환
  const bufferToWav = (buffer: AudioBuffer): Blob => {
    const length = buffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV 헤더 작성
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
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  // STT 요청
  const performSTT = async (wavBlob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append('audio_file', wavBlob, `round_${currentRound}.wav`);
    
    try {
      const response = await fetch('/api/simulation/stt', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      if (data.success) {
        return data.transcript || '';
      } else {
        throw new Error(data.error || 'STT 실패');
      }
    } catch (error) {
      console.error('STT 오류:', error);
      return '(음성 인식 실패)';
    }
  };

  // 오디오 레벨 측정
  const measureAudioLevel = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      setAudioLevel(Math.round(average / 255 * 100));
      
      // isRecording 조건을 제거하고 analyserRef 존재 여부만 확인
      if (analyserRef.current) {
        animationFrameRef.current = requestAnimationFrame(measureAudioLevel);
      }
    }
  };

  // 침묵 감지 (자동 답변 완료)
  const detectSilenceForAutoComplete = () => {
    let silenceStartTime: number | null = null;
    
    const checkSilence = () => {
      if (!analyserRef.current || !isRecording) return;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      const currentLevel = Math.round(average / 255 * 100);
      
      if (currentLevel <= 10) {
        // 음성 레벨이 10 이하인 경우
        if (silenceStartTime === null) {
          silenceStartTime = Date.now();
        } else {
          const silenceDuration = Date.now() - silenceStartTime;
          if (silenceDuration >= 2000) {
            // 2초 이상 침묵이 지속되면 자동 완료
            console.log('침묵 감지로 자동 답변 완료');
            stopRecording();
            return;
          }
        }
      } else {
        // 음성이 감지되면 침묵 타이머 리셋
        silenceStartTime = null;
      }
      
      if (isRecording) {
        requestAnimationFrame(checkSilence);
      }
    };
    
    checkSilence();
  };

  // 녹음 시작
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      
      streamRef.current = stream;
      
      // AudioContext 설정
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // MediaRecorder 설정
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const wavBlob = await convertWebMToWav(webmBlob);
        const transcriptText = await performSTT(wavBlob);
        
        // 트랜스크립트에 추가
        const newEntry = `Q${currentRound}: ${SIMULATION_QUESTIONS[currentRound as keyof typeof SIMULATION_QUESTIONS]}\nA${currentRound}: ${transcriptText}\n`;
        setTranscript(prev => prev + newEntry);
        
        // 다음 라운드로 진행 또는 분석
        if (currentRound < 3) {
          setTimeout(() => {
            setCurrentRound(prev => prev + 1);
          }, 1000);
        } else {
          // 3라운드 완료 - 분석 시작
          performAnalysis(transcript + newEntry);
        }
        
        cleanup();
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // 타이머 시작
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      // 오디오 레벨 측정 시작 (약간의 지연 후)
      setTimeout(() => {
        measureAudioLevel();
        detectSilenceForAutoComplete(); // 침묵 감지 시작
      }, 100);
      
      // 최대 녹음 시간 (30초)
      setTimeout(() => {
        if (isRecording) stopRecording();
      }, 30000);
      
    } catch (error) {
      console.error('녹음 시작 실패:', error);
      alert('마이크 권한을 허용해주세요.');
    }
  };

  // 녹음 중지
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  // 리소스 정리
  const cleanup = () => {
    // 오디오 레벨 측정 중지
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    setAudioLevel(0);
  };

  // 분석 수행
  const performAnalysis = async (finalTranscript: string) => {
    setIsAnalyzing(true);
    
    try {
      const response = await fetch('/api/simulation/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: finalTranscript }),
      });
      
      const result = await response.json();
      setAnalysisResult(result);
    } catch (error) {
      console.error('분석 실패:', error);
      alert('분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 시뮬레이션 시작
  const startSimulation = () => {
    setIsSimulationActive(true);
    setCurrentRound(1);
    setTranscript('');
    setAnalysisResult(null);
  };

  // 시뮬레이션 재시작
  const resetSimulation = () => {
    stopRecording();
    cleanup();
    setIsSimulationActive(false);
    setCurrentRound(0);
    setTranscript('');
    setAnalysisResult(null);
    setRecordingTime(0);
  };

  // 현재 라운드 변경 시 질문 재생
  useEffect(() => {
    if (currentRound > 0 && currentRound <= 3) {
      const question = SIMULATION_QUESTIONS[currentRound as keyof typeof SIMULATION_QUESTIONS];
      setTimeout(() => speakQuestion(question), 500);
    }
  }, [currentRound]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanup();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-500';
      case 'MEDIUM': return 'text-yellow-500';
      case 'HIGH': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getRiskBgColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'bg-green-100 border-green-300';
      case 'MEDIUM': return 'bg-yellow-100 border-yellow-300';
      case 'HIGH': return 'bg-red-100 border-red-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">보이스피싱 대응 훈련</h1>
          <p className="text-gray-600">실제 보이스피싱 상황을 시뮬레이션하고 대응 능력을 평가합니다.</p>
        </div>

        {!isSimulationActive ? (
          /* 시작 화면 */
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="mb-6">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🔊</span>
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-3">훈련을 시작하시겠습니까?</h2>
              <p className="text-gray-600 mb-2">3라운드의 보이스피싱 시나리오가 진행됩니다.</p>
              <p className="text-sm text-gray-500">각 질문 후 음성으로 답변해주세요.</p>
            </div>
            
            <div className="space-y-3 mb-8">
              <div className="flex items-center justify-center space-x-3 text-sm text-gray-600">
                <span className="flex items-center">▶️ 검찰청 사칭</span>
                <span className="flex items-center">▶️ 개인정보 요구</span>
                <span className="flex items-center">▶️ 송금 강요</span>
              </div>
            </div>

            <button
              onClick={startSimulation}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors flex items-center mx-auto"
            >
              <span className="mr-2">▶️</span>
              훈련 시작하기
            </button>
          </div>
        ) : (
          /* 시뮬레이션 진행 화면 */
          <div className="space-y-6">
            {/* 진행 상황 */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  {currentRound > 0 && currentRound <= 3 ? `라운드 ${currentRound}` : 
                   isAnalyzing ? '분석 중...' : '분석 완료'}
                </h2>
                <button
                  onClick={resetSimulation}
                  className="text-gray-500 hover:text-gray-700 flex items-center"
                >
                  <span className="mr-1">🔄</span>
                  다시 시작
                </button>
              </div>
              
              <div className="flex space-x-4 mb-4">
                {[1, 2, 3].map((round) => (
                  <div
                    key={round}
                    className={`flex-1 h-2 rounded-full ${
                      round < currentRound ? 'bg-green-500' :
                      round === currentRound ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              
              {currentRound > 0 && currentRound <= 3 && (
                <div className="text-center space-y-4">
                  <div className={`p-4 rounded-lg border-2 ${
                    isQuestionPlaying ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-300'
                  }`}>
                    <div className="flex items-center justify-center mb-2">
                      <span className={`mr-2 text-xl ${isQuestionPlaying ? 'text-blue-600' : 'text-gray-600'}`}>🔊</span>
                      <span className="font-medium">
                        {isQuestionPlaying ? '질문 재생 중...' : '질문'}
                      </span>
                    </div>
                    <p className="text-gray-700">
                      {SIMULATION_QUESTIONS[currentRound as keyof typeof SIMULATION_QUESTIONS]}
                    </p>
                  </div>

                  {isRecording && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                      <div className="flex items-center justify-center mb-2">
                        <span className="mr-2 text-xl text-red-600 animate-pulse">🎤</span>
                        <span className="font-medium text-red-700">녹음 중...</span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-red-600 font-mono">{formatTime(recordingTime)}</p>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full transition-all duration-100 ${
                              audioLevel > 70 ? 'bg-red-500' : 
                              audioLevel > 30 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(audioLevel, 100)}%` }}
                          />
                        </div>
                        <p className="text-sm text-gray-600">
                          음성 레벨: {audioLevel}% 
                          {audioLevel <= 10 && <span className="text-orange-600 ml-2">(침묵 감지 중...)</span>}
                        </p>
                        <button
                          onClick={stopRecording}
                          className="mt-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center mx-auto"
                        >
                          <span className="mr-1">⏹️</span>
                          답변 완료
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 대화 기록 */}
            {transcript && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">대화 기록</h3>
                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap">{transcript}</pre>
                </div>
              </div>
            )}

            {/* 분석 결과 */}
            {isAnalyzing && (
              <div className="bg-white rounded-lg shadow-lg p-6 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">AI가 대응 패턴을 분석하고 있습니다...</p>
              </div>
            )}

            {analysisResult && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">분석 결과</h3>
                
                {/* 점수 및 위험도 */}
                <div className={`rounded-lg p-4 border-2 mb-6 ${getRiskBgColor(analysisResult.risk)}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-2xl font-bold">{analysisResult.score}점</span>
                      <span className={`ml-2 font-semibold ${getRiskColor(analysisResult.risk)}`}>
                        ({analysisResult.risk === 'LOW' ? '안전' : 
                          analysisResult.risk === 'MEDIUM' ? '보통' : '위험'})
                      </span>
                    </div>
                    <div>
                      <span className="text-3xl">
                        {analysisResult.risk === 'LOW' ? '✅' :
                         analysisResult.risk === 'MEDIUM' ? '⚠️' : '❌'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 분석 내용 */}
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2">분석 결과</h4>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">
                      {analysisResult.explanation}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2">🎯 개선 방향</h4>
                    <p className="text-gray-700 bg-blue-50 p-3 rounded">
                      {analysisResult.feedback}
                    </p>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">🏆 종합 평가</h4>
                    <p className="text-blue-700">
                      {analysisResult.score >= 80 ? 
                        '훌륭한 대응이었습니다! 보이스피싱을 잘 막아낼 수 있을 것 같습니다.' :
                        analysisResult.score >= 50 ?
                        '괜찮은 대응이지만 더 주의깊게 대응하시면 좋겠습니다.' :
                        '보이스피싱에 취약할 수 있습니다. 더 신중한 대응이 필요합니다.'
                      }
                    </p>
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <button
                    onClick={resetSimulation}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                  >
                    다시 훈련하기
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoicePhishingSimulation;