"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"

// 인터페이스 정의
interface Round {
  round: number
  question: string
  audio_url: string
}

interface Scenario {
  id: number
  title: string
  rounds: Round[]
  guideline: string
}

interface UserResponse {
  round: number
  audioBlob: Blob
  transcription?: string
}

// WebKit AudioContext 타입 정의
interface WebKitWindow extends Window {
  webkitAudioContext: typeof AudioContext
}

// VAD (Voice Activity Detection) 모듈
const VoiceActivityDetector = {
  // VAD 설정
  VOLUME_THRESHOLD: 30, // 음성 감지 임계값 (조정 가능)
  SILENCE_DURATION: 5000, // 침묵 지속 시간 (ms, 조정 가능)
  
  analyser: null as AnalyserNode | null,
  dataArray: null as Uint8Array | null,
  isInitialized: false,
  
  // VAD 초기화
  init(audioContext: AudioContext, source: MediaStreamAudioSourceNode) {
    try {
      this.analyser = audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.8
      source.connect(this.analyser)
      
      const bufferLength = this.analyser.frequencyBinCount
      this.dataArray = new Uint8Array(bufferLength)
      this.isInitialized = true
      
      console.log('VAD 초기화 완료:', { bufferLength, fftSize: this.analyser.fftSize })
    } catch (error) {
      console.error('VAD 초기화 실패:', error)
      this.isInitialized = false
    }
  },
  
  // 현재 볼륨 측정
  getVolume(): number {
    if (!this.isInitialized || !this.analyser || !this.dataArray) {
      return 0
    }
    
    try {
      let sum = 0
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i]
      }
      // 평균 볼륨 반환
      return sum / this.dataArray.length
    } catch (error) {
      console.error('볼륨 측정 오류:', error)
      return 0
    }
  },
  
  // 음성 감지 여부
  isVoiceDetected(): boolean {
    const volume = this.getVolume()
    return volume > this.VOLUME_THRESHOLD
  },
  
  // VAD 정리
  cleanup() {
    this.analyser = null
    this.dataArray = null
    this.isInitialized = false
  }
}

