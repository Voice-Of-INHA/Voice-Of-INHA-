"use client"

import { useEffect, useState } from "react"

interface SimulationResult {
  scenario: {
    id: number
    title: string
    rounds: Array<{
      round: number
      question: string
      audio_url: string
    }>
    guideline: string
  }
  userResponses: Array<{
    round: number
    transcription: string
  }>
  analysis: {
    score: number
    risk_level: "LOW" | "MEDIUM" | "HIGH"
    pattern_summary: string
    good_signals: string[]
    risk_signals: string[]
    coaching: {
      why_risky: string
      do_next_time: string
      principles: string[]
      better_answer_templates: {
        personal_info_request: string
        money_or_transfer: string
        app_or_link_install: string
      }
    }
    overall_comment: string
  }
}

const CircularScore = ({ score, size = 120 }: { score: number; size?: number }) => {
  const radius = size / 2 - 8
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference
  
  const getColor = (score: number) => {
    if (score >= 80) return "#10b981" // green
    if (score >= 60) return "#f59e0b" // yellow
    return "#ef4444" // red
  }

  const color = getColor(score)

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle 
          cx={size / 2} 
          cy={size / 2} 
          r={radius} 
          stroke="#374151" 
          strokeWidth="8" 
          fill="transparent" 
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-white font-bold text-2xl">{score}</span>
          <div className="text-gray-400 text-sm">점</div>
        </div>
      </div>
    </div>
  )
}

const getRiskLevelInfo = (level: string) => {
  switch (level) {
    case "LOW":
      return {
        color: "bg-green-900 text-green-300 border-green-600",
        icon: "🛡️",
        text: "낮음"
      }
    case "MEDIUM":
      return {
        color: "bg-yellow-900 text-yellow-300 border-yellow-600",
        icon: "⚠️",
        text: "보통"
      }
    case "HIGH":
      return {
        color: "bg-red-900 text-red-300 border-red-600",
        icon: "🚨",
        text: "높음"
      }
    default:
      return {
        color: "bg-gray-900 text-gray-300 border-gray-600",
        icon: "❓",
        text: "알 수 없음"
      }
  }
}

