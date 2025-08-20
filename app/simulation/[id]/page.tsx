"use client"
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

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

interface AnalysisResult {
  answer: string
  risk: 'LOW' | 'MEDIUM' | 'HIGH'
  score: number
  explanation: string
}

export default function SimulationGamePage() {
  const params = useParams()
  const router = useRouter()
  const scenarioId = params.id as string
  
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [currentRound, setCurrentRound] = useState(1)
  const [loading, setLoading] = useState(true)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [allRoundResults, setAllRoundResults] = useState<AnalysisResult[]>([])
  const [sessionId, setSessionId] = useState<string>('')
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [isListening, setIsListening] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // WebSocket URLs
  const WS_URLS = [
    "wss://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/voice-guard/ws/analysis",
    "ws://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/voice-guard/ws/analysis"
  ]

  // 시나리오 데이터 로드
  const loadScenario = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/proxy?path=scenario&id=${scenarioId}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('시나리오 데이터:', data)
        setScenario(data)
        
        // 세션 시작
        await startSession(data.id)
      } else {
        console.error('시나리오 로드 실패')
        alert('시나리오를 불러올 수 없습니다.')
        router.push('/simulation')
      }
    } catch (error) {
      console.error('시나리오 로드 오류:', error)
      alert('시나리오를 불러오는 중 오류가 발생했습니다.')
      router.push('/simulation')
    } finally {
      setLoading(false)
    }
  }

  // 세션 시작
  const startSession = async (scenarioId: number) => {
    try {
      const response = await fetch('/api/proxy?path=session&action=start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scenarioId: scenarioId,
          userId: 'user_' + Date.now()
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setSessionId(data.sessionId || `session_${Date.now()}`)
        console.log('세션 시작:', data)
      }
    } catch (error) {
      console.error('세션 시작 실패:', error)
      setSessionId(`session_${Date.now()}`)
    }
  }

  // 오디오 재생
  const playAudio = () => {
    if (audioRef.current) {
      setAudioPlaying(true)
      audioRef.current.play()
      audioRef.current.onended = () => setAudioPlaying(false)
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
    this.targetRate = 16000;
    this.ratio = this.sourceRate / this.targetRate;
    this.chunkSamples = Math.floor(16000 * 500 / 1000);
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
        
        this.port.postMessage({ 
          type: 'audio_chunk', 
          pcm16: i16.buffer,
          samples: i16.length,
          timestamp: currentTime
        }, [i16.buffer]);
        
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

  // WebSocket 초기화
  const initializeWebSocket = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const tryConnection = (urlIndex: number): void => {
        if (urlIndex >= WS_URLS.length) {
          reject(new Error("모든 WebSocket URL 연결 실패"))
          return
        }

        const wsUrl = WS_URLS[urlIndex]
        console.log(`WebSocket 연결 시도: ${wsUrl}`)
        
        const socket = new WebSocket(wsUrl)
        socket.binaryType = "arraybuffer"
        
        socket.onopen = () => {
          console.log(`WebSocket 연결 성공: ${wsUrl}`)
          socketRef.current = socket
          setConnectionStatus('connected')
          resolve(socket)
        }

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            console.log('분석 결과:', message)
            
            if (message.answer || message.risk || message.score || message.explanation) {
              const result = {
                answer: message.answer || '음성 답변',
                risk: message.risk || 'MEDIUM',
                score: message.score || 0,
                explanation: message.explanation || '분석 완료'
              }
              
              setAnalysisResult(result)
              
              // 라운드 결과를 배열에 저장
              setAllRoundResults(prev => [...prev, result])
              
              // 응답 받으면 즉시 WebSocket 연결 종료
              stopListening()
            }
          } catch (error) {
            console.error('메시지 파싱 오류:', error)
          }
        }

        socket.onerror = (error) => {
          console.error(`WebSocket 오류 (${wsUrl}):`, error)
          socket.close()
          setTimeout(() => tryConnection(urlIndex + 1), 1000)
        }

        socket.onclose = (event) => {
          console.log(`WebSocket 연결 종료 (${wsUrl}):`, event.code)
          setConnectionStatus('disconnected')
          
          if (event.code !== 1000 && event.code !== 1005 && urlIndex < WS_URLS.length - 1) {
            setTimeout(() => tryConnection(urlIndex + 1), 2000)
          } else if (event.code !== 1000 && event.code !== 1005) {
            reject(new Error("모든 WebSocket URL 연결 실패"))
          }
        }

        setTimeout(() => {
          if (socket.readyState === WebSocket.CONNECTING) {
            socket.close()
            setTimeout(() => tryConnection(urlIndex + 1), 1000)
          }
        }, 5000)
      }

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
      
      const source = audioContextRef.current.createMediaStreamSource(stream)
      
      const blobURL = buildWorkletBlobURL()
      await audioContextRef.current.audioWorklet.addModule(blobURL)
      
      const workletNode = new AudioWorkletNode(audioContextRef.current, "resampler-processor")
      workletNodeRef.current = workletNode
      
      workletNode.port.onmessage = (ev) => {
        const d = ev.data
        if (d && d.type === "audio_chunk" && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          try {
            socketRef.current.send(d.pcm16)
          } catch (error) {
            console.error("오디오 데이터 전송 실패:", error)
          }
        }
      }
      
      source.connect(workletNode)
      workletNode.connect(audioContextRef.current.destination)
      
      return stream
    } catch (error) {
      console.error("마이크 접근 실패:", error)
      throw new Error("마이크 접근 권한을 허용해주세요.")
    }
  }

  // 음성 분석 시작 (WebSocket 연결 및 실시간 오디오 스트리밍)
  const startListening = async () => {
    try {
      setConnectionStatus('connecting')
      setAnalysisResult(null)

      // WebSocket 연결
      await initializeWebSocket()
      
      // 오디오 스트림 초기화 및 실시간 전송
      await initializeAudioStream()
      
      setIsListening(true)
      console.log('실시간 음성 분석 시작')
    } catch (error) {
      console.error('음성 분석 시작 실패:', error)
      setConnectionStatus('error')
      alert('마이크 접근 권한이 필요합니다.')
    }
  }

  // 음성 분석 중지
  const stopListening = () => {
    setIsListening(false)
    
    // WebSocket 연결 종료
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }

    // 오디오 스트림 정리
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

    setConnectionStatus('disconnected')
    console.log('실시간 음성 분석 중지')
  }

  // 다음 라운드로 이동
  const nextRound = () => {
    if (!scenario) return
    
    if (currentRound < scenario.rounds.length) {
      setCurrentRound(currentRound + 1)
      setAnalysisResult(null)
    } else {
      // 마지막 라운드 완료 - 결과 페이지로 이동하면서 모든 라운드 결과 전달
      const resultsData = {
        sessionId: sessionId,
        scenarioId: scenarioId,
        scenarioTitle: scenario.title,
        allRounds: allRoundResults,
        guideline: scenario.guideline
      }
      
      // localStorage에 결과 저장 (결과 페이지에서 사용)
      localStorage.setItem('simulationResults', JSON.stringify(resultsData))
      
      router.push(`result?sessionId=${sessionId}`)
    }
  }

  // 위험도에 따른 색상
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'HIGH': return 'text-red-400 bg-red-900/30 border-red-500'
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-900/30 border-yellow-500'
      case 'LOW': return 'text-green-400 bg-green-900/30 border-green-500'
      default: return 'text-gray-400 bg-gray-900/30 border-gray-500'
    }
  }

  useEffect(() => {
    loadScenario()
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [scenarioId])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">시나리오 로딩 중...</div>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">시나리오를 찾을 수 없습니다.</div>
      </div>
    )
  }

  const currentRoundData = scenario.rounds.find(r => r.round === currentRound)

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 헤더 */}
      <div className="border-b border-gray-600 p-6">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => router.push('/simulation')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← 돌아가기
          </button>
          <h1 className="text-2xl font-bold">
            {scenario.title} 시나리오 - Round {currentRound}
          </h1>
          <div className="text-gray-400">
            {currentRound} / {scenario.rounds.length}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* 현재 라운드 질문 */}
        {currentRoundData && (
          <div className="border border-white p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">질문:</h2>
            <p className="text-lg mb-6 leading-relaxed">"{currentRoundData.question}"</p>
            
            {/* 오디오 재생 */}
            <div className="flex items-center gap-4">
              <button
                onClick={playAudio}
                disabled={audioPlaying}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  audioPlaying 
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                🔊 {audioPlaying ? '재생 중...' : '오디오 재생'}
              </button>
              
              <audio
                ref={audioRef}
                src={currentRoundData.audio_url}
                preload="metadata"
              />
            </div>
          </div>
        )}

        {/* 답변 입력 섹션 */}
        <div className="border border-gray-600 p-6 mb-8">
          <h3 className="text-lg font-semibold mb-4">실시간 음성 분석:</h3>
          
          {/* 음성 분석 컨트롤 */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-2">
              <button
                onClick={isListening ? stopListening : startListening}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                  isListening
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isListening ? '🔴 분석 중지' : '🎤 음성 분석 시작'}
              </button>
              
              {/* 연결 상태 표시 */}
              <div className={`px-3 py-1 rounded-lg text-sm ${
                connectionStatus === 'connected' ? 'bg-green-900/30 text-green-400' :
                connectionStatus === 'connecting' ? 'bg-yellow-900/30 text-yellow-400' :
                connectionStatus === 'error' ? 'bg-red-900/30 text-red-400' :
                'bg-gray-900/30 text-gray-400'
              }`}>
                {connectionStatus === 'connected' ? '분석 중...' :
                 connectionStatus === 'connecting' ? '연결 중...' :
                 connectionStatus === 'error' ? '연결 오류' :
                 '연결 안됨'}
              </div>
            </div>
            
            {isListening && (
              <div className="text-sm text-gray-400 mt-2">
                마이크가 활성화되어 실시간으로 음성을 분석하고 있습니다.
              </div>
            )}
          </div>
        </div>

        {/* 실시간 분석 결과 */}
        {analysisResult && (
          <div className="border border-gray-600 p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">실시간 분석 결과</h3>
            
            <div className="space-y-3">
              <div>
                <span className="text-gray-400">사용자 답변:</span>
                <span className="ml-2 text-white">"{analysisResult.answer}"</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-gray-400">→ 위험도:</span>
                <span className={`px-3 py-1 rounded-lg border font-semibold ${getRiskColor(analysisResult.risk)}`}>
                  {analysisResult.risk} (점수 {analysisResult.score})
                </span>
              </div>
              
              <div>
                <span className="text-gray-400">→ 설명:</span>
                <span className="ml-2 text-white">"{analysisResult.explanation}"</span>
              </div>
            </div>
          </div>
        )}

        {/* 다음 라운드 버튼 */}
        {analysisResult && (
          <div className="border border-white p-4">
            <button
              onClick={nextRound}
              className="w-full py-3 px-6 bg-white text-black font-bold text-lg hover:bg-gray-200 transition-colors"
            >
              {currentRound < scenario.rounds.length ? '다음 라운드 ▶' : '결과 보기 ▶'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}