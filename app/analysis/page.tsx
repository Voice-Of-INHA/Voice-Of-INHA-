"use client"

import { useState, useRef, useEffect } from "react"
import HelpModal from "../components/modals/HelpModal"
import AnalysisControlPanel from "./panels/AnalysisControlPanel"
import RiskStatusPanel from "./panels/RiskStatusPanel"
import AnalysisLogPanel from "./panels/AnalysisLogPanel"
import SaveCallModal from "./panels/SaveCallModal"

// Safari 구형 브라우저 지원을 위한 타입 확장
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
  message?: string
  error?: string
  detail?: string
  description?: string
  [key: string]: unknown
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
  const WS_URL = "ws://174.44.164.18:8000/ws/analysis"
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
            
            if (msg.segments && Array.isArray(msg.segments) && msg.segments.length > 0) {
              const lines = msg.segments.map(s => `[SPK${s.speaker}] ${s.text || ""}`)
              logText = `${msg.is_final ? '[FINAL]' : '[PART]'} ${lines.join(' | ')}`
            } else {
              const spk = (msg.speaker !== undefined && msg.speaker !== null) ? `[SPK${msg.speaker}] ` : ""
              logText = `${msg.is_final ? '[FINAL]' : '[PART]'} ${spk}${msg.transcript || ""}`
            }
            
            if (msg.risk_score !== undefined) {
              logText += ` [위험도: ${msg.risk_score}%]`
            }
            
            setAnalysisLog(prev => prev + logText + '\n')
            
            if (msg.is_final && msg.risk_score !== undefined) {
              updateAnalysisResult(msg)
            }
          } else if (msg.type === "error") {
            console.error("백엔드 오류:", msg)
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

    const newRiskScore = Math.max(analysisResult.riskScore, msg.risk_score)
    
    const newResult: AnalysisResult = {
      risk: msg.risk_level || getRiskLevel(newRiskScore),
      riskScore: Math.round(newRiskScore),
      keywords: [...new Set([...analysisResult.keywords, ...(msg.detected_keywords || [])])],
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

      const AudioContextClass = window.AudioContext || window.webkitAudioContext || AudioContext
      audioContextRef.current = new AudioContextClass({ sampleRate: 48000 })
      
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      
      const source = audioContextRef.current.createMediaStreamSource(stream)
      
      const blobURL = buildWorkletBlobURL()
      await audioContextRef.current.audioWorklet.addModule(blobURL)
      
      const workletNode = new AudioWorkletNode(audioContextRef.current, "resampler-processor")
      workletNodeRef.current = workletNode
      
      workletNode.port.onmessage = (ev) => {
        const d = ev.data
        if (d && d.type === "chunk" && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(d.pcm16)
        }
      }
      
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
      
      setAnalysisResult({
        risk: null,
        riskScore: 0,
        keywords: [],
        reason: '',
        timestamp: 0
      })
      
      await initializeWebSocket()
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
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect() } catch {}
      workletNodeRef.current = null
    }
    
    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch {}
      audioContextRef.current = null
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    if (socketRef.current) {
      try { socketRef.current.close() } catch {}
      socketRef.current = null
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    stopRecordingTimer()
    setIsActive(false)
    setConnectionStatus('disconnected')
    setAudioLevel(0)
    
    if (finalRiskScore >= 50) {
      setShowSaveModal(true)
    } else {
      recordedChunksRef.current = []
      showToast("분석 완료", "안전한 통화로 판단되어 녹음이 삭제되었습니다.")
    }
  }

  // 통화 저장 함수 (API route 사용)
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

      console.log("📤 의심 통화 저장 시작:", phoneNumber.trim())

      const response = await fetch('/api/proxy', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`업로드 실패: ${response.status} - ${errorText}`)
      }

      const result = await response.text()
      console.log("✅ 의심 통화 저장 성공:", result)

      showToast("저장 완료", "의심 통화가 성공적으로 저장되었습니다.")
      
      recordedChunksRef.current = []
      setPhoneNumber('')
      setShowSaveModal(false)

    } catch (error) {
      console.error("❌ 저장 실패:", error)
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

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (isActive) {
        console.log("분석 중지")
        
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }

        if (workletNodeRef.current) {
          try { workletNodeRef.current.disconnect() } catch {}
          workletNodeRef.current = null
        }
        
        if (audioContextRef.current) {
          try { audioContextRef.current.close() } catch {}
          audioContextRef.current = null
        }
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        
        if (socketRef.current) {
          try { socketRef.current.close() } catch {}
          socketRef.current = null
        }

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }

        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
      }
    }
  }, [isActive])

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
              <AnalysisControlPanel
                isActive={isActive}
                connectionStatus={connectionStatus}
                recordingTime={recordingTime}
                audioLevel={audioLevel}
                onStartAnalysis={startAnalysis}
                onStopAnalysis={stopAnalysis}
              />
              
              <RiskStatusPanel
                analysisResult={analysisResult}
                isActive={isActive}
                connectionStatus={connectionStatus}
              />
            </div>
          </div>

          {/* 분석 로그 */}
          <AnalysisLogPanel analysisLog={analysisLog} />
        </div>
      </div>

      {/* 도움말 모달 */}
      <HelpModal 
        isOpen={showHelpModal} 
        onClose={() => setShowHelpModal(false)} 
      />

      {/* 저장 모달 */}
      <SaveCallModal
        isOpen={showSaveModal}
        analysisResult={analysisResult}
        phoneNumber={phoneNumber}
        isSaving={isSaving}
        onPhoneNumberChange={setPhoneNumber}
        onSave={saveCall}
        onSkip={skipSave}
      />
    </div>
  )
}