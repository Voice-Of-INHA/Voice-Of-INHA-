"use client"

import { useState, useEffect } from "react"

interface DetailedAnalysisRecord {
  id: string
  phoneNumber: string // 전화번호 (string type)
  callDate: string // 통화 날짜 (년, 월, 일) - YYYY-MM-DD 형태
  callDuration: string // 통화 시간 (분, 초) - MM:SS 형태  
  riskPercentage: number // 위험도 (%)
  phishingType: string // 보이스피싱 유형 (계좌번호, 협박 등)
  reason: string // 원인 (문자열 / ~~한 이유로 ~~를 받았습니다.)
  audioFileUrl: string // mp3, wav파일 (url)
  // 추가 분석 데이터
  risk: 'medium' | 'high'
  keywords: string[]
  transcript: string
  suspiciousTimes: Array<{
    startTime: string
    endTime: string
    reason: string
    severity: 'medium' | 'high'
  }>
  analysisDetails: {
    voicePattern: string
    speechSpeed: number
    emotionDetection: string
    backgroundNoise: string
  }
  recommendations: string[]
}

export default function AnalysisDetailPage() {
  const [record, setRecord] = useState<DetailedAnalysisRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  
  // URL에서 ID 추출 (간단한 방법)
  const getId = () => {
    if (typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/')
      return pathParts[pathParts.length - 1] // 마지막 부분이 ID
    }
    return "1" // 기본값
  }
  
  const id = getId()

  // pastlist에서 전달받은 데이터와 매칭하는 더미 데이터 (실제로는 DB에서 가져올 데이터)
  const getDummyDetailData = (id: string): DetailedAnalysisRecord => {
    const baseData = {
      "1": {
        id: "1",
        phoneNumber: "010-1234-5678",
        callDate: "2024-08-16",
        callDuration: "05:43",
        riskPercentage: 87,
        phishingType: "계좌이체 사기",
        reason: "금융기관을 사칭하여 긴급한 계좌이체를 요구한 이유로 고위험으로 분류되었습니다.",
        audioFileUrl: "http://127.0.0.1:3000/audio/call_20240816_143022.mp3",
        risk: "high" as const,
        keywords: ["은행", "계좌이체", "긴급", "보안", "입금확인"],
        transcript: "안녕하세요 고객님, 국민은행 보안팀입니다. 고객님의 계좌에서 의심스러운 거래가 감지되어 연락드렸습니다. 지금 당장 계좌 보안을 위해 계좌번호와 비밀번호를 확인해주셔야 합니다. 만약 지금 확인해주지 않으면 계좌가 동결될 수 있습니다.",
        suspiciousTimes: [
          {
            startTime: "00:45",
            endTime: "01:23",
            reason: "금융기관 사칭 발언 감지",
            severity: "high" as const
          },
          {
            startTime: "02:15",
            endTime: "03:02",
            reason: "개인정보 요구 패턴 감지",
            severity: "high" as const
          },
          {
            startTime: "04:10",
            endTime: "04:45",
            reason: "긴급성을 강조하는 협박성 발언",
            severity: "medium" as const
          }
        ],
        analysisDetails: {
          voicePattern: "기계적이고 빠른 말투, 스크립트를 읽는 패턴",
          speechSpeed: 180,
          emotionDetection: "긴장감, 압박감 조성",
          backgroundNoise: "콜센터 환경 소음 감지"
        },
        recommendations: [
          "즉시 통화를 종료하고 실제 은행에 확인 전화",
          "개인정보는 절대 전화로 제공하지 말 것",
          "112 신고 고려",
          "가족들에게 보이스피싱 주의 알림"
        ]
      },
      "2": {
        id: "2",
        phoneNumber: "02-9876-5432",
        callDate: "2024-08-15",
        callDuration: "02:11",
        riskPercentage: 64,
        phishingType: "상금사기",
        reason: "가짜 당첨을 빌미로 개인정보 및 수수료를 요구한 이유로 중위험으로 분류되었습니다.",
        audioFileUrl: "http://127.0.0.1:3000/audio/call_20240815_091533.wav",
        risk: "medium" as const,
        keywords: ["당첨", "상금", "개인정보", "수수료", "인증"],
        transcript: "축하드립니다! 고객님께서 온라인 이벤트에 당첨되셨습니다. 상금 500만원을 받으시려면 개인정보 확인과 수수료 30만원을 먼저 입금해주셔야 합니다. 오늘 안에 처리하지 않으면 당첨이 취소됩니다.",
        suspiciousTimes: [
          {
            startTime: "00:20",
            endTime: "00:55",
            reason: "허위 당첨 안내",
            severity: "medium" as const
          },
          {
            startTime: "01:30",
            endTime: "02:05",
            reason: "수수료 선입금 요구",
            severity: "high" as const
          }
        ],
        analysisDetails: {
          voicePattern: "흥미를 유발하는 감정적 말투",
          speechSpeed: 175,
          emotionDetection: "흥분, 급박함 조성",
          backgroundNoise: "콜센터 환경"
        },
        recommendations: [
          "당첨 사실을 공식 채널로 확인",
          "수수료 선입금 요구 시 사기 의심",
          "개인정보 제공 거부",
          "소비자보호원 신고 고려"
        ]
      },
      "3": {
        id: "3",
        phoneNumber: "070-1111-2222",
        callDate: "2024-08-13",
        callDuration: "07:28",
        riskPercentage: 92,
        phishingType: "수사기관 사칭",
        reason: "검찰청을 사칭하여 체포영장 및 계좌확인을 요구한 이유로 고위험으로 분류되었습니다.",
        audioFileUrl: "http://127.0.0.1:3000/audio/call_20240813_114555.wav",
        risk: "high" as const,
        keywords: ["검찰청", "체포영장", "계좌확인", "송금", "수사"],
        transcript: "안녕하세요, 서울중앙지방검찰청 김철수 검사입니다. 고객님과 관련된 금융사기 사건이 접수되어 연락드렸습니다. 고객님 명의로 개설된 계좌가 사기에 악용되고 있어 체포영장이 발부될 예정입니다. 지금 즉시 계좌의 돈을 안전계좌로 이체해주셔야 합니다.",
        suspiciousTimes: [
          {
            startTime: "00:15",
            endTime: "01:10",
            reason: "검찰청 사칭 발언",
            severity: "high" as const
          },
          {
            startTime: "03:20",
            endTime: "04:15",
            reason: "체포영장 협박",
            severity: "high" as const
          },
          {
            startTime: "05:30",
            endTime: "06:45",
            reason: "안전계좌 이체 요구",
            severity: "high" as const
          }
        ],
        analysisDetails: {
          voicePattern: "권위적이고 위협적인 말투",
          speechSpeed: 160,
          emotionDetection: "공포감 조성, 권위적 압박",
          backgroundNoise: "사무실 환경"
        },
        recommendations: [
          "즉시 통화 종료",
          "112 또는 검찰청에 직접 확인",
          "계좌 이체 절대 금지",
          "주변인들에게 상황 공유"
        ]
      },
      "4": {
        id: "4",
        phoneNumber: "010-7777-8888",
        callDate: "2024-08-12",
        callDuration: "03:17",
        riskPercentage: 71,
        phishingType: "불법대출",
        reason: "고금리 불법 대출업체로 의심되는 통화 패턴이 감지된 이유로 중위험으로 분류되었습니다.",
        audioFileUrl: "http://127.0.0.1:3000/audio/call_20240812_203344.mp3",
        risk: "medium" as const,
        keywords: ["대출", "신용", "급전", "금리", "승인"],
        transcript: "안녕하세요, 금융대출 전문 상담사입니다. 고객님께서 신청하신 대출 건으로 연락드렸습니다. 지금 바로 승인 가능하며, 신용등급에 관계없이 최대 5천만원까지 가능합니다. 다만 수수료로 50만원을 먼저 입금해주셔야 합니다.",
        suspiciousTimes: [
          {
            startTime: "00:30",
            endTime: "01:15",
            reason: "허위 대출 승인 멘트",
            severity: "medium" as const
          },
          {
            startTime: "02:20",
            endTime: "02:55",
            reason: "선수수료 요구",
            severity: "high" as const
          }
        ],
        analysisDetails: {
          voicePattern: "친근하지만 유도적인 말투",
          speechSpeed: 170,
          emotionDetection: "친밀감 조성, 긴급성 부여",
          backgroundNoise: "사무실 환경"
        },
        recommendations: [
          "정식 금융기관 확인 필수",
          "선수수료 요구 시 즉시 의심",
          "금융감독원 신고 고려",
          "주변인과 상담 후 결정"
        ]
      },
      "5": {
        id: "5",
        phoneNumber: "010-8888-9999",
        callDate: "2024-08-11",
        callDuration: "06:12",
        riskPercentage: 89,
        phishingType: "협박사기",
        reason: "개인정보 유출을 빌미로 협박하며 금전을 요구한 이유로 고위험으로 분류되었습니다.",
        audioFileUrl: "http://127.0.0.1:3000/audio/call_20240811_131208.wav",
        risk: "high" as const,
        keywords: ["협박", "개인정보", "유출", "피해", "긴급"],
        transcript: "고객님의 개인정보가 해킹당해서 큰일났습니다. 지금 당장 조치를 취하지 않으면 더 큰 피해가 발생할 수 있습니다. 보안업체에서 긴급 처리비로 100만원을 요구하고 있습니다. 즉시 입금하지 않으면 모든 계좌가 털릴 수 있습니다.",
        suspiciousTimes: [
          {
            startTime: "00:30",
            endTime: "01:20",
            reason: "개인정보 유출 허위 주장",
            severity: "high" as const
          },
          {
            startTime: "03:15",
            endTime: "04:30",
            reason: "금전 요구 및 협박",
            severity: "high" as const
          },
          {
            startTime: "05:00",
            endTime: "05:45",
            reason: "긴급성 강조로 판단력 흐리기",
            severity: "medium" as const
          }
        ],
        analysisDetails: {
          voicePattern: "급박하고 위협적인 말투",
          speechSpeed: 190,
          emotionDetection: "공포감, 급박함 조성",
          backgroundNoise: "사무실 환경"
        },
        recommendations: [
          "즉시 통화 종료 및 112 신고",
          "절대 금전 송금 금지",
          "실제 보안업체에 직접 확인",
          "가족 및 지인에게 상황 공유"
        ]
      },
      "6": {
        id: "6",
        phoneNumber: "02-5555-6666",
        callDate: "2024-08-10",
        callDuration: "04:33",
        riskPercentage: 58,
        phishingType: "택배사기",
        reason: "택배 관련 수수료를 요구하는 의심스러운 통화가 감지된 이유로 중위험으로 분류되었습니다.",
        audioFileUrl: "http://127.0.0.1:3000/audio/call_20240810_145520.mp3",
        risk: "medium" as const,
        keywords: ["택배", "수수료", "배송", "결제", "확인"],
        transcript: "안녕하세요, CJ대한통운입니다. 고객님께 보낸 택배가 관세 문제로 보류되어 있습니다. 추가 수수료 15만원을 입금해주시면 바로 배송 가능합니다. 오늘 안에 처리하지 않으면 반송될 예정입니다.",
        suspiciousTimes: [
          {
            startTime: "01:00",
            endTime: "01:45",
            reason: "허위 관세 문제 주장",
            severity: "medium" as const
          },
          {
            startTime: "03:20",
            endTime: "04:10",
            reason: "추가 수수료 입금 요구",
            severity: "high" as const
          }
        ],
        analysisDetails: {
          voicePattern: "공식적이지만 유도적인 말투",
          speechSpeed: 165,
          emotionDetection: "신뢰감 조성, 긴급성 부여",
          backgroundNoise: "콜센터 환경"
        },
        recommendations: [
          "택배회사에 직접 확인 전화",
          "추가 수수료 요구 시 사기 의심",
          "송장번호 및 발송인 확인",
          "의심스러우면 즉시 신고"
        ]
      }
    }

    return baseData[id as keyof typeof baseData] || baseData["1"]
  }

  useEffect(() => {
    const loadDetailData = async () => {
      setIsLoading(true)
      // 실제 환경에서는 API 호출
      // const response = await fetch(`/api/call-records/${id}`);
      // const data = await response.json();
      // setRecord(data);
      
      // API 호출 시뮬레이션
      setTimeout(() => {
        const data = getDummyDetailData(id)
        setRecord(data)
        setIsLoading(false)
      }, 800)
    }

    if (id) {
      loadDetailData()
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

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">높음</span>
      case 'medium':
        return <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">보통</span>
      default:
        return <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded">알 수 없음</span>
    }
  }

  const getPhishingTypeColor = (phishingType: string) => {
    if (phishingType.includes('사기') || phishingType.includes('사칭') || phishingType.includes('협박')) {
      return 'bg-red-900 text-red-300 border border-red-600'
    }
    return 'bg-yellow-900 text-yellow-300 border border-yellow-600'
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
        // 실제로는 S3에서 오디오 파일을 가져옴
        const audio = new Audio(record.audioFileUrl)
        audio.onloadstart = () => setIsLoading(true)
        audio.oncanplay = () => setIsLoading(false)
        audio.onplay = () => setIsPlaying(true)
        audio.onpause = () => setIsPlaying(false)
        audio.onended = () => setIsPlaying(false)
        audio.onerror = () => {
          alert('오디오 파일을 재생할 수 없습니다.')
          setIsPlaying(false)
        }
        
        setAudioElement(audio)
        await audio.play()
      }
    } catch (error) {
      console.error('Audio play error:', error)
      alert('오디오 재생 중 오류가 발생했습니다.')
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

  if (!record) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl text-gray-400 mb-4">❌</div>
          <p className="text-gray-400 text-lg">데이터를 찾을 수 없습니다.</p>
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
        <div></div>
      </div>

      <div className="max-w-6xl mx-auto space-y-6">
        {/* 기본 정보 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white mb-2">{record.phoneNumber}</h2>
              <div className="flex items-center space-x-4 text-sm text-gray-400 mb-2">
                <span>📅 {record.callDate}</span>
                <span>📞 {record.callDuration}</span>
              </div>
              <div className="flex items-center space-x-3">
                <button 
                  onClick={handleAudioPlay}
                  className="flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                  disabled={isLoading}
                >
                  {isPlaying ? (
                    <>⏸️ 일시정지</>
                  ) : (
                    <>▶️ 녹음 재생</>
                  )}
                </button>
                <span className={`px-2 py-1 text-xs rounded-full ${getPhishingTypeColor(record.phishingType)}`}>
                  {record.phishingType}
                </span>
              </div>
            </div>
            {getRiskBadge(record.riskPercentage, record.risk)}
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg mb-4">
            <h4 className="text-white text-sm font-medium mb-2">분류 원인:</h4>
            <p className="text-gray-300 text-sm">{record.reason}</p>
          </div>
          
          {record.keywords.length > 0 && (
            <div>
              <span className="text-white text-sm mb-2 block">감지된 키워드:</span>
              <div className="flex flex-wrap gap-2">
                {record.keywords.map((keyword, index) => (
                  <span key={index} className="px-2 py-1 bg-red-900 text-red-300 text-xs rounded-full">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 통화 내용 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">📝 통화 내용</h3>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-300 leading-relaxed">{record.transcript}</p>
          </div>
        </div>

        {/* 의심 구간 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">⚠️ 의심 구간 분석</h3>
          <div className="space-y-4">
            {record.suspiciousTimes.map((suspicion, index) => (
              <div key={index} className="bg-gray-800 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-medium">
                      {suspicion.startTime} - {suspicion.endTime}
                    </span>
                    {getSeverityBadge(suspicion.severity)}
                  </div>
                </div>
                <p className="text-gray-300 text-sm">{suspicion.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}