"use client"

import { useState, useRef, useEffect } from "react"

// Safari와 구형 브라우저 지원을 위한 타입 확장
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

interface AnalysisResult {
  risk: 'low' | 'medium' | 'high' | null
  riskScore: number
  keywords: string[]
  reason: string
  timestamp: number
}

interface BackendMessage {
  type: string
  transcript?: string
  is_final?: boolean
  speaker?: number
  segments?: Array<{
    speaker: number
    text: string
  }>
  risk_score?: number
  risk_level?: 'low' | 'medium' | 'high'
  analysis_reason?: string
  detected_keywords?: string[]
  // 에러 메시지를 위한 다양한 필드들
  message?: string
  error?: string
  detail?: string
  description?: string
  [key: string]: any // 추가적인 필드들을 위해
}

export default function AnalysisPage() {
  // 통합 녹음/분석 관련 상태
  const [isActive, setIsActive] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  
  // 연결 상태
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [analysisLog, setAnalysisLog] = useState<string>('')
  
  // 분석 관련 상태
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>({
    risk: null,
    riskScore: 0,
    keywords: [],
    reason: '',
    timestamp: 0
  })
  
  // 모달 관련 상태
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // 환경 설정
  const WS_URL = "ws://localhost:8000/ws/analysis"
  const CHUNK_MS = 500
  const TARGET_SR = 16000

  // 토스트 메시지 표시 함수
  const showToast = (title: string, description: string, variant: 'default' | 'destructive' = 'default') => {
    console.log(`[${variant}] ${title}: ${description}`)
    if (variant === 'destructive') {
      alert(`오류: ${description}`)
    }
  }

  // 위험도에 따른 리스크 레벨 계산
  const getRiskLevel = (score: number): 'low' | 'medium' | 'high' => {
    if (score >= 70) return 'high'
    if (score >= 50) return 'medium'
    return 'low'
  }

  // AudioWorklet 코드 생성
  const buildWorkletBlobURL = () => {
    const workletCode = `
class ResamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.sourceRate = sampleRate;
    this.targetRate = ${TARGET_SR};
    this.ratio = this.sourceRate / this.targetRate;
    this.chunkSamples = Math.floor(${TARGET_SR} * ${CHUNK_MS} / 1000);
  }
  downsampleMono(input) {
    const inLen = input.length;
    const outLen = Math.floor(inLen / this.ratio);
    const out = new Float32Array(outLen);
    let pos = 0;
    for (let i = 0; i < outLen; i++) {
      const nextPos = Math.min(Math.floor((i + 1) * this.ratio), inLen);
      let sum = 0, cnt = 0;
      for (; pos < nextPos; pos++, cnt++) sum += input[pos];
      out[i] = cnt ? (sum / cnt) : 0;
    }
    return out;
  }
  floatToInt16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      let s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  }
  process(inputs) {
    if (!inputs || !inputs[0] || inputs[0].length === 0) return true;
    const ch0 = inputs[0][0];
    if (!ch0) return true;

    const down = this.downsampleMono(ch0);
    this.buffer.push(down);

    let total = 0; for (const b of this.buffer) total += b.length;
    if (total >= this.chunkSamples) {
      const merged = new Float32Array(total);
      let o = 0; for (const b of this.buffer) { merged.set(b, o); o += b.length; }
      this.buffer = [];

      let off = 0;
      while (off + this.chunkSamples <= merged.length) {
        const slice = merged.subarray(off, off + this.chunkSamples);
        const i16 = this.floatToInt16(slice);
        this.port.postMessage({ type: 'chunk', pcm16: i16.buffer }, [i16.buffer]);
        off += this.chunkSamples;
      }
      if (off < merged.length) this.buffer.push(merged.subarray(off));
    }
    return true;
  }
}
registerProcessor('resampler-processor', ResamplerProcessor);
    `
    return URL.createObjectURL(new Blob([workletCode], { type: "application/javascript" }))
  }

  // 오디오 레벨 측정
  const measureAudioLevel = () => {
    if (analyserRef.current && isActive) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)
      
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
      setAudioLevel(Math.round(average / 255 * 100))
      
      animationFrameRef.current = requestAnimationFrame(measureAudioLevel)
    }
  }

  // 녹음 시간 업데이트
  const startRecordingTimer = () => {
    setRecordingTime(0)
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1)
    }, 1000)
  }

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  // 시간 포맷팅 함수
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // WebSocket 초기화
  const initializeWebSocket = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(WS_URL)
      socket.binaryType = "arraybuffer"
      socketRef.current = socket
      
      socket.onopen = () => {
        console.log("WebSocket 연결 성공")
        setConnectionStatus('connected')
        showToast("연결 성공", "분석 서버에 연결되었습니다.")
        resolve(socket)
      }

      socket.onmessage = (event) => {
        try {
          const msg: BackendMessage = JSON.parse(event.data)
          console.log("백엔드 메시지 수신:", msg)
          
          if (msg.type === "analysis_update") {
            let logText = ""
            
            // 세그먼트가 있으면 화자별로 표시
            if (msg.segments && Array.isArray(msg.segments) && msg.segments.length > 0) {
              const lines = msg.segments.map(s => `[SPK${s.speaker}] ${s.text || ""}`)
              logText = `${msg.is_final ? '[FINAL]' : '[PART]'} ${lines.join(' | ')}`
            } else {
              // 단일 화자 또는 세그먼트 없음
              const spk = (msg.speaker !== undefined && msg.speaker !== null) ? `[SPK${msg.speaker}] ` : ""
              logText = `${msg.is_final ? '[FINAL]' : '[PART]'} ${spk}${msg.transcript || ""}`
            }
            
            // 위험도 정보가 있으면 추가
            if (msg.risk_score !== undefined) {
              logText += ` [위험도: ${msg.risk_score}%]`
            }
            
            setAnalysisLog(prev => prev + logText + '\n')
            
            // 최종 분석 결과 처리
            if (msg.is_final && msg.risk_score !== undefined) {
              updateAnalysisResult(msg)
            }
          } else if (msg.type === "error") {
            console.error("백엔드 오류:", msg)
            // 다양한 에러 메시지 필드를 확인
            const errorMessage = msg.message || msg.error || msg.detail || msg.description || '알 수 없는 오류'
            setAnalysisLog(prev => prev + `ERROR: ${errorMessage}\n`)
          }
        } catch (error) {
          console.error("메시지 파싱 오류:", error)
          setAnalysisLog(prev => prev + `RAW: ${event.data}\n`)
        }
      }

      socket.onerror = (error) => {
        console.error("WebSocket 오류:", error)
        setConnectionStatus('error')
        showToast("연결 오류", "분석 서버 연결에 실패했습니다.", "destructive")
        reject(error)
      }

      socket.onclose = () => {
        console.log("WebSocket 연결 종료")
        setConnectionStatus('disconnected')
      }

      setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.close()
          setConnectionStatus('error')
          reject(new Error("연결 타임아웃"))
        }
      }, 10000)
    })
  }

  // 분석 결과 업데이트 함수
  const updateAnalysisResult = (msg: BackendMessage) => {
    if (msg.risk_score === undefined) return

    // 현재 위험도와 새로운 위험도 중 높은 값 사용 (누적)
    const newRiskScore = Math.max(analysisResult.riskScore, msg.risk_score)
    
    const newResult: AnalysisResult = {
      risk: msg.risk_level || getRiskLevel(newRiskScore),
      riskScore: Math.round(newRiskScore),
      keywords: [...new Set([...analysisResult.keywords, ...(msg.detected_keywords || [])])], // 중복 제거하여 누적
      reason: msg.analysis_reason || analysisResult.reason,
      timestamp: Date.now()
    }
    
    setAnalysisResult(newResult)
  }

  // 오디오 스트림 초기화
  const initializeAudioStream = async (): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRate: 48000
        },
        video: false
      })
      
      streamRef.current = stream

      // AudioContext 및 분석기 설정
      const AudioContextClass = window.AudioContext || window.webkitAudioContext || AudioContext
      audioContextRef.current = new AudioContextClass({ sampleRate: 48000 })
      
      // 오디오 레벨 측정용
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      
      const source = audioContextRef.current.createMediaStreamSource(stream)
      
      // Worklet 설정 (실시간 분석용)
      const blobURL = buildWorkletBlobURL()
      await audioContextRef.current.audioWorklet.addModule(blobURL)
      
      const workletNode = new AudioWorkletNode(audioContextRef.current, "resampler-processor")
      workletNodeRef.current = workletNode
      
      workletNode.port.onmessage = (ev) => {
        const d = ev.data
        if (d && d.type === "chunk" && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(d.pcm16) // 16kHz mono Int16 PCM을 백엔드로 전송
        }
      }
      
      // 연결: source -> [analyser, worklet] -> destination
      source.connect(analyserRef.current)
      source.connect(workletNode)
      workletNode.connect(audioContextRef.current.destination)
      
      return stream
    } catch (error) {
      console.error("마이크 접근 실패:", error)
      throw new Error("마이크 접근 권한을 허용해주세요.")
    }
  }

  // MediaRecorder 초기화
  const initializeMediaRecorder = (stream: MediaStream) => {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4"

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      audioBitsPerSecond: 16000
    })

    mediaRecorderRef.current = mediaRecorder
    recordedChunksRef.current = []

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data)
      }
    }

    mediaRecorder.onstart = () => {
      console.log("녹음 시작")
    }

    mediaRecorder.onstop = () => {
      console.log("녹음 중지")
    }

    mediaRecorder.onerror = (error) => {
      console.error("MediaRecorder 오류:", error)
      showToast("녹음 오류", "녹음 중 오류가 발생했습니다.", "destructive")
    }

    return mediaRecorder
  }

  // 통합 시작 함수
  const startAnalysis = async () => {
    try {
      setConnectionStatus('connecting')
      setIsActive(true)
      setAnalysisLog('')
      
      // 초기 분석 결과 리셋
      setAnalysisResult({
        risk: null,
        riskScore: 0,
        keywords: [],
        reason: '',
        timestamp: 0
      })
      
      const socket = await initializeWebSocket()
      const stream = await initializeAudioStream()
      const mediaRecorder = initializeMediaRecorder(stream)
      
      mediaRecorder.start(250)
      measureAudioLevel()
      startRecordingTimer()
      
      showToast("분석 시작", "실시간 음성 분석 및 녹음이 시작되었습니다.")
    } catch (error) {
      console.error("분석 시작 실패:", error)
      setIsActive(false)
      setConnectionStatus('error')
      
      if (error instanceof Error) {
        showToast("시작 실패", error.message, "destructive")
      }
    }
  }

  // 통합 중지 함수
  const stopAnalysis = () => {
    console.log("분석 중지")
    
    const finalRiskScore = analysisResult.riskScore
    
    // MediaRecorder 중지
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Worklet 정리
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect() } catch {}
      workletNodeRef.current = null
    }
    
    // AudioContext 정리
    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch {}
      audioContextRef.current = null
    }
    
    // 스트림 정리
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    // WebSocket 정리
    if (socketRef.current) {
      try { socketRef.current.close() } catch {}
      socketRef.current = null
    }

    // 애니메이션 프레임 정리
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    stopRecordingTimer()
    setIsActive(false)
    setConnectionStatus('disconnected')
    setAudioLevel(0)
    
    // 위험도에 따른 후처리
    if (finalRiskScore >= 50) {
      setShowSaveModal(true)
    } else {
      recordedChunksRef.current = []
      showToast("분석 완료", "안전한 통화로 판단되어 녹음이 삭제되었습니다.")
    }
  }

  // 통화 저장 함수
  const saveCall = async () => {
    if (!phoneNumber.trim()) {
      showToast("입력 오류", "전화번호를 입력해주세요.", "destructive")
      return
    }

    setIsSaving(true)

    try {
      const recordedBlob = new Blob(recordedChunksRef.current, { 
        type: 'audio/webm' 
      })

      const formData = new FormData()
      formData.append('audioFile', recordedBlob, `suspicious_call_${Date.now()}.webm`)
      formData.append('phoneNumber', phoneNumber.trim())

      const response = await fetch('/api/save-suspicious-call', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`업로드 실패: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const result = await response.json()
      console.log("의심 통화 저장 성공:", result)

      showToast("저장 완료", "의심 통화가 성공적으로 저장되었습니다.")
      
      recordedChunksRef.current = []
      setPhoneNumber('')
      setShowSaveModal(false)

    } catch (error) {
      console.error("저장 실패:", error)
      showToast("저장 실패", "의심 통화 저장 중 오류가 발생했습니다.", "destructive")
    } finally {
      setIsSaving(false)
    }
  }

  // 저장 건너뛰기
  const skipSave = () => {
    recordedChunksRef.current = []
    setPhoneNumber('')
    setShowSaveModal(false)
    showToast("저장 건너뛰기", "녹음 데이터가 삭제되었습니다.")
  }

  // 위험도별 색상
  const getRiskColor = (risk: string | null) => {
    switch (risk) {
      case 'high': return 'text-red-500'
      case 'medium': return 'text-yellow-500'  
      case 'low': return 'text-green-500'
      default: return 'text-gray-500'
    }
  }

  // 위험도별 배경색
  const getRiskBgColor = (score: number) => {
    if (score >= 70) return 'bg-red-900 border-red-500'
    if (score >= 50) return 'bg-yellow-900 border-yellow-500'
    return 'bg-gray-800 border-gray-700'
  }

  // 위험도별 아이콘
  const getRiskIcon = (risk: string | null) => {
    switch (risk) {
      case 'high': return <span className="text-red-500 text-2xl">🚨</span>
      case 'medium': return <span className="text-yellow-500 text-2xl">⚠️</span>
      case 'low': return <span className="text-green-500 text-2xl">✅</span>
      default: return <span className="text-gray-400 text-2xl">🛡️</span>
    }
  }

  // 연결 상태별 표시 (제거된 함수)
  // const getConnectionStatusDisplay = () => { ... }

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (isActive) stopAnalysis()
    }
  }, [])

return (
  <div className="min-h-screen bg-black flex flex-col p-4">
    {/* 헤더 */}
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center space-x-4">
        <button
          className="flex items-center text-white hover:text-gray-300 p-2 rounded-lg hover:bg-gray-800 transition-colors"
          onClick={() => window.history.back()}
        >
          ← 돌아가기
        </button>

        <button
          className="flex items-center text-white hover:text-gray-300 p-2 rounded-lg hover:bg-gray-800 transition-colors"
          onClick={() => setShowHelpModal(true)}
        >
          ❓ 도움말
        </button>
      </div>
    </div>

    <div className="flex-1 flex flex-col items-center justify-center max-w-6xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-white mb-8 text-center">
        실시간 보이스피싱 분석 시스템
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full mb-6">
        {/* 메인 컨트롤 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-white mb-4">통화 분석 및 녹음</h2>

            <div className="text-center mb-4">
              <button
                onClick={isActive ? stopAnalysis : startAnalysis}
                disabled={connectionStatus === 'connecting'}
                className={`w-32 h-32 rounded-full text-white font-semibold shadow-lg transition-all duration-200 ${
                  connectionStatus === 'connecting'
                    ? 'bg-gray-600 cursor-not-allowed opacity-50'
                    : isActive
                    ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {connectionStatus === 'connecting' ? (
                  <div className="flex flex-col items-center">
                    <span className="text-3xl mb-2">🔄</span>
                    <span className="text-sm">연결중</span>
                  </div>
                ) : isActive ? (
                  <div className="flex flex-col items-center">
                    <span className="text-3xl mb-2">⏹️</span>
                    <span className="text-sm">분석 중지</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="text-3xl mb-2">🎙️</span>
                    <span className="text-sm">분석 시작</span>
                  </div>
                )}
              </button>
            </div>

            {isActive && (
              <>
                <div className="mb-4 text-center">
                  <p className="text-white text-lg font-mono">{formatTime(recordingTime)}</p>
                  <p className="text-gray-400 text-xs">분석 시간</p>
                </div>

                <div className="mt-4">
                  <p className="text-white text-sm mb-2">음성 레벨 ({audioLevel}%)</p>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-100 ${
                        audioLevel > 70 ? 'bg-red-500' : audioLevel > 30 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(audioLevel, 100)}%` }}
                    />
                  </div>
                  <p className="text-gray-400 text-xs mt-1">🔴 분석 중...</p>
                </div>
              </>
            )}

            <div className="bg-gray-800 rounded p-3 h-32 overflow-y-auto mt-4">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                {analysisLog || '분석 결과가 여기에 표시됩니다...'}
              </pre>
            </div>
          </div>
        </div>

        {/* 분석 결과 */}
        <div className={`border rounded-lg shadow-lg transition-all duration-300 ${getRiskBgColor(analysisResult.riskScore)}`}>
          <div className="p-6">
            <h2 className="text-xl font-semibold text-white mb-4">실시간 위험도 분석</h2>

            <div className="space-y-4">
              {/* 위험도 점수 */}
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <div className="flex items-center">
                  {getRiskIcon(analysisResult.risk)}
                  <span className="text-white ml-2">위험도</span>
                </div>
                <div className="text-right">
                  <span className={`font-bold text-2xl ${getRiskColor(analysisResult.risk)}`}>
                    {analysisResult.riskScore}
                  </span>
                  <span className="text-gray-400 text-sm ml-1">/100</span>
                </div>
              </div>

              {/* 판단 이유 */}
              {analysisResult.reason && (
                <div className="p-3 bg-gray-800 rounded-lg">
                  <span className="text-white block mb-1">AI 분석 결과</span>
                  <p className="text-gray-300 text-sm">{analysisResult.reason}</p>
                </div>
              )}

              {/* 감지된 키워드 */}
              {analysisResult.keywords.length > 0 && (
                <div className="p-3 bg-gray-800 rounded-lg">
                  <span className="text-white block mb-2">감지된 위험 키워드</span>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.keywords.map((keyword, index) => (
                      <span key={index} className="px-2 py-1 bg-red-600 text-white text-xs rounded-full">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 상태 표시 */}
              <div className="p-3 bg-gray-800 rounded-lg">
                <span className="text-white block mb-1">시스템 상태</span>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">실시간 분석</span>
                  <span className={isActive ? 'text-green-400' : 'text-gray-500'}>
                    {isActive ? '활성' : '비활성'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* /분석 결과 카드 */}
      </div>
      {/* /grid */}
    </div>
    {/* /flex-1 컨테이너 */}

    {/* 도움말 모달 */}
    {showHelpModal && (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-6 rounded-lg shadow-xl max-w-lg w-full mx-4 border border-gray-700">
          <h3 className="text-xl font-bold text-white mb-4">🛡️ 보이스피싱 분석 시스템 도움말</h3>

          <div className="space-y-4 text-gray-300 text-sm">
            <div>
              <h4 className="text-white font-semibold mb-2">🎯 시스템 작동 방식</h4>
              <ul className="space-y-1 ml-4">
                <li>• 실시간으로 통화 내용을 분석하여 보이스피싱 위험도를 판단합니다</li>
                <li>• AI가 음성을 텍스트로 변환하고 의심스러운 패턴을 감지합니다</li>
                <li>• 위험도가 50% 이상이면 자동으로 녹음 파일을 보관합니다</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-2">🚨 주의사항</h4>
              <ul className="space-y-1 ml-4">
                <li>• 다음과 같은 키워드가 나오면 즉시 의심하세요:</li>
                <li className="ml-4 text-red-400">- 안전계좌, 보호계좌, 명의도용</li>
                <li className="ml-4 text-red-400">- 경찰청, 검찰청, 금융감독원</li>
                <li className="ml-4 text-red-400">- 계좌이체, 현금인출, OTP 번호</li>
                <li>• 공공기관은 절대 전화로 계좌이체를 요구하지 않습니다</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-2">📱 사용법</h4>
              <ul className="space-y-1 ml-4">
                <li>• 의심스러운 전화가 올 때 '분석 시작' 버튼을 누르세요</li>
                <li>• 통화가 끝나면 '분석 중지' 버튼을 누르세요</li>
                <li>• 위험도가 높으면 자동으로 저장 창이 나타납니다</li>
                <li>• 상대방 전화번호를 입력하고 저장하면 신고에 활용할 수 있습니다</li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => setShowHelpModal(false)}
            className="w-full mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    )}

    {/* 저장 모달 */}
    {showSaveModal && (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-gray-700">
          <h3 className="text-xl font-bold text-white mb-4">위험 통화 감지</h3>
          <p className="text-gray-300 mb-4">
            위험도가 {analysisResult.riskScore}%로 보이스피싱 의심 통화입니다. 전화번호를 입력하시면 증거용 녹음 파일이 저장됩니다.
          </p>

          {/* 분석 요약 */}
          <div className="bg-gray-800 p-3 rounded mb-4">
            <h4 className="text-white text-sm font-semibold mb-2">분석 요약</h4>
            <div className="text-xs text-gray-300 space-y-1">
              <div>
                위험도:{' '}
                <span className={getRiskColor(analysisResult.risk)}>{analysisResult.riskScore}%</span>
              </div>
              {analysisResult.keywords.length > 0 && <div>키워드: {analysisResult.keywords.join(', ')}</div>}
              {analysisResult.reason && <div>사유: {analysisResult.reason}</div>}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-white text-sm mb-2">상대방 전화번호</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="010-1234-5678"
              className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              disabled={isSaving}
            />
          </div>

          <div className="flex space-x-3">
            <button
              onClick={saveCall}
              disabled={isSaving}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? '저장 중...' : '위험 통화 저장'}
            </button>
            <button
              onClick={skipSave}
              disabled={isSaving}
              className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
)
}