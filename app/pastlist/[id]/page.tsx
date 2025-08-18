"use client"

import { useState, useEffect } from "react"

// 실제 DB에 저장된 데이터 구조
interface AnalysisRecord {
  id: string
  phoneNumber: string // 전화번호 (string type)
  callDate: string // 통화 날짜 (년, 월, 일) - YYYY-MM-DD 형태
  callDuration: string // 통화 시간 (분, 초) - MM:SS 형태  
  riskPercentage: number // 위험도 (%)
  phishingType: string // 보이스피싱 유형 (계좌번호, 협박 등)
  reason: string // 원인 (문자열 / ~~한 이유로 ~~를 받았습니다.)
  audioFileUrl: string // mp3, wav파일 (url)
  risk: 'medium' | 'high' // 위험도에 따른 레벨
}

export default function AnalysisDetailPage() {
  const [record, setRecord] = useState<AnalysisRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // URL에서 ID 추출
  const getId = () => {
    if (typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      return pathParts[pathParts.length - 1] // 마지막 부분이 ID
    }
    return "1" // 기본값
  }
  
  const id = getId()

  // 예시 데이터 생성 함수
  const getExampleData = (recordId: string): AnalysisRecord => {
    const examples = {
      "1": {
        id: "1",
        phoneNumber: "010-1234-5678",
        callDate: "2024-08-16",
        callDuration: "05:43",
        riskPercentage: 87,
        phishingType: "계좌이체 사기",
        reason: "금융기관을 사칭하여 긴급한 계좌이체를 요구한 이유로 고위험으로 분류되었습니다.",
        audioFileUrl: `/api/proxy?path=audio&id=1`,
        risk: "high" as const
      },
      "2": {
        id: "2",
        phoneNumber: "02-9876-5432",
        callDate: "2024-08-15",
        callDuration: "02:11",
        riskPercentage: 64,
        phishingType: "상금사기",
        reason: "가짜 당첨을 빌미로 개인정보 및 수수료를 요구한 이유로 중위험으로 분류되었습니다.",
        audioFileUrl: `/api/proxy?path=audio&id=2`,
        risk: "medium" as const
      },
      "3": {
        id: "3",
        phoneNumber: "070-1111-2222",
        callDate: "2024-08-13",
        callDuration: "07:28",
        riskPercentage: 92,
        phishingType: "수사기관 사칭",
        reason: "검찰청을 사칭하여 체포영장 및 계좌확인을 요구한 이유로 고위험으로 분류되었습니다.",
        audioFileUrl: `/api/proxy?path=audio&id=3`,
        risk: "high" as const
      },
      "4": {
        id: "4",
        phoneNumber: "010-7777-8888",
        callDate: "2024-08-12",
        callDuration: "03:17",
        riskPercentage: 71,
        phishingType: "불법대출",
        reason: "고금리 불법 대출업체로 의심되는 통화 패턴이 감지된 이유로 중위험으로 분류되었습니다.",
        audioFileUrl: `/api/proxy?path=audio&id=4`,
        risk: "medium" as const
      },
      "5": {
        id: "5",
        phoneNumber: "010-8888-9999",
        callDate: "2024-08-11",
        callDuration: "06:12",
        riskPercentage: 89,
        phishingType: "협박사기",
        reason: "개인정보 유출을 빌미로 협박하며 금전을 요구한 이유로 고위험으로 분류되었습니다.",
        audioFileUrl: `/api/proxy?path=audio&id=5`,
        risk: "high" as const
      },
      "6": {
        id: "6",
        phoneNumber: "02-5555-6666",
        callDate: "2024-08-10",
        callDuration: "04:33",
        riskPercentage: 58,
        phishingType: "택배사기",
        reason: "택배 관련 수수료를 요구하는 의심스러운 통화가 감지된 이유로 중위험으로 분류되었습니다.",
        audioFileUrl: `/api/proxy?path=audio&id=6`,
        risk: "medium" as const
      }
    }

    return examples[recordId as keyof typeof examples] || examples["1"]
  }

  // 백엔드에서 상세 데이터 가져오기 (현재는 예시 데이터 사용)
  const loadDetailData = async (recordId: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      console.log(`📄 상세 분석 결과 조회 시작: ID=${recordId}`)
      
      // 실제 API 호출 (주석 처리)
      /*
      const response = await fetch(`/api/proxy?path=detail&id=${recordId}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`서버 오류: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log("✅ 상세 분석 결과 조회 성공:", data)
      
      // 백엔드 데이터를 AnalysisRecord 형식으로 변환
      const formattedRecord: AnalysisRecord = {
        id: data.id || recordId,
        phoneNumber: data.phoneNumber || data.phone_number || "알 수 없음",
        callDate: data.callDate || data.call_date || data.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        callDuration: data.callDuration || data.call_duration || data.duration || "00:00",
        riskPercentage: data.riskPercentage || data.risk_percentage || data.risk_score || 0,
        phishingType: data.phishingType || data.phishing_type || data.analysis_type || "분석 중",
        reason: data.reason || data.analysis_reason || "분석 결과가 없습니다.",
        audioFileUrl: data.audioFileUrl || data.audio_file_url || `/api/proxy?path=audio&id=${recordId}`,
        risk: (data.riskPercentage || data.risk_percentage || data.risk_score || 0) >= 70 ? 'high' : 'medium'
      }
      
      setRecord(formattedRecord)
      */
      
      // 현재는 예시 데이터 사용 (UI 확인용)
      setTimeout(() => {
        const exampleRecord = getExampleData(recordId)
        setRecord(exampleRecord)
        console.log("✅ 예시 데이터 로드 완료:", exampleRecord)
      }, 800) // 로딩 시뮬레이션
      
    } catch (error) {
      console.error("❌ 상세 분석 결과 조회 실패:", error)
      setError(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다")
    } finally {
      setTimeout(() => setIsLoading(false), 800)
    }
  }

  useEffect(() => {
    if (id) {
      loadDetailData(id)
    }
  }, [id])

  const getRiskBadge = (riskPercentage: number, risk: string) => {
    switch (risk) {
      case 'high':
        return <span className="px-3 py-1 bg-red-600 text-white text-sm rounded-full font-medium">위험 {riskPercentage}%</span>
      case 'medium':
        return <span className="px-3 py-1 bg-yellow-600 text-white text-sm rounded-full font-medium">주의 {riskPercentage}%</span>
      default:
        return <span className="px-3 py-1 bg-gray-600 text-white text-sm rounded-full font-medium">알 수 없음</span>
    }
  }

  const getPhishingTypeColor = (phishingType: string) => {
    if (phishingType.includes('사기') || phishingType.includes('사칭') || phishingType.includes('협박')) {
      return 'bg-red-900 text-red-300 border border-red-600'
    }
    return 'bg-yellow-900 text-yellow-300 border border-yellow-600'
  }

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'high': return <span className="text-red-500 text-3xl">⚠️</span>
      case 'medium': return <span className="text-yellow-500 text-3xl">🛡️</span>
      default: return <span className="text-gray-400 text-3xl">🛡️</span>
    }
  }

  const handleAudioPlay = async () => {
    if (!record?.audioFileUrl) return

    try {
      if (audioElement && !audioElement.paused) {
        audioElement.pause()
        setIsPlaying(false)
        return
      }

      if (audioElement) {
        audioElement.play()
        setIsPlaying(true)
      } else {
        console.log("🎵 오디오 재생 시작:", record.audioFileUrl)
        
        const audio = new Audio(record.audioFileUrl)
        audio.onloadstart = () => {
          console.log("🎵 오디오 로딩 시작")
        }
        audio.oncanplay = () => {
          console.log("🎵 오디오 재생 준비 완료")
        }
        audio.onplay = () => {
          console.log("🎵 오디오 재생 중")
          setIsPlaying(true)
        }
        audio.onpause = () => {
          console.log("🎵 오디오 일시정지")
          setIsPlaying(false)
        }
        audio.onended = () => {
          console.log("🎵 오디오 재생 완료")
          setIsPlaying(false)
        }
        audio.onerror = (e) => {
          console.error("❌ 오디오 재생 오류:", e)
          alert('오디오 파일을 재생할 수 없습니다. 파일이 손상되었거나 서버에서 접근할 수 없습니다.')
          setIsPlaying(false)
        }
        
        setAudioElement(audio)
        await audio.play()
      }
    } catch (error) {
      console.error('❌ 오디오 재생 실패:', error)
      alert('오디오 재생 중 오류가 발생했습니다.')
      setIsPlaying(false)
    }
  }

  const handleRefresh = () => {
    if (id) {
      loadDetailData(id)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">상세 분석 결과를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !record) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl text-gray-400 mb-4">❌</div>
          <p className="text-gray-400 text-lg">
            {error || "데이터를 찾을 수 없습니다."}
          </p>
          <button 
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <button 
          className="flex items-center text-white hover:text-gray-300 p-2 rounded-lg hover:bg-gray-800 transition-colors"
          onClick={() => window.history.back()}
        >
          ← 돌아가기
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">분석 상세 결과</h1>
          <p className="text-gray-400 text-sm">ID: {record.id}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            className="flex items-center text-white hover:text-gray-300 p-2 rounded-lg hover:bg-gray-800 transition-colors"
            disabled={isLoading}
          >
            🔄 새로고침
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* 상단 안내 메시지 */}
        <div className="bg-blue-900 border border-blue-600 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-blue-400">ℹ️</span>
            <div>
              <p className="text-blue-300 font-medium">UI 확인용 예시 데이터</p>
              <p className="text-blue-400 text-sm">현재 백엔드 연결 없이 예시 데이터로 화면을 표시하고 있습니다.</p>
            </div>
          </div>
        </div>
        {/* 기본 정보 카드 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              {getRiskIcon(record.risk)}
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">{record.phoneNumber}</h2>
                <div className="flex items-center space-x-6 text-gray-400">
                  <div className="flex items-center space-x-2">
                    <span>📅</span>
                    <span>{record.callDate}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>📞</span>
                    <span>{record.callDuration}</span>
                  </div>
                </div>
              </div>
            </div>
            {getRiskBadge(record.riskPercentage, record.risk)}
          </div>
          
          {/* 보이스피싱 유형 */}
          <div className="mb-6">
            <span className="text-gray-400 text-sm mb-2 block">탐지된 유형:</span>
            <span className={`px-3 py-2 text-sm rounded-lg ${getPhishingTypeColor(record.phishingType)}`}>
              {record.phishingType}
            </span>
          </div>

          {/* 오디오 재생 */}
          <div className="mb-6">
            <button 
              onClick={handleAudioPlay}
              className="flex items-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors space-x-2"
              disabled={isLoading}
            >
              {isPlaying ? (
                <>
                  <span>⏸️</span>
                  <span>일시정지</span>
                </>
              ) : (
                <>
                  <span>▶️</span>
                  <span>녹음 재생</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 분석 원인 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">🔍 분석 결과</h3>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-300 leading-relaxed">{record.reason}</p>
          </div>
        </div>

        {/* 위험도 상세 정보 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">📊 위험도 분석</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">위험도 점수</span>
              <div className="flex items-center space-x-3">
                <div className="w-32 bg-gray-700 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full ${record.risk === 'high' ? 'bg-red-500' : 'bg-yellow-500'}`}
                    style={{ width: `${record.riskPercentage}%` }}
                  ></div>
                </div>
                <span className="text-white font-semibold">{record.riskPercentage}%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-400">위험 등급</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                record.risk === 'high' 
                  ? 'bg-red-900 text-red-300' 
                  : 'bg-yellow-900 text-yellow-300'
              }`}>
                {record.risk === 'high' ? '고위험' : '중위험'}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-400">통화 시간</span>
              <span className="text-white">{record.callDuration}</span>
            </div>
          </div>
        </div>

        {/* 안전 수칙 (정적 정보) */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">🛡️ 보이스피싱 예방 수칙</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg">
              <span className="text-red-400 font-bold">1.</span>
              <p className="text-gray-300 text-sm">금융기관이나 수사기관에서 전화로 개인정보를 요구하지 않습니다.</p>
            </div>
            <div className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg">
              <span className="text-red-400 font-bold">2.</span>
              <p className="text-gray-300 text-sm">의심스러운 전화는 즉시 끊고 해당 기관에 직접 확인하세요.</p>
            </div>
            <div className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg">
              <span className="text-red-400 font-bold">3.</span>
              <p className="text-gray-300 text-sm">계좌이체나 현금인출을 요구하면 112에 신고하세요.</p>
            </div>
            <div className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg">
              <span className="text-red-400 font-bold">4.</span>
              <p className="text-gray-300 text-sm">가족이나 지인에게 상황을 공유하고 조언을 구하세요.</p>
            </div>
          </div>
        </div>

        {/* 신고 안내 */}
        <div className="bg-red-900 border border-red-600 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-300 mb-4">🚨 신고 안내</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-800 p-4 rounded-lg">
              <h4 className="text-red-300 font-medium mb-2">긴급신고</h4>
              <p className="text-red-200 text-2xl font-bold">112</p>
              <p className="text-red-300 text-sm">경찰서 (24시간)</p>
            </div>
            <div className="bg-red-800 p-4 rounded-lg">
              <h4 className="text-red-300 font-medium mb-2">피해신고</h4>
              <p className="text-red-200 text-2xl font-bold">1332</p>
              <p className="text-red-300 text-sm">금융감독원 (평일 9-18시)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}