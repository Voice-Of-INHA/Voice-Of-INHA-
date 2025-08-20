"use client"
import { useState, useEffect } from 'react'
import { useSearchParams, useParams } from 'next/navigation'

interface RoundResult {
  round: number
  userAnswer: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  score: number
  explanation: string
}

interface SimulationResult {
  scenarioId: string
  scenarioTitle: string
  sessionId: string
  totalRounds: number
  finalScore: number
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  roundResults: RoundResult[]
  guideline: string
}

export default function SimulationResultPage() {
  const searchParams = useSearchParams()
  const params = useParams()
  const scenarioId = params.id as string // URL params에서 scenarioId 가져오기
  const sessionId = searchParams.get('sessionId')
  
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [loading, setLoading] = useState(true)

  // 결과 데이터 로드
  const loadResult = async () => {
    try {
      setLoading(true)
      
      // localStorage에서 시뮬레이션 결과 가져오기
      const savedResults = localStorage.getItem('simulationResults')
      
      if (savedResults) {
        const data = JSON.parse(savedResults)
        console.log('저장된 결과 데이터:', data)
        
        // 총점 계산
        const totalScore = data.allRounds.reduce((sum: number, round: { score: number }) => sum + round.score, 0)
        const averageScore = totalScore / data.allRounds.length
        
        // 전체 위험도 판정
        let overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
        if (averageScore <= -5) overallRisk = 'HIGH'
        else if (averageScore <= 0) overallRisk = 'MEDIUM'
        
        const resultData: SimulationResult = {
          scenarioId: data.scenarioId,
          scenarioTitle: data.scenarioTitle,
          sessionId: data.sessionId,
          totalRounds: data.allRounds.length,
          finalScore: totalScore,
          overallRisk: overallRisk,
          roundResults: data.allRounds.map((round: { answer: string; risk: string; score: number; explanation: string }, index: number) => ({
            round: index + 1,
            userAnswer: round.answer,
            riskLevel: round.risk,
            score: round.score,
            explanation: round.explanation
          })),
          guideline: data.guideline
        }
        
        setResult(resultData)
        
        // 사용한 데이터 삭제
        localStorage.removeItem('simulationResults')
      } else {
        console.error('저장된 결과 데이터 없음')
        createDummyResult()
      }
    } catch (error) {
      console.error('결과 로드 오류:', error)
      createDummyResult()
    } finally {
      setLoading(false)
    }
  }

  // 더미 결과 데이터 생성
  const createDummyResult = () => {
    setResult({
      scenarioId: scenarioId || '1',
      scenarioTitle: '검찰/경찰 사칭',
      sessionId: sessionId || 'dummy_session',
      totalRounds: 3,
      finalScore: -15,
      overallRisk: 'HIGH',
      roundResults: [
        {
          round: 1,
          userAnswer: '네, 제 계좌는 1234-5678-9012입니다.',
          riskLevel: 'HIGH',
          score: -10,
          explanation: '사용자가 실제 계좌번호를 제공했습니다. 매우 위험한 행동입니다.'
        },
        {
          round: 2,
          userAnswer: '주민번호는 말씀드릴 수 없습니다.',
          riskLevel: 'LOW',
          score: 5,
          explanation: '개인정보 제공을 거절한 올바른 대응입니다.'
        },
        {
          round: 3,
          userAnswer: '알겠습니다. 지금 바로 송금하겠습니다.',
          riskLevel: 'HIGH',
          score: -10,
          explanation: '송금 의사를 표현했습니다. 보이스피싱에 속을 위험이 매우 높습니다.'
        }
      ],
      guideline: '경찰서에서는 대포통장 관련 전화를 걸지 않습니다.\n보이스피싱 범죄의 전형적인 수법 중 하나가 "자신을 경찰, 검찰이라고 사칭하며 대포통장과 관련된 전화를 거는 것"입니다.\n만약 경찰서나 검찰청이라고 속이는 전화를 받았다면, 해당 기관의 공식 전화번호로 직접 전화하여 사실 여부를 확인해야 합니다.'
    })
  }

  // 위험도에 따른 색상과 메시지
  const getRiskInfo = (level: string) => {
    switch (level) {
      case 'HIGH':
        return {
          color: 'text-red-400 bg-red-900/30 border-red-500',
          bgColor: 'bg-red-900/20',
          message: '매우 위험! 보이스피싱에 취약한 상태입니다.'
        }
      case 'MEDIUM':
        return {
          color: 'text-yellow-400 bg-yellow-900/30 border-yellow-500',
          bgColor: 'bg-yellow-900/20',
          message: '주의 필요! 일부 대응이 개선되어야 합니다.'
        }
      case 'LOW':
        return {
          color: 'text-green-400 bg-green-900/30 border-green-500',
          bgColor: 'bg-green-900/20',
          message: '안전! 보이스피싱을 잘 대처하고 있습니다.'
        }
      default:
        return {
          color: 'text-gray-400 bg-gray-900/30 border-gray-500',
          bgColor: 'bg-gray-900/20',
          message: '분석 중...'
        }
    }
  }

  // 재시도
  const retryScenario = () => {
    if (scenarioId) {
      window.location.href = `/simulation/${scenarioId}`
    }
  }

  // 다른 시나리오 선택
  const selectOtherScenario = () => {
    window.location.href = '/simulation'
  }

  useEffect(() => {
    loadResult()
  }, [scenarioId, sessionId, loadResult])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">결과 분석 중...</div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-xl mb-4">결과를 불러올 수 없습니다.</div>
          <button 
            onClick={() => window.location.href = '/simulation'}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            시나리오 선택으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  const riskInfo = getRiskInfo(result.overallRisk)

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 헤더 */}
      <div className="border-b border-gray-600 p-6">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold text-center">시뮬레이션 결과</h1>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* 전체 결과 요약 */}
        <div className={`border-2 border-white p-8 mb-8 ${riskInfo.bgColor}`}>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">시나리오: {result.scenarioTitle}</h2>
            <div className="text-gray-400">
              총 라운드: {result.totalRounds} | 최종 점수: {result.finalScore}
            </div>
          </div>

          <div className="text-center">
            <div className={`inline-block px-6 py-3 rounded-lg border-2 font-bold text-xl ${riskInfo.color}`}>
              위험 판정: {result.overallRisk}
            </div>
            <p className="mt-4 text-lg">{riskInfo.message}</p>
          </div>
        </div>

        {/* 상세 피드백 */}
        <div className="border border-gray-600 p-6 mb-8">
          <h3 className="text-xl font-semibold mb-6">상세 피드백</h3>
          
          <div className="space-y-4">
            {result.roundResults.map((round) => {
              const roundRiskInfo = getRiskInfo(round.riskLevel)
              return (
                <div key={round.round} className="border border-gray-500 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Round {round.round}:</span>
                    <span className={`px-3 py-1 rounded-lg border font-semibold ${roundRiskInfo.color}`}>
                      {round.riskLevel}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mb-2">
                    답변: &ldquo;{round.userAnswer}&rdquo;
                  </div>
                  <div className="text-sm">
                    → {round.explanation} (점수: {round.score > 0 ? '+' : ''}{round.score})
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 올바른 대응 방법 */}
        <div className="border border-gray-600 p-6 mb-8">
          <h3 className="text-xl font-semibold mb-4">👉 올바른 대응 방법:</h3>
          <div className="bg-gray-900/50 p-4 rounded-lg">
            <pre className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {result.guideline}
            </pre>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border-2 border-white p-4">
            <button 
              onClick={retryScenario}
              className="w-full py-3 px-6 bg-white text-black font-bold text-lg hover:bg-gray-200 transition-colors"
            >
              다시 시도하기
            </button>
          </div>
          
          <div className="border-2 border-white p-4">
            <button 
              onClick={selectOtherScenario}
              className="w-full py-3 px-6 bg-white text-black font-bold text-lg hover:bg-gray-200 transition-colors"
            >
              다른 시나리오 선택
            </button>
          </div>
        </div>

        {/* 추가 정보 */}
        <div className="mt-8 text-center text-gray-400 text-sm">
          <p>세션 ID: {result.sessionId}</p>
          <p className="mt-2">💡 더 많은 시나리오를 연습하여 보이스피싱 대응 능력을 향상시키세요!</p>
        </div>
      </div>
    </div>
  )
}