export default function SimulationResultsPage() {
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const goToHome = () => {
    window.location.href = '/'
  }

  const goToPastList = () => {
    window.location.href = '/pastlist'
  }

  const goToSimulation = () => {
    sessionStorage.removeItem('simulationResult')
    window.location.href = '/simulation'
  }

  useEffect(() => {
    const loadResult = () => {
      try {
        const savedResult = sessionStorage.getItem('simulationResult')
        if (savedResult) {
          const parsedResult: SimulationResult = JSON.parse(savedResult)
          setResult(parsedResult)
        } else {
          // 결과가 없으면 메인 페이지로 리디렉션
          goToHome()
        }
      } catch (error) {
        console.error('결과 로딩 실패:', error)
        goToHome()
      } finally {
        setIsLoading(false)
      }
    }

    loadResult()
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-gray-400">결과를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl text-gray-400 mb-4">❌</div>
          <p className="text-gray-400 text-lg mb-4">결과를 찾을 수 없습니다.</p>
          <button
            onClick={goToHome}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  const riskInfo = getRiskLevelInfo(result.analysis.risk_level)

  return (
    <div className="min-h-screen bg-black p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <button
          className="flex items-center text-white hover:text-gray-300 p-2 rounded-lg hover:bg-gray-800 transition-colors"
          onClick={goToHome}
        >
          ← 홈으로
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">시뮬레이션 결과</h1>
          <p className="text-gray-400 text-sm">{result.scenario.title}</p>
        </div>
        <div className="w-16"></div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* 점수 카드 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-4 mb-4">
                <span className="text-4xl">{riskInfo.icon}</span>
                <div>
                  <h2 className="text-2xl font-bold text-white">보이스피싱 대응 점수</h2>
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 rounded-lg border text-sm ${riskInfo.color}`}>
                      위험도: {riskInfo.text}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-lg leading-relaxed">
                {result.analysis.overall_comment}
              </p>
            </div>
            <div className="ml-8">
              <CircularScore score={result.analysis.score} size={140} />
            </div>
          </div>
        </div>

        {/* 패턴 분석 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">📊 행동 패턴 분석</h3>
          <p className="text-gray-300 leading-relaxed">
            {result.analysis.pattern_summary}
          </p>
        </div>

        {/* 긍정적/위험 신호 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 긍정적 신호 */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-4">✅ 잘한 점</h3>
            {result.analysis.good_signals.length > 0 ? (
              <div className="space-y-2">
                {result.analysis.good_signals.map((signal, index) => (
                  <div key={index} className="flex items-start space-x-3 bg-green-900/20 p-3 rounded-lg border border-green-800">
                    <span className="text-green-400 text-sm">✓</span>
                    <p className="text-green-300 text-sm">{signal}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">이번에는 특별히 잘한 점이 발견되지 않았습니다. 다음에는 더 신중하게 대응해보세요!</p>
            )}
          </div>

          {/* 위험 신호 */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-red-400 mb-4">⚠️ 개선점</h3>
            {result.analysis.risk_signals.length > 0 ? (
              <div className="space-y-2">
                {result.analysis.risk_signals.map((signal, index) => (
                  <div key={index} className="flex items-start space-x-3 bg-red-900/20 p-3 rounded-lg border border-red-800">
                    <span className="text-red-400 text-sm">!</span>
                    <p className="text-red-300 text-sm">{signal}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">위험한 행동이 감지되지 않았습니다. 잘하셨어요!</p>
            )}
          </div>
        </div>

        {/* 코칭 섹션 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-6">💡 맞춤형 코칭</h3>
          
          {/* 위험한 이유 */}
          <div className="mb-6">
            <h4 className="text-red-400 font-medium mb-3">🚨 왜 위험한가요?</h4>
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <p className="text-red-200">{result.analysis.coaching.why_risky}</p>
            </div>
          </div>

          {/* 다음에 해야 할 것 */}
          <div className="mb-6">
            <h4 className="text-blue-400 font-medium mb-3">🎯 다음에는 이렇게 하세요</h4>
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
              <p className="text-blue-200">{result.analysis.coaching.do_next_time}</p>
            </div>
          </div>

          {/* 원칙들 */}
          <div className="mb-6">
            <h4 className="text-yellow-400 font-medium mb-3">📋 기억해야 할 원칙</h4>
            <div className="space-y-2">
              {result.analysis.coaching.principles.map((principle, index) => (
                <div key={index} className="flex items-center space-x-3 bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
                  <span className="text-yellow-400 font-bold">{index + 1}.</span>
                  <p className="text-yellow-200">{principle}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 모범 답안 */}
          <div>
            <h4 className="text-green-400 font-medium mb-3">💬 상황별 모범 답안</h4>
            <div className="space-y-4">
              <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
                <h5 className="text-green-300 font-medium mb-2">개인정보 요구 시</h5>
                <p className="text-green-200 italic">&quot;{result.analysis.coaching.better_answer_templates.personal_info_request}&quot;</p>
              </div>
              <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
                <h5 className="text-green-300 font-medium mb-2">돈 요구 시</h5>
                <p className="text-green-200 italic">&quot;{result.analysis.coaching.better_answer_templates.money_or_transfer}&quot;</p>
              </div>
              <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
                <h5 className="text-green-300 font-medium mb-2">앱 설치 요구 시</h5>
                <p className="text-green-200 italic">&quot;{result.analysis.coaching.better_answer_templates.app_or_link_install}&quot;</p>
              </div>
            </div>
          </div>
        </div>

        {/* 대화 내역 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">💬 대화 내역</h3>
          <div className="space-y-4">
            {result.scenario.rounds.map((round, index) => {
              const userResponse = result.userResponses.find(r => r.round === round.round)
              return (
                <div key={index} className="border border-gray-700 rounded-lg p-4">
                  <div className="mb-3">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">
                        라운드 {round.round}
                      </span>
                      <span className="text-red-400">상대방</span>
                    </div>
                    <p className="text-gray-300 bg-red-900/20 border border-red-800 rounded p-3">
                      {round.question}
                    </p>
                  </div>
                  
                  {userResponse && (
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
                          내 응답
                        </span>
                      </div>
                      <p className="text-gray-300 bg-blue-900/20 border border-blue-800 rounded p-3">
                        {userResponse.transcription || '음성 인식 실패'}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 시나리오 가이드라인 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">📚 시나리오 해설</h3>
          <p className="text-gray-300 leading-relaxed">{result.scenario.guideline}</p>
        </div>

        {/* 액션 버튼들 */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={goToPastList}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            📊 다른 기록 보기
          </button>
          <button
            onClick={goToHome}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
          >
            🏠 홈으로 돌아가기
          </button>
          <button
            onClick={goToSimulation}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
          >
            🔄 다시 연습하기
          </button>
        </div>

        {/* 신고 안내 */}
        <div className="bg-red-900 border border-red-600 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-300 mb-4">🚨 실제 보이스피싱 신고</h3>
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