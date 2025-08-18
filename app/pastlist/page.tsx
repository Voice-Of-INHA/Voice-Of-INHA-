"use client"

import { useState, useEffect } from "react"
import HelpModal from "../components/modals/HelpModal"

interface AnalysisRecord {
  id: string
  phoneNumber: string // 전화번호 (string type)
  callDate: string // 통화 날짜 (년, 월, 일) - YYYY-MM-DD 형태
  callDuration: string // 통화 시간 (분, 초) - MM:SS 형태  
  riskPercentage: number // 위험도 (%)
  phishingType: string // 보이스피싱 유형 (계좌번호, 협박 등)
  audioFileUrl: string // mp3, wav파일 (url)
  // 기존 필드들은 새로운 필드들로부터 계산될 수 있음
  risk: 'medium' | 'high'
}

export default function PastListPage() {
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<AnalysisRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterRisk, setFilterRisk] = useState<'all' | 'high' | 'medium'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showHelpModal, setShowHelpModal] = useState(false)

  // TODO: 실제 DB 연동 시 이 더미 데이터는 제거됩니다
  const dummyData: AnalysisRecord[] = [
    {
      id: "1",
      phoneNumber: "010-1234-5678",
      callDate: "2024-08-16",
      callDuration: "05:43", // 5분 43초
      riskPercentage: 87,
      phishingType: "계좌이체 사기",
      audioFileUrl: "http://127.0.0.1:3000/audio/call_20240816_143022.mp3",
      risk: "high"
    },
    {
      id: "2", 
      phoneNumber: "02-9876-5432",
      callDate: "2024-08-15",
      callDuration: "02:11", // 2분 11초
      riskPercentage: 64,
      phishingType: "상금사기",
      audioFileUrl: "http://127.0.0.1:3000/audio/call_20240815_091533.wav",
      risk: "medium"
    },
    {
      id: "3",
      phoneNumber: "070-1111-2222",
      callDate: "2024-08-13", 
      callDuration: "07:28", // 7분 28초
      riskPercentage: 92,
      phishingType: "수사기관 사칭",
      audioFileUrl: "http://127.0.0.1:3000/audio/call_20240813_114555.wav",
      risk: "high"
    },
    {
      id: "4",
      phoneNumber: "010-7777-8888",
      callDate: "2024-08-12",
      callDuration: "03:17", // 3분 17초
      riskPercentage: 71,
      phishingType: "불법대출",
      audioFileUrl: "http://127.0.0.1:3000/audio/call_20240812_203344.mp3",
      risk: "medium"
    },
    {
      id: "5",
      phoneNumber: "010-8888-9999",
      callDate: "2024-08-11",
      callDuration: "06:12", // 6분 12초
      riskPercentage: 89,
      phishingType: "협박사기",
      audioFileUrl: "http://127.0.0.1:3000/audio/call_20240811_131208.wav",
      risk: "high"
    },
    {
      id: "6",
      phoneNumber: "02-5555-6666",
      callDate: "2024-08-10",
      callDuration: "04:33", // 4분 33초
      riskPercentage: 58,
      phishingType: "택배사기",
      audioFileUrl: "http://127.0.0.1:3000/audio/call_20240810_145520.mp3",
      risk: "medium"
    }
  ]

  useEffect(() => {
    // TODO: 실제 환경에서는 이 부분이 실제 API 호출로 대체됩니다
    const loadData = async () => {
      setIsLoading(true)
      
      try {
        // 실제 API 호출 예시 (현재는 주석 처리)
        // const response = await fetch('/api/call-records');
        // const data = await response.json();
        // setRecords(data);
        // setFilteredRecords(data);
        
        // 현재는 더미 데이터 사용 (개발용)
        setTimeout(() => {
          setRecords(dummyData)
          setFilteredRecords(dummyData)
          setIsLoading(false)
        }, 1000)
      } catch (error) {
        console.error('Failed to fetch records:', error)
        setIsLoading(false)
      }
    }
    
    loadData()
  }, []) // dummyData는 상수이므로 의존성에 포함하지 않음

  useEffect(() => {
    let filtered = records

    // 검색어 필터
    if (searchTerm) {
      filtered = filtered.filter(record => 
        record.phoneNumber.includes(searchTerm) ||
        record.phishingType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // 위험도 필터
    if (filterRisk !== 'all') {
      filtered = filtered.filter(record => record.risk === filterRisk)
    }

    setFilteredRecords(filtered)
  }, [searchTerm, filterRisk, records])

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

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'high': return <span className="text-red-500 text-xl">⚠️</span>
      case 'medium': return <span className="text-yellow-500 text-xl">🛡️</span>
      default: return <span className="text-gray-400 text-xl">🛡️</span>
    }
  }

  const getPhishingTypeColor = (phishingType: string) => {
    if (phishingType.includes('사기') || phishingType.includes('사칭') || phishingType.includes('협박')) return 'bg-red-900 text-red-300'
    return 'bg-yellow-900 text-yellow-300'
  }

  return (
    <div className="min-h-screen bg-black p-4">
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

      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">
          과거 분석 이력
        </h1>

        {/* 검색 및 필터 */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="전화번호, 유형으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterRisk('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterRisk === 'all' 
                  ? 'bg-gray-600 text-white' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setFilterRisk('high')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterRisk === 'high' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-800 text-red-400 hover:bg-red-600 hover:text-white border border-red-600'
              }`}
            >
              위험
            </button>
            <button
              onClick={() => setFilterRisk('medium')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterRisk === 'medium' 
                  ? 'bg-yellow-600 text-white' 
                  : 'bg-gray-800 text-yellow-400 hover:bg-yellow-600 hover:text-white border border-yellow-600'
              }`}
            >
              주의
            </button>
          </div>
        </div>

        {/* 로딩 상태 */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
            <p className="text-gray-400 mt-4">데이터를 불러오는 중...</p>
          </div>
        )}

        {/* 결과 없음 */}
        {!isLoading && filteredRecords.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl text-gray-400 mb-4">🛡️</div>
            <p className="text-gray-400 text-lg">검색 결과가 없습니다.</p>
          </div>
        )}

        {/* 분석 이력 목록 */}
        {!isLoading && filteredRecords.length > 0 && (
          <div className="space-y-4">
            {filteredRecords.map((record) => (
              <div 
                key={record.id} 
                className="bg-gray-900 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors shadow-lg cursor-pointer"
                onClick={() => window.location.href = `/pastlist/${record.id}`}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      {getRiskIcon(record.risk)}
                      <div>
                        <h3 className="text-white text-lg font-semibold">{record.phoneNumber}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-400 mt-1">
                          <div className="flex items-center">
                            <span className="mr-1">📅</span>
                            {record.callDate}
                          </div>
                          <div className="flex items-center">
                            <span className="mr-1">📞</span>
                            {record.callDuration}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      {getRiskBadge(record.riskPercentage, record.risk)}
                    </div>
                  </div>                  
                  
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-gray-400 text-sm">탐지 유형:</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getPhishingTypeColor(record.phishingType)}`}>
                      {record.phishingType}
                    </span>
                  </div>
                  
                  <div className="mt-3 text-right">
                    <span className="text-gray-400 text-sm">클릭하여 상세보기 →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 통계 정보 */}
        {!isLoading && records.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white mb-1">
                {records.length}
              </div>
              <div className="text-sm text-gray-400">총 분석 건수</div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-400 mb-1">
                {records.filter(r => r.risk === 'high').length}
              </div>
              <div className="text-sm text-gray-400">위험 탐지</div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400 mb-1">
                {records.filter(r => r.risk === 'medium').length}
              </div>
              <div className="text-sm text-gray-400">주의 필요</div>
            </div>
          </div>
        )}
      </div>

      {/* 도움말 모달 */}
      <HelpModal 
        isOpen={showHelpModal} 
        onClose={() => setShowHelpModal(false)} 
        initialPage="pastlist"
      />
    </div>
  )
}