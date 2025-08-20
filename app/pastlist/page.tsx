"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"

// 새로운 API 응답 데이터 타입 정의
interface AnalysisData {
  id: number
  callId: number
  audioGcsUri: string
  transcript: string
  report: {
    advice: {
      items: string[]
      title: string
    }
    reasons: Array<{
      type: string
      basis: string
    }>
    summary: string
    safe_alt: string
    timeline: Array<{
      t: string
      event: string
      quote: string
    }>
    red_flags: Array<{
      name: string
      quote: string
      explanation: string
    }>
    risk_level: string
    risk_score: number
    crime_types: string[]
  }
  summary: string
  crimeType: string
  status: string
  triggeredAt: string
  completedAt: string
  error: string | null
}

interface ApiResponse {
  ok: boolean
  status: string
  data: AnalysisData
}

export default function AnalysisDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // useCallback에서 의존성 배열에서 자기 자신을 제거
  const loadAnalysisData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      console.log(`📋 분석 상세 데이터 조회 시작... ID: ${id}`)

      const response = await fetch(`/api/calls/${id}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`/api/calls/${id} 실패: ${response.status} - ${errorText}`)
      }

      const data: ApiResponse = await response.json()
      console.log("✅ 분석 상세 데이터 성공:", data)

      if (!data.ok || !data.data) {
        throw new Error("데이터가 올바르지 않습니다.")
      }

      setAnalysisData(data.data)

    } catch (error) {
      console.error("❌ 분석 상세 데이터 조회 실패:", error)
      setError(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }, [id]) // id만 의존성 배열에 포함

  useEffect(() => {
    if (id) {
      loadAnalysisData()
    }
  }, [id, loadAnalysisData]) // 이제 loadAnalysisData가 정상적으로 참조됩니다

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString)
      const year = date.getFullYear()
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      const day = date.getDate().toString().padStart(2, "0")
      const hours = date.getHours().toString().padStart(2, "0")
      const minutes = date.getMinutes().toString().padStart(2, "0")
      return `${year}년${month}월${day}일 ${hours}시${minutes}분`
    } catch {
      return dateString
    }
  }

  const getRiskLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case "HIGH":
        return "text-red-500 bg-red-100 border-red-300"
      case "MEDIUM":
        return "text-yellow-600 bg-yellow-100 border-yellow-300"
      case "LOW":
        return "text-green-600 bg-green-100 border-green-300"
      default:
        return "text-gray-600 bg-gray-100 border-gray-300"
    }
  }

  const getRiskLevelText = (level: string) => {
    switch (level.toUpperCase()) {
      case "HIGH":
        return "🔴 높음"
      case "MEDIUM":
        return "🟡 보통"
      case "LOW":
        return "🟢 낮음"
      default:
        return "⚪ 알 수 없음"
    }
  }

  const getRiskScoreColor = (score: number) => {
    if (score >= 80) return "text-red-500"
    if (score >= 60) return "text-yellow-500"
    return "text-green-500"
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">분석 데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !analysisData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl text-red-500 mb-4">⚠️</div>
          <p className="text-red-500 text-lg mb-4">데이터를 불러오는 데 실패했습니다.</p>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <div className="space-x-4">
            <button
              onClick={loadAnalysisData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              다시 시도
            </button>
            <button
              onClick={() => router.push("/pastlist")}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              목록으로
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 헤더 */}
      <div className="bg-gray-900 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push("/pastlist")}
              className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6"/>
              </svg>
              <span>목록으로</span>
            </button>
            <h1 className="text-2xl font-bold">통화 분석 상세보기</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getRiskLevelColor(analysisData.report.risk_level)}`}>
              {getRiskLevelText(analysisData.report.risk_level)}
            </span>
            <span className="text-gray-400">ID: {analysisData.id}</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* 위험도 요약 카드 */}
        <div className="bg-gradient-to-r from-red-900 to-red-800 border border-red-600 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">🚨 위험도 분석 결과</h2>
              <p className="text-red-200">{analysisData.report.summary}</p>
            </div>
            <div className="text-center">
              <div className={`text-4xl font-bold ${getRiskScoreColor(analysisData.report.risk_score)}`}>
                {analysisData.report.risk_score}점
              </div>
              <div className="text-red-300 text-sm">위험도 점수</div>
            </div>
          </div>
        </div>

        {/* 기본 정보 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">📞</span>
            기본 정보
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-800 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">통화 ID</p>
              <p className="text-white font-medium">{analysisData.callId}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">범죄 유형</p>
              <p className="text-white font-medium">{analysisData.crimeType}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">위험도 점수</p>
              <p className={`font-bold text-lg ${getRiskScoreColor(analysisData.report.risk_score)}`}>
                {analysisData.report.risk_score}점
              </p>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">분석 상태</p>
              <p className="text-white font-medium">{analysisData.status}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">분석 시작</p>
              <p className="text-white font-medium">{formatDate(analysisData.triggeredAt)}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">분석 완료</p>
              <p className="text-white font-medium">{formatDate(analysisData.completedAt)}</p>
            </div>
          </div>
        </div>

        {/* 통화 내용 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">🎤</span>
            통화 내용
          </h2>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{analysisData.transcript}</p>
          </div>
        </div>

        {/* 위험 신호 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">🚨</span>
            위험 신호 ({analysisData.report.red_flags.length}개)
          </h2>
          <div className="space-y-4">
            {analysisData.report.red_flags.map((flag, index) => (
              <div key={index} className="bg-gray-800 p-4 rounded-lg border-l-4 border-red-500 hover:bg-gray-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-400 mb-2 flex items-center">
                      <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full mr-2">
                        {index + 1}
                      </span>
                      {flag.name}
                    </h3>
                    <p className="text-gray-300 mb-2 font-medium">&ldquo;{flag.quote}&rdquo;</p>
                    <p className="text-gray-400 text-sm leading-relaxed">{flag.explanation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 범죄 유형 및 근거 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">🔍</span>
            범죄 유형 분석
          </h2>
          <div className="space-y-4">
            {analysisData.report.reasons.map((reason, index) => (
              <div key={index} className="bg-gray-800 p-4 rounded-lg border-l-4 border-yellow-500">
                <h3 className="font-semibold text-yellow-400 mb-2 flex items-center">
                  <span className="bg-yellow-500 text-black text-xs px-2 py-1 rounded-full mr-2">
                    {index + 1}
                  </span>
                  {reason.type}
                </h3>
                <p className="text-gray-300 leading-relaxed">{reason.basis}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 타임라인 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">⏰</span>
            통화 타임라인 ({analysisData.report.timeline.length}개 이벤트)
          </h2>
          <div className="space-y-3">
            {analysisData.report.timeline.map((event, index) => (
              <div key={index} className="flex items-start space-x-4 bg-gray-800 p-3 rounded-lg">
                <div className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium min-w-[70px] text-center">
                  {event.t}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-white mb-1 flex items-center">
                    <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full mr-2">
                      {index + 1}
                    </span>
                    {event.event}
                  </h4>
                  <p className="text-gray-300 text-sm italic">&ldquo;{event.quote}&rdquo;</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 대응 조언 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">💡</span>
            {analysisData.report.advice.title}
          </h2>
          <div className="space-y-3">
            {analysisData.report.advice.items.map((advice, index) => (
              <div key={index} className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg hover:bg-gray-700 transition-colors">
                <span className="text-green-400 text-lg font-bold">✓</span>
                <p className="text-gray-300 leading-relaxed">{advice}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 안전 대안 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">🛡️</span>
            안전 대안
          </h2>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-300 leading-relaxed">{analysisData.report.safe_alt}</p>
          </div>
        </div>

        {/* 범죄 유형 태그 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">🏷️</span>
            탐지된 범죄 유형
          </h2>
          <div className="flex flex-wrap gap-2">
            {analysisData.report.crime_types.map((crimeType, index) => (
              <span key={index} className="px-3 py-2 bg-red-900 text-red-300 text-sm rounded-lg border border-red-600 hover:bg-red-800 transition-colors">
                {crimeType}
              </span>
            ))}
          </div>
        </div>

        {/* 오디오 파일 정보 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="mr-2">🎵</span>
            오디오 파일
          </h2>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">GCS URI:</p>
            <p className="text-gray-300 font-mono text-sm break-all bg-gray-700 p-2 rounded">
              {analysisData.audioGcsUri}
            </p>
            <p className="text-gray-500 text-xs mt-2">
              * 이 파일은 Google Cloud Storage에 저장되어 있습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}