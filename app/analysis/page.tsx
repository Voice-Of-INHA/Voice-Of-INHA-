"use client"

import { useState, useRef, useEffect } from "react"
import HelpModal from "../components/modals/HelpModal"
import AnalysisControlPanel from "../analysis/panels/AnalysisControlPanel"
import RiskStatusPanel from "../analysis/panels/RiskStatusPanel"
import AnalysisLogPanel from "../analysis/panels/AnalysisLogPanel"
import SaveCallModal from "../analysis/panels/SaveCallModal"

// 위험도 경고 모달 컴포넌트
interface RiskAlertModalProps {
  isOpen: boolean
  riskScore: number
  keywords: string[]
  reason: string
  onClose: () => void
}

const RiskAlertModal = ({ isOpen, riskScore, keywords, reason, onClose }: RiskAlertModalProps) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 모달 컨텐츠 */}
      <div className="relative bg-red-900 border-2 border-red-500 rounded-lg shadow-2xl max-w-md w-full mx-4 animate-pulse">
        <div className="p-6 text-center">
          {/* 경고 아이콘 */}
          <div className="text-6xl mb-4 animate-bounce">⚠️</div>
          
          {/* 제목 */}
          <h2 className="text-2xl font-bold text-red-100 mb-4">
            ⚠️ 고위험 통화 감지!
          </h2>
          
          {/* 위험도 */}
          <div className="bg-red-800 rounded-lg p-4 mb-4">
            <div className="text-3xl font-bold text-red-100 mb-2">
              위험도: {riskScore}%
            </div>
            <div className="text-red-200">
              보이스피싱 가능성이 높습니다!
            </div>
          </div>
          
          {/* 감지된 키워드 */}
          {keywords.length > 0 && (
            <div className="mb-4">
              <div className="text-sm text-red-200 mb-2">감지된 위험 키워드:</div>
              <div className="flex flex-wrap gap-1 justify-center">
                {keywords.map((keyword, idx) => (
                  <span 
                    key={idx}
                    className="bg-red-700 text-red-100 px-2 py-1 rounded text-xs"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* 판단 근거 */}
          {reason && (
            <div className="mb-6">
              <div className="text-sm text-red-200 mb-1">판단 근거:</div>
              <div className="text-red-100 text-sm bg-red-800 rounded p-2">
                {reason}
              </div>
            </div>
          )}
          
          {/* 안내 메시지 */}
          <div className="bg-yellow-900 border border-yellow-600 rounded p-3 mb-4">
            <div className="text-yellow-100 text-sm">
              <div className="font-semibold mb-1">⚠️ 즉시 조치하세요!</div>
              <div>• 통화를 즉시 종료하세요</div>
              <div>• 개인정보를 절대 제공하지 마세요</div>
              <div>• 의심스러면 112에 신고하세요</div>
            </div>
          </div>
          
          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  )
}

// Safari 구형 브라우저 지원을 위한 타입 확장
interface AnalysisResult {
  risk: 'low' | 'medium' | 'high' | null
  riskScore: number
  keywords: string[]
  reason: string
  timestamp: number
}

interface BackendMessage {
  type: string
  // STT 관련
  transcript?: string
  text?: string
  is_final?: boolean
  speaker?: number
  segments?: Array<{
    speaker: number
    text: string
  }>
  // 백엔드 분석 결과 (실제 응답 형식)
  risk_score?: number           // INTEGER
  risk_level?: string          // STRING (low/medium/high)
  labels?: string[]            // ARRAY of STRING (감지된 라벨들)
  evidence?: string[]          // ARRAY of STRING (증거들)
  reason?: string              // STRING (판단 이유)
  actions?: string[]           // ARRAY of STRING (권장 행동들)
  // 시스템 메시지
  message?: string
  error?: string
  detail?: string
  description?: string
  [key: string]: unknown
}

export default function AnalysisPage() {
  // 녹음 상태
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 통합 녹음/분석 관련 상태
  const [isActive, setIsActive] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  
  // 연결 상태
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  
  // STT와 분석 로그 분리
  const [sttLog, setSttLog] = useState<string>('')           // STT 결과만
  const [analysisLog, setAnalysisLog] = useState<string>('') // 분석 결과만
  const [currentPartialText, setCurrentPartialText] = useState<string>('') // 현재 partial STT
  
  // 분석 관련 상태
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>({
    risk: null,
    riskScore: 0,
    keywords: [],
    reason: '',
    timestamp: 0
  })

  // 위험도 경고 모달 상태
  const [showRiskAlert, setShowRiskAlert] = useState(false)
  const [hasShownRiskAlert, setHasShownRiskAlert] = useState(false) // 중복 표시 방지

  const startRecording = async () => {
    try {
      setError(null)
      setUploadSuccess(false)
      setFileUrl(null)
      setRecordingSeconds(0)

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' })
        setRecordingBlob(audioBlob)
        setAudioUrl(URL.createObjectURL(audioBlob))
        stream.getTracks().forEach((track) => track.stop())

        // ⏱️ 타이머 종료
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }

      mediaRecorder.start(1000)
      setIsRecording(true)

      // ⏱️ 타이머 시작
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1)
      }, 1000)
    } catch (error) {
      console.error('녹음 시작 실패:', error)
      setError('마이크 권한을 확인해주세요.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
    
    // 녹음만 모드일 때는 타이머만 종료
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const uploadToS3 = async () => {
    if (!recordingBlob) {
      setError('녹음 파일이 없습니다.')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      // 1. Presigned URL 요청
      const fileName = `recording_${Date.now()}.mp3`

      const presignResponse = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          contentType: 'audio/mpeg',
        }),
      })

      if (!presignResponse.ok) {
        const errorText = await presignResponse.text()
        throw new Error(`Presigned URL 요청 실패: ${presignResponse.status} - ${errorText}`)
      }

      const { presignedUrl, fileUrl: finalUrl } = await presignResponse.json()
      console.log('✅ Presigned URL 받음:', { presignedUrl, fileUrl: finalUrl })

      // 2. S3에 직접 업로드
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'audio/mpeg',
        },
        body: recordingBlob,
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(`S3 업로드 실패: ${uploadResponse.status} - ${errorText}`)
      }

      console.log('✅ S3 업로드 성공!', finalUrl)
      setFileUrl(finalUrl)
      setUploadSuccess(true)
    } catch (error) {
      console.error('업로드 실패:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(`업로드 실패: ${errorMessage}`)
    } finally {
      setIsUploading(false)
    }
  }

  const saveToBackend = async (phoneNumber: string, fileUrl: string) => {
    try {
      if (!fileUrl) {
        setError('먼저 S3 업로드를 완료해주세요.')
        return
      }
      if (!phoneNumber.trim()) {
        setError('전화번호를 입력해주세요.')
        return
      }
      setIsSaving(true)
      setError(null)

      // 사기 유형 결정 함수
      const determineFraudType = (keywords: string[], reason: string): string => {
        const keywordStr = keywords.join(' ').toLowerCase()
        const reasonStr = reason.toLowerCase()
        
        if (keywordStr.includes('검찰') || reasonStr.includes('검찰')) return '검찰사칭'
        if (keywordStr.includes('경찰') || reasonStr.includes('경찰')) return '경찰사칭'
        if (keywordStr.includes('은행') || keywordStr.includes('계좌')) return '금융사기'
        if (keywordStr.includes('택배') || keywordStr.includes('배송')) return '택배사기'
        if (keywordStr.includes('대출')) return '대출사기'
        return '기타사기'
      }

      const payload = {
        phone: phoneNumber.trim(),
        totalSeconds: recordingSeconds,
        // 실시간 분석 결과 사용
        riskScore: analysisResult.riskScore,
        fraudType: determineFraudType(analysisResult.keywords, analysisResult.reason),
        keywords: analysisResult.keywords,
        audioUrl: fileUrl,
      }

      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const t = await res.text()
        throw new Error(`백엔드 저장 실패: ${res.status} - ${t}`)
      }

      alert('저장 완료: 통화 기록이 서버에 저장되었습니다.')
      // 저장 후 초기화
      setPhoneNumber('')
      setShowSaveModal(false)
      setRecordingBlob(null)
      setAudioUrl(undefined)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const resetRecording = () => {
    setAudioUrl(undefined)
    setRecordingBlob(null)
    setUploadSuccess(false)
    setError(null)
    setIsPlaying(false)
    setFileUrl(null)
    setRecordingSeconds(0)
    
    // 분석 상태도 초기화
    setSttLog('')
    setAnalysisLog('')
    setCurrentPartialText('')
    setAnalysisResult({
      risk: null,
      riskScore: 0,
      keywords: [],
      reason: '',
      timestamp: 0
    })

    // 위험도 경고 상태 초기화
    setShowRiskAlert(false)
    setHasShownRiskAlert(false)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  
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
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 환경 설정 - voice-guard 경로 포함
  const WS_URLS = [
    "wss://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/voice-guard/ws/stt",
    "ws://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/voice-guard/ws/stt"
  ]
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

  // 위험도 60 이상 시 경고 모달 표시
  const checkRiskAlert = (riskScore: number) => {
    if (riskScore >= 60 && !hasShownRiskAlert) {
      setShowRiskAlert(true)
      setHasShownRiskAlert(true)
      
      // 브라우저 알림도 표시 (권한이 있다면)
      if (Notification.permission === 'granted') {
        new Notification('⚠️ 보이스피싱 위험!', {
          body: `위험도 ${riskScore}% - 즉시 통화를 종료하세요!`,
          icon: '/favicon.ico'
        })
      }
    }
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
    this.samplesSent = 0;
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

    let total = 0; 
    for (const b of this.buffer) total += b.length;
    
    if (total >= this.chunkSamples) {
      const merged = new Float32Array(total);
      let o = 0; 
      for (const b of this.buffer) { 
        merged.set(b, o); 
        o += b.length; 
      }
      this.buffer = [];

      let off = 0;
      while (off + this.chunkSamples <= merged.length) {
        const slice = merged.subarray(off, off + this.chunkSamples);
        const i16 = this.floatToInt16(slice);
        
        // 오디오 품질 확인
        const rms = Math.sqrt(slice.reduce((sum, val) => sum + val * val, 0) / slice.length);
        
        // STT 서버로 바이너리 데이터 전송
        this.port.postMessage({ 
          type: 'audio_chunk', 
          pcm16: i16.buffer,
          samples: i16.length,
          rms: rms,
          timestamp: currentTime
        }, [i16.buffer]);
        
        this.samplesSent += i16.length;
        off += this.chunkSamples;
      }
      
      if (off < merged.length) {
        this.buffer.push(merged.subarray(off));
      }
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

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  // 분석 결과 업데이트 함수 (새로운 백엔드 응답 형식에 맞춤)
  const updateAnalysisResult = (msg: BackendMessage) => {
    if (msg.risk_score === undefined) return

    const newRiskScore = Math.max(analysisResult.riskScore, msg.risk_score)
    
    // 기존 키워드와 새로운 라벨들 합치기
    const existingKeywords = analysisResult.keywords || []
    const newLabels = msg.labels || []
    const combinedKeywords = [...new Set([...existingKeywords, ...newLabels])]
    
    const newResult: AnalysisResult = {
      risk: msg.risk_level as 'low' | 'medium' | 'high' || getRiskLevel(newRiskScore),
      riskScore: Math.round(newRiskScore),
      keywords: combinedKeywords,  // labels를 keywords로 매핑
      reason: msg.reason || analysisResult.reason,  // reason 필드 사용
      timestamp: Date.now()
    }
    
    setAnalysisResult(newResult)
    
    // 위험도 60 이상 시 경고 모달 표시
    checkRiskAlert(newResult.riskScore)
    
    // 추가 정보 로깅 (분석 로그에만)
    if (msg.evidence && msg.evidence.length > 0) {
      console.log("🔍 증거:", msg.evidence)
      setAnalysisLog(prev => prev + `[증거] ${msg.evidence?.join(', ')}\n`)
    }
    
    if (msg.actions && msg.actions.length > 0) {
      console.log("⚠️ 권장 행동:", msg.actions)
      setAnalysisLog(prev => prev + `[권장행동] ${msg.actions?.join(', ')}\n`)
    }
  }

  // 백엔드 서버 상태 확인 함수
  const checkBackendHealth = async (): Promise<boolean> => {
    try {
      console.log("🏥 백엔드 서버 상태 확인 중...")
      
      const response = await fetch('/api/proxy?path=health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log("✅ 백엔드 서버 정상:", data)
        setAnalysisLog(prev => prev + `[시스템] 백엔드 서버 정상 연결됨\n`)
        return true
      } else {
        console.error("❌ 백엔드 서버 응답 오류:", response.status)
        setAnalysisLog(prev => prev + `[시스템] 백엔드 서버 오류: ${response.status}\n`)
        return false
      }
    } catch (error) {
      console.error("❌ 백엔드 서버 연결 실패:", error)
      setAnalysisLog(prev => prev + `[시스템] 백엔드 서버 연결 실패\n`)
      return false
    }
  }

  // WebSocket 초기화 (개선된 버전)
  const initializeWebSocket = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const tryConnection = (urlIndex: number): void => {
        if (urlIndex >= WS_URLS.length) {
          reject(new Error("모든 WebSocket URL 연결 실패"))
          return
        }

        const wsUrl = WS_URLS[urlIndex]
        console.log(`🔍 WebSocket 연결 시도 ${urlIndex + 1}/${WS_URLS.length}: ${wsUrl}`)
        
        const socket = new WebSocket(wsUrl)
        socket.binaryType = "arraybuffer"
        
        // 연결 성공 처리
        socket.onopen = () => {
          console.log(`✅ WebSocket 연결 성공: ${wsUrl}`)
          socketRef.current = socket
          setConnectionStatus('connected')
          showToast("연결 성공", `STT 서버에 연결되었습니다`)
          
          // 백엔드가 바로 오디오 데이터를 기대하므로 초기화 메시지 없이 바로 시작
          console.log("🎵 오디오 스트림 준비 완료")
          
          // 연결 유지를 위한 핑 시작 (60초마다 - 오디오가 없을 때만)
          pingIntervalRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              // 오디오 전송 중이 아닐 때만 텍스트 메시지로 핑
              // 백엔드에서 텍스트 메시지를 처리할 수 있음
              console.log("연결 유지 확인")
            }
          }, 60000) // 60초마다
          
          resolve(socket)
        }

        // 메시지 수신 처리 (STT와 분석 결과 분리)
        socket.onmessage = (event) => {
          try {
            // 백엔드에서 텍스트 메시지 수신
            const message = event.data
            console.log("📥 받은 메시지:", message)
            
            // [PARTIAL] 메시지 처리 - 실시간으로 덮어쓰기
            if (message.includes('[PARTIAL]') || message.includes('[PART]')) {
              const partialMatch = message.match(/\[(PARTIAL|PART)\]\s*(.+)/)
              if (partialMatch) {
                const partialText = partialMatch[2].trim()
                setCurrentPartialText(partialText)
                console.log("📝 Partial STT:", partialText)
              }
            }
            
            // [FINAL] 메시지 처리 - STT 로그에 추가하고 partial 초기화
            if (message.includes('[FINAL]')) {
              const finalMatch = message.match(/\[FINAL\]\s*(.+)/)
              if (finalMatch) {
                const transcriptText = finalMatch[1].trim()
                // 기존 로그에 FINAL 문장 추가
                setSttLog(prev => prev + `${transcriptText}\n`)
                // 다음 PART를 위해 partial 텍스트 초기화
                setCurrentPartialText('')
                console.log("✅ Final STT added to log:", transcriptText)
              }
            }
            
            // [RISK] 메시지 처리 - 분석 로그에 저장
            if (message.includes('[RISK]')) {
              try {
                const riskMatch = message.match(/\[RISK\]\s*(.+)/)
                if (riskMatch) {
                  const riskData = JSON.parse(riskMatch[1].replace(/'/g, '"'))
                  
                  // 분석 로그에 한글로 다듬어서 표시
                  if (riskData.riskScore !== undefined) {
                    setAnalysisLog(prev => prev + `🎯 위험도: ${riskData.riskScore}점\n`)
                  }
                  
                  if (riskData.fraudType) {
                    setAnalysisLog(prev => prev + `🚨 사기 유형: ${riskData.fraudType}\n`)
                  }
                  
                  if (riskData.keywords && riskData.keywords.length > 0) {
                    setAnalysisLog(prev => prev + `🔍 감지된 키워드: ${riskData.keywords.join(', ')}\n`)
                  }
                  
                  if (riskData.reason) {
                    setAnalysisLog(prev => prev + `📝 판단 근거: ${riskData.reason}\n`)
                  }
                  
                  if (riskData.actions && riskData.actions.length > 0) {
                    let actionsText = `⚠️ 권장 조치:\n`
                    riskData.actions.forEach((action: string, index: number) => {
                      actionsText += `  ${index + 1}. ${action}\n`
                    })
                    setAnalysisLog(prev => prev + actionsText)
                  }
                  
                  // 분석 결과 업데이트 (새로운 형식에 맞춤)
                  if (riskData.riskScore !== undefined) {
                    updateAnalysisResult({
                      type: "analysis_result",
                      risk_score: riskData.riskScore,
                      risk_level: getRiskLevel(riskData.riskScore), // 프론트에서 계산
                      labels: riskData.keywords || [],
                      reason: riskData.reason || '',
                      evidence: [], // 백엔드에서 제공하지 않음
                      actions: riskData.actions || []
                    })
                  }
                }
              } catch (parseError) {
                console.log("위험도 데이터 파싱 실패:", parseError)
                // 파싱 실패 시 원본 메시지를 분석 로그에 표시
                setAnalysisLog(prev => prev + `📊 ${message}\n`)
              }
            }
            
            // [ACCUMULATED] 메시지 처리 - 분석 로그에 저장
            if (message.includes('[ACCUMULATED]')) {
              const accMatch = message.match(/누적 점수:\s*(\d+)점/)
              if (accMatch) {
                const accScore = parseInt(accMatch[1])
                setAnalysisLog(prev => prev + `📈 누적 위험도: ${accScore}점\n`)
                
                setAnalysisResult(prev => ({
                  ...prev,
                  riskScore: accScore,
                  risk: getRiskLevel(accScore),
                  timestamp: Date.now()
                }))
                
                // 위험도 60 이상 시 경고 모달 표시
                checkRiskAlert(accScore)
              }
            }
            
            // [WARNING] 메시지 처리 - 분석 로그에 저장
            if (message.includes('[WARNING]')) {
              const warningMatch = message.match(/\[WARNING\]\s*(.+)/)
              if (warningMatch) {
                const warningText = warningMatch[1].trim()
                setAnalysisLog(prev => prev + `⚠️ 경고: ${warningText}\n`)
              }
            }
            
            // [ERROR] 메시지 처리 - 분석 로그에 저장
            if (message.includes('[ERROR]')) {
              const errorMatch = message.match(/\[ERROR\]\s*(.+)/)
              if (errorMatch) {
                const errorText = errorMatch[1].trim()
                setAnalysisLog(prev => prev + `❌ 오류: ${errorText}\n`)
              }
            }
            
          } catch (error) {
            console.error("❌ 메시지 처리 오류:", error)
            console.log("📄 원본 데이터:", event.data)
            setAnalysisLog(prev => prev + `[원본] ${event.data}\n`)
          }
        }

        // 오류 처리 (더 자세한 로깅)
        socket.onerror = (error) => {
          console.error(`❌ WebSocket 오류 (${wsUrl}):`, error)
          console.error("소켓 상태:", {
            readyState: socket.readyState,
            url: socket.url,
            protocol: socket.protocol,
            extensions: socket.extensions
          })
          
          // 다음 URL로 시도
          socket.close()
          setTimeout(() => tryConnection(urlIndex + 1), 1000)
        }

        // 연결 종료 처리 (더 자세한 로깅)
        socket.onclose = (event) => {
          console.log(`🔌 WebSocket 연결 종료 (${wsUrl}):`, {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          })
          
          setConnectionStatus('disconnected')
          
          // 연결 종료 코드별 상세 메시지
          let closeMessage = ""
          switch(event.code) {
            case 1000:
              closeMessage = "정상 종료"
              break
            case 1001:
              closeMessage = "서버 종료"
              break
            case 1002:
              closeMessage = "프로토콜 오류"
              break
            case 1003:
              closeMessage = "지원하지 않는 데이터"
              break
            case 1005:
              closeMessage = "클라이언트에서 연결 종료"
              break
            case 1006:
              closeMessage = "비정상 종료 (서버 연결 거부 또는 네트워크 문제)"
              break
            case 1011:
              closeMessage = "서버 내부 오류"
              break
            default:
              closeMessage = `알 수 없는 오류 (${event.code})`
          }
          
          setAnalysisLog(prev => prev + `[연결종료] ${closeMessage}: ${event.reason || '이유 없음'}\n`)
          
          // 사용자가 중지한 경우(1005) 또는 정상 종료(1000)는 재연결하지 않음
          if (event.code !== 1000 && event.code !== 1005 && urlIndex < WS_URLS.length - 1) {
            console.log(`다음 URL로 재시도... (${urlIndex + 1}/${WS_URLS.length})`)
            setTimeout(() => tryConnection(urlIndex + 1), 2000)
          } else if (event.code !== 1000 && event.code !== 1005) {
            reject(new Error(`모든 WebSocket URL 연결 실패 - 마지막 오류: ${closeMessage}`))
          }
        }

        // 연결 타임아웃 (5초로 단축)
        setTimeout(() => {
          if (socket.readyState === WebSocket.CONNECTING) {
            console.log(`⏰ WebSocket 연결 타임아웃 (${wsUrl})`)
            socket.close()
            setTimeout(() => tryConnection(urlIndex + 1), 1000)
          }
        }, 5000)
      }

      // 첫 번째 URL로 연결 시도
      tryConnection(0)
    })
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

      const AudioContextClass = window.AudioContext || AudioContext
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
        if (d && d.type === "audio_chunk" && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          try {
            // 백엔드가 기대하는 형식: 직접 PCM16 바이너리 데이터
            socketRef.current.send(d.pcm16)
            
            // 오디오 품질 체크 및 로깅 (매우 가끔씩만)
            if (d.rms > 0.001 && Math.random() < 0.005) { // 0.5%만 로깅
              console.log(`🎵 오디오 전송: ${d.samples}샘플, RMS: ${d.rms?.toFixed(4)}`)
            }
            
          } catch (error) {
            console.error("오디오 데이터 전송 실패:", error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            setAnalysisLog(prev => prev + `[오류] 오디오 전송 실패: ${errorMessage}\n`)
          }
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

  // WebSocket 연결 테스트 함수
  const testWebSocketConnection = async () => {
    console.log("🧪 WebSocket 연결 테스트 시작...")
    
    const testUrls = [
      "wss://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/voice-guard/ws/stt",
      "ws://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/voice-guard/ws/stt"
    ]

    for (const url of testUrls) {
      try {
        console.log(`🔍 테스트 URL: ${url}`)
        
        const testSocket = new WebSocket(url)
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            testSocket.close()
            reject(new Error('타임아웃'))
          }, 3000)

          testSocket.onopen = () => {
            console.log(`✅ 연결 성공: ${url}`)
            clearTimeout(timeout)
            testSocket.close()
            resolve(url)
          }

          testSocket.onerror = (error) => {
            console.log(`❌ 연결 실패: ${url}`, error)
            clearTimeout(timeout)
            reject(error)
          }

          testSocket.onclose = (event) => {
            console.log(`🔌 연결 종료: ${url} - Code: ${event.code}, Reason: ${event.reason}`)
            clearTimeout(timeout)
          }
        })
        
        // 성공한 URL 찾으면 리턴
        return url
      } catch (error) {
        console.log(`❌ ${url} 실패:`, error)
        continue
      }
    }
    
    throw new Error("모든 WebSocket URL 연결 실패")
  }

  // 네트워크 진단 함수 강화
  const diagnoseNetwork = async () => {
    console.log("🔍 전체 네트워크 진단 시작...")
    setAnalysisLog(prev => prev + `[진단] 네트워크 연결 상태 확인 중...\n`)
    
    // 1. 인터넷 연결 확인
    try {
      await fetch('https://www.google.com', { 
        mode: 'no-cors',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      })
      console.log("✅ 인터넷 연결 정상")
      setAnalysisLog(prev => prev + `[진단] ✅ 인터넷 연결 정상\n`)
    } catch (error) {
      console.error("❌ 인터넷 연결 문제:", error)
      setAnalysisLog(prev => prev + `[진단] ❌ 인터넷 연결 문제\n`)
      return false
    }

    // 2. 백엔드 서버 상태 확인
    const isBackendHealthy = await checkBackendHealth()
    
    // 3. WebSocket 지원 확인
    if (typeof WebSocket === 'undefined') {
      console.error("❌ WebSocket이 지원되지 않는 브라우저")
      setAnalysisLog(prev => prev + `[진단] ❌ WebSocket 미지원 브라우저\n`)
      return false
    }
    
    console.log("✅ WebSocket 지원됨")
    setAnalysisLog(prev => prev + `[진단] ✅ WebSocket 지원됨\n`)

    // 4. WebSocket 연결 테스트
    try {
      const workingUrl = await testWebSocketConnection()
      console.log(`✅ WebSocket 연결 가능: ${workingUrl}`)
      setAnalysisLog(prev => prev + `[진단] ✅ WebSocket 연결 가능: ${workingUrl}\n`)
      return workingUrl
    } catch (error) {
      console.error("❌ WebSocket 연결 불가:", error)
      setAnalysisLog(prev => prev + `[진단] ❌ WebSocket 연결 불가\n`)
      return false
    }
  }

  // HTTP 폴링 방식 대체 구현 (WebSocket 실패 시)
  const startHttpPollingMode = async () => {
    console.log("🔄 HTTP 폴링 모드로 전환...")
    setAnalysisLog(prev => prev + `[시스템] HTTP 폴링 모드로 전환\n`)
    
    // 오디오 스트림만 시작 (WebSocket 없이)
    try {
      const stream = await initializeAudioStream()
      
      measureAudioLevel()      
      setConnectionStatus('connected')
      showToast("대체 모드 시작", "녹음 모드로 시작되었습니다.")
      
    } catch (error) {
      console.error("HTTP 폴링 모드 실패:", error)
      throw error
    }
  }

  // 실시간 분석 시작 함수
  const startAnalysis = async () => {
    try {
      setConnectionStatus('connecting')
      setIsActive(true)
      setIsRecording(true)
      setSttLog('')
      setAnalysisLog('')
      setCurrentPartialText('')
      setError(null)
      setUploadSuccess(false)
      setFileUrl(null)
      setRecordingSeconds(0)
      
      // 위험도 경고 상태 초기화
      setShowRiskAlert(false)
      setHasShownRiskAlert(false)
      
      setAnalysisResult({
        risk: null,
        riskScore: 0,
        keywords: [],
        reason: '',
        timestamp: 0
      })

      // 브라우저 알림 권한 요청
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
          console.log("✅ 브라우저 알림 권한 허용됨")
        }
      }

      // 디버그 정보 표시
      console.log("🔍 디버그 정보:")
      console.log("- User Agent:", navigator.userAgent)
      console.log("- WebSocket 지원:", typeof WebSocket !== 'undefined')
      console.log("- MediaRecorder 지원:", typeof MediaRecorder !== 'undefined')
      console.log("- 현재 URL:", window.location.href)
      console.log("- 프로토콜:", window.location.protocol)
      
      setAnalysisLog(prev => prev + `[디버그] 브라우저: ${navigator.userAgent.split(' ')[0]}\n`)
      setAnalysisLog(prev => prev + `[디버그] 프로토콜: ${window.location.protocol}\n`)

      // 1. 전체 네트워크 진단
      const diagnosisResult = await diagnoseNetwork()
      
      if (diagnosisResult && typeof diagnosisResult === 'string') {
        // WebSocket 연결 가능 - 정상 모드
        console.log("🚀 WebSocket 모드로 시작")
        await initializeWebSocket()
        const stream = await initializeAudioStream()
        
        // MP3 녹음 시작
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' })
          setRecordingBlob(audioBlob)
          setAudioUrl(URL.createObjectURL(audioBlob))
        }

        mediaRecorder.start(1000)
        measureAudioLevel()
        
        // 녹음 타이머 시작
        timerRef.current = setInterval(() => {
          setRecordingSeconds((s) => s + 1)
        }, 1000)
        
        showToast("분석 시작", "실시간 WebSocket 분석과 MP3 녹음이 시작되었습니다.")
      } else {
        // WebSocket 실패 - 녹음만 모드
        console.log("🔄 녹음 전용 모드로 시작")
        await startHttpPollingMode()
        
        // MP3 녹음 시작
        const stream = await initializeAudioStream()
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' })
          setRecordingBlob(audioBlob)
          setAudioUrl(URL.createObjectURL(audioBlob))
        }

        mediaRecorder.start(1000)
        measureAudioLevel()
        
        // 녹음 타이머 시작
        timerRef.current = setInterval(() => {
          setRecordingSeconds((s) => s + 1)
        }, 1000)
      }
      
    } catch (error) {
      console.error("❌ 모든 연결 방식 실패:", error)
      setIsActive(false)
      setIsRecording(false)
      setConnectionStatus('error')
      
      if (error instanceof Error) {
        showToast("시작 실패", `연결 실패: ${error.message}`, "destructive")
        setAnalysisLog(prev => prev + `[오류] ${error.message}\n`)
      }
    }
  }

  // 통합 중지 함수 (분석 + 녹음 또는 녹음만)
  const stopAnalysis = () => {
    console.log("녹음/분석 중지")
    
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

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    stopRecordingTimer()
    setIsActive(false)
    setIsRecording(false)
    setConnectionStatus('disconnected')
    setAudioLevel(0)
    setCurrentPartialText('') // partial 텍스트 초기화
    
    // 위험도가 50% 이상인 경우에만 저장 모달 표시
    if (finalRiskScore >= 50) {
      console.log(`⚠️ 위험도 ${finalRiskScore}%로 저장 모달 표시`)
      setShowSaveModal(true)
    } else {
      console.log(`✅ 위험도 ${finalRiskScore}%로 안전한 통화로 판단, 녹음 파일 삭제`)
      setAnalysisLog(prev => prev + `[시스템] 위험도 ${finalRiskScore}%로 안전한 통화로 판단되어 녹음 파일이 삭제되었습니다\n`)
      // 녹음 파일 삭제
      setRecordingBlob(null)
      setAudioUrl(undefined)
      recordedChunksRef.current = []
      showToast("분석 완료", "안전한 통화로 판단되어 녹음이 삭제되었습니다.")
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

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }

        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }

        // 녹음 데이터 정리
        recordedChunksRef.current = []
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

      {/* 녹음 중 표시 */}
      {isRecording && (
        <div className="text-center space-y-4 mb-6">
          <div className="text-red-500 font-semibold text-lg">🎙️ 녹음 중... ({recordingSeconds}s)</div>
        </div>
      )}

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
                recordingTime={recordingSeconds}
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

          {/* STT와 분석 로그를 분리해서 표시 */}
          <div className="space-y-4">
            {/* STT 결과 패널 */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                  🎯 음성 인식 결과
                </h3>
                <div className="bg-gray-800 rounded-lg p-4 max-h-48 overflow-y-auto">
                  {/* STT 결과 표시 영역 */}
                  <div className="text-white text-sm font-mono whitespace-pre-wrap">
                    {/* 기존 FINAL 결과들 (로그에 저장된 것들) */}
                    {sttLog}
                    
                    {/* 현재 진행 중인 PART 결과 (실시간 업데이트) */}
                    {currentPartialText && (
                      <span className="text-gray-400 italic">
                        {currentPartialText}...
                      </span>
                    )}
                    
                    {/* 아무것도 없을 때 기본 메시지 */}
                    {!sttLog && !currentPartialText && (
                      <span className="text-gray-500">
                        음성 인식 결과가 여기에 표시됩니다...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 분석 결과 패널 */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                  📊 위험도 분석 결과
                </h3>
                <div className="bg-gray-800 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <div className="text-white text-sm font-mono whitespace-pre-wrap">
                    {analysisLog || '분석 결과가 여기에 표시됩니다...'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 위험도 경고 모달 */}
      <RiskAlertModal
        isOpen={showRiskAlert}
        riskScore={analysisResult.riskScore}
        keywords={analysisResult.keywords}
        reason={analysisResult.reason}
        onClose={() => setShowRiskAlert(false)}
      />

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
        recordingBlob={recordingBlob}
        recordingSeconds={recordingSeconds}
        onPhoneNumberChange={setPhoneNumber}
        onSave={saveToBackend}
        onSkip={skipSave}
      />
    </div>
  )
}