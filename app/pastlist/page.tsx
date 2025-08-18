"use client"

import { useState, useEffect } from "react"
import HelpModal from "../components/modals/HelpModal"

interface AnalysisRecord {
  id: string
  phoneNumber: string
  callDate: string
  callDuration: string
  riskPercentage: number
  phishingType: string
  audioFileUrl: string
  risk: 'medium' | 'high'
}

export default function PastListPage() {
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<AnalysisRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterRisk, setFilterRisk] = useState<'all' | 'high' | 'medium'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAnalysisRecords = async () => {
    setIsLoading(true)
    setError(null)

    try {
      console.log("📋 분석 이력 조회 시작...")
      const response = await fetch('/api/proxy?path=list')

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`서버 오류: ${response.status} - ${errorText}`)
      }

      const data: any[] = await response.json()
      console.log("✅ 분석 이력 조회 성공:", data)

      const formattedRecords: AnalysisRecord[] = data.map((item) => {
        const riskPercentage = item.riskPercentage || item.risk_percentage || item.risk_score || 0;
        return {
          id: item.id || item._id || `${Date.now()}-${Math.random()}`,
          phoneNumber: item.phoneNumber || item.phone_number || "알 수 없음",
          callDate: item.callDate || item.call_date || item.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          callDuration: item.callDuration || item.call_duration || item.duration || "00:00",
          riskPercentage: riskPercentage,
          phishingType: item.phishingType || item.phishing_type || item.analysis_type || "분석 중",
          audioFileUrl: item.audioFileUrl || item.audio_file_url || item.file_path || "",
          risk: riskPercentage >= 70 ? 'high' : 'medium'
        }
      })
      
      setRecords(formattedRecords)
    } catch (error) {
      console.error("❌ 분석 이력 조회 실패:", error)
      setError(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다")
      // 더미 데이터 제거 - 에러 발생 시 빈 배열로 설정
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAnalysisRecords()
  }, [])

  useEffect(() => {
    let filtered = records

    if (searchTerm) {
      filtered = filtered.filter(record => 
        record.phoneNumber.includes(searchTerm) ||
        record.phishingType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

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

  const getPhishingTypeColor = (phishingType: string) => {
    if (phishingType.includes('사기') || phishingType.includes('사칭') || phishingType.includes('협박')) return 'bg-red-900 text-red-300'
    return 'bg-yellow-900 text-yellow-300'
  }

  return (
    <main className="p-8 bg-black min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div className="flex space-x-2">
          <button
            className="flex items-center justify-center h-10 w-10 text-gray-400 hover:text-white transition-colors"
            onClick={() => window.history.back()}
            aria-label="뒤로 가기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button
            className="flex items-center justify-center h-10 w-10 text-gray-400 hover:text-white transition-colors"
            onClick={() => setShowHelpModal(true)}
            aria-label="도움말"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.84 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
          </button>
          <button
            className={`flex items-center justify-center h-10 w-10 text-gray-400 hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`}
            onClick={loadAnalysisRecords}
            disabled={isLoading}
            aria-label="새로고침"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 12a9 9 0 0 0-9-9c-2.33 0-4.51.84-6.14 2.2a.23.23 0 0 0-.17.32l.71 1.95a.23.23 0 0 0 .33.14.93.93 0 0 1 .4-.18c1.3-.29 2.51-.43 3.61-.26a9 9 0 0 1 8.8 8.8c.17 1.1-.11 2.31-.38 3.61a.93.93 0 0 1-.18.4.23.23 0 0 0 .14.33l1.95.71a.23.23 0 0 0 .32-.17A9 9 0 0 0 21 12Z"/></svg>
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button
            className="flex items-center justify-center h-10 w-10 text-gray-400 hover:text-white transition-colors"
            onClick={() => window.location.href = "/"}
            aria-label="홈으로 이동"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">과거 분석 이력</h1>

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

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
            <p className="text-gray-400 mt-4">데이터를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500">데이터를 불러오는 데 실패했습니다.</p>
            <p className="text-gray-400 text-sm mt-2">{error}</p>
            <button
              onClick={loadAnalysisRecords}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              다시 시도
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl text-gray-400 mb-4">🛡️</div>
            <p className="text-gray-400 text-lg">
              {records.length === 0 ? "아직 분석된 통화가 없습니다." : "검색 결과가 없습니다."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {filteredRecords.map((record) => (
                <div 
                  key={record.id} 
                  className="bg-gray-900 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors shadow-lg cursor-pointer"
                  onClick={() => window.location.href = `/pastlist/${record.id}`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          {record.risk === 'high' ? 
                            <span className="text-red-500 text-2xl">⚠️</span> : 
                            <span className="text-yellow-500 text-2xl">🛡️</span>
                          }
                        </div>
                        <div>
                          <h3 className="text-white text-lg font-semibold">{record.phoneNumber}</h3>
                          <p className="text-sm text-gray-400">
                            <span className="mr-1">📅</span>
                            {record.callDate}
                          </p>
                          <p className="text-sm text-gray-400">
                            <span className="mr-1">📞</span>
                            {record.callDuration}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {getRiskBadge(record.riskPercentage, record.risk)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getPhishingTypeColor(record.phishingType)}`}>
                        {record.phishingType}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white mb-1">{records.length}</div>
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
          </>
        )}
      </div>

      <HelpModal 
        isOpen={showHelpModal} 
        onClose={() => setShowHelpModal(false)} 
        initialPage="pastlist"
      />
    </main>
  )
}