// 메인 컴포넌트
export default function SimulationPage() {
  const router = useRouter()
  
  // 시나리오 데이터 (실제로는 props나 API에서 받아올 것)
  const [scenario] = useState<Scenario>({
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
    guideline: "경찰서에서는 대포통장 관련 전화를 걸지 않습니다. 보이스피싱 범죄의 전형적인 수법 중 하나가 \"자신을 경찰, 검찰이라고 사칭하며 대포통장과 관련된 전화를 거는 것\"입니다."
  })

  // 상태 관리
  const [currentRound, setCurrentRound] = useState(0)
  const [phase, setPhase] = useState<'preparing' | 'playing' | 'listening' | 'processing' | 'completed'>('preparing')
  const [userResponses, setUserResponses] = useState<UserResponse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAudioReady, setIsAudioReady] = useState(false) // 오디오 초기화 상태

  // Ref 객체
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // 컴포넌트 마운트 시 오디오 초기화
  useEffect(() => {
    const init = async () => {
      try {
        await initializeAudio()
        setIsAudioReady(true)
      } catch (error) {
        console.error('오디오 초기화 실패:', error)
        alert('마이크 권한이 필요합니다. 브라우저 설정을 확인해주세요.')
        setIsAudioReady(false)
      }
    }
    init()
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      cleanup()
    }
  }, [])
  
  // 오디오가 준비되거나 라운드가 변경될 때마다 다음 라운드 시작
  useEffect(() => {
    if (isAudioReady) {
      startCurrentRound()
    }
  }, [isAudioReady, currentRound])

  // 오디오 시스템 초기화 함수
  const initializeAudio = async () => {
    console.log('오디오 초기화 시작...')
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    })
    streamRef.current = stream
    console.log('마이크 스트림 획득 완료')

    audioContextRef.current = new window.AudioContext
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }
    
    const source = audioContextRef.current.createMediaStreamSource(stream)
    VoiceActivityDetector.init(audioContextRef.current, source)
    console.log('VAD 초기화 완료')

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' 
      : 'audio/webm'
      
    mediaRecorderRef.current = new MediaRecorder(stream, { mimeType })
    console.log('MediaRecorder 생성 완료:', mimeType)

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data)
      }
    }

    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType })
      handleRecordingComplete(audioBlob)
      recordedChunksRef.current = []
    }

    mediaRecorderRef.current.onerror = (event) => {
      console.error('MediaRecorder 오류:', event)
    }
  }

  // 현재 라운드 시작
  const startCurrentRound = async () => {
    // 모든 라운드가 완료되면 분석 시작
    if (currentRound >= scenario.rounds.length) {
      await analyzeResponses()
      return
    }

    setPhase('playing')
    const round = scenario.rounds[currentRound]
    
    // 오디오 재생
    const audio = new Audio(round.audio_url)
    audioRef.current = audio
    
    audio.onended = () => {
      startListening()
    }

    audio.onerror = (error) => {
      console.error('오디오 재생 실패:', error)
      alert('오디오를 재생할 수 없습니다.')
    }

    try {
      await audio.play()
    } catch (error) {
      console.error('오디오 재생 오류:', error)
    }
  }

  // 사용자 음성 감지 및 녹음 시작
  const startListening = () => {
    console.log('음성 인식 시작')
    setPhase('listening')
    
    if (!mediaRecorderRef.current || !VoiceActivityDetector.isInitialized) {
      console.error('MediaRecorder 또는 VAD가 초기화되지 않음')
      return
    }

    try {
      mediaRecorderRef.current.start(100)
      console.log('녹음 시작됨')
    } catch (error) {
      console.error('녹음 시작 실패:', error)
      return
    }
    
    // VAD (음성 감지) 인터벌 시작
    vadIntervalRef.current = setInterval(() => {
      const isVoice = VoiceActivityDetector.isVoiceDetected()
      
      if (isVoice) {
        // 음성이 감지되면 침묵 타이머 리셋
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      } else {
        // 침묵이 감지되면 타이머 시작 (이미 시작되지 않았다면)
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            console.log('침묵 감지됨, 녹음 중단')
            stopListening()
          }, VoiceActivityDetector.SILENCE_DURATION)
        }
      }
    }, 100)
  }

  // 녹음 중단 및 처리
  const stopListening = () => {
    setPhase('processing')
    
    // VAD 관련 정리
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    // 녹음 중단
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  // 녹음 완료 후 처리 (STT 요청)
  const handleRecordingComplete = async (audioBlob: Blob) => {
    try {
      setIsLoading(true)
      
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('round', (currentRound + 1).toString())

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`STT 요청 실패: ${response.status}`)
      }

      const sttResult = await response.json()
      
      const userResponse: UserResponse = {
        round: currentRound + 1,
        audioBlob,
        transcription: sttResult.transcription || ''
      }

      setUserResponses(prev => [...prev, userResponse])
      
      setCurrentRound(prev => prev + 1)
      
      setTimeout(() => {
        // 다음 라운드는 useEffect에서 자동으로 시작됨
      }, 1000)

    } catch (error) {
      console.error('녹음 처리 실패:', error)
      alert('음성 처리 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  // 최종 응답 분석 및 결과 페이지 이동
  const analyzeResponses = async () => {
    try {
      setPhase('processing')
      setIsLoading(true)

      const analysisData = {
        scenario_id: scenario.id,
        scenario_title: scenario.title,
        questions: scenario.rounds.map(r => r.question),
        user_responses: userResponses.map(r => r.transcription || ''),
        guideline: scenario.guideline
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysisData)
      })

      if (!response.ok) {
        throw new Error(`분석 요청 실패: ${response.status}`)
      }

      const analysisResult = await response.json()
      
      sessionStorage.setItem('simulationResult', JSON.stringify({
        scenario,
        userResponses: userResponses.map(r => ({ 
          round: r.round, 
          transcription: r.transcription 
        })),
        analysis: analysisResult
      }))

      router.push('/simulation/results')

    } catch (error) {
      console.error('분석 실패:', error)
      alert('분석 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  // 모든 오디오 자원 정리
  const cleanup = () => {
    console.log('오디오 정리 시작')
    
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
        console.log('오디오 트랙 정지:', track.kind)
      })
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    VoiceActivityDetector.cleanup()
    console.log('오디오 정리 완료')
  }

  // UI 상태 메시지
  const getPhaseMessage = () => {
    switch (phase) {
      case 'preparing':
        return '시뮬레이션을 준비하고 있습니다...'
      case 'playing':
        return `라운드 ${currentRound + 1}: 상대방이 말하고 있습니다...`
      case 'listening':
        return '🎤 당신의 응답을 기다리고 있습니다. 말씀해주세요!'
      case 'processing':
        return '응답을 처리하고 있습니다...'
      case 'completed':
        return '시뮬레이션이 완료되었습니다!'
      default:
        return ''
    }
  }

  // UI 상태 아이콘
  const getPhaseIcon = () => {
    switch (phase) {
      case 'preparing':
        return '⚙️'
      case 'playing':
        return '📞'
      case 'listening':
        return '🎤'
      case 'processing':
        return '⏳'
      case 'completed':
        return '✅'
      default:
        return ''
    }
  }

  // JSX 반환
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">보이스피싱 시뮬레이션</h1>
          <h2 className="text-xl text-gray-300 mb-4">{scenario.title}</h2>
          <div className="flex items-center justify-center space-x-2">
            <span className="text-4xl">{getPhaseIcon()}</span>
            <p className="text-lg text-gray-400">{getPhaseMessage()}</p>
          </div>
        </div>

        {/* 진행 상황 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400">진행 상황</span>
            <span className="text-white">{currentRound} / {scenario.rounds.length}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(currentRound / scenario.rounds.length) * 100}%` }}
            />
          </div>
        </div>

        {/* 현재 라운드 정보 */}
        {currentRound < scenario.rounds.length && (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                라운드 {currentRound + 1}
              </span>
            </div>
            
            {phase === 'playing' && (
              <div className="text-gray-300">
                <p className="mb-2">📞 상대방:</p>
                <p className="text-lg italic border-l-4 border-red-500 pl-4">
                  &ldquo;{scenario.rounds[currentRound].question}&rdquo;
                </p>
              </div>
            )}

            {phase === 'listening' && (
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

        {/* 로딩 상태 */}
        {isLoading && (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
            <p className="text-gray-400">처리 중...</p>
          </div>
        )}

        {/* 완료된 라운드들 */}
        {userResponses.length > 0 && (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">완료된 응답</h3>
            <div className="space-y-3">
              {userResponses.map((response, index) => (
                <div key={index} className="bg-gray-800 p-3 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">
                      라운드 {response.round}
                    </span>
                    <span className="text-green-400">✓</span>
                  </div>
                  <p className="text-gray-300 text-sm">
                    {response.transcription || '음성 변환 중...'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 안내 */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            이 시뮬레이션은 보이스피싱 대응 능력 향상을 위한 연습입니다.
          </p>
        </div>
      </div>
    </div>
  )
}