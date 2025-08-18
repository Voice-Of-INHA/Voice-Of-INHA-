interface AnalysisResult {
  risk: 'low' | 'medium' | 'high' | null
  riskScore: number
  keywords: string[]
  reason: string
  timestamp: number
}

interface RiskStatusPanelProps {
  analysisResult: AnalysisResult
  isActive: boolean
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
}

export default function RiskStatusPanel({ 
  analysisResult, 
  isActive, 
  connectionStatus 
}: RiskStatusPanelProps) {
  // 위험도별 색상
  const getRiskColor = (risk: string | null) => {
    switch (risk) {
      case 'high': return 'text-red-500'
      case 'medium': return 'text-yellow-500'  
      case 'low': return 'text-green-500'
      default: return 'text-gray-500'
    }
  }

  // 위험도별 아이콘
  const getRiskIcon = (risk: string | null) => {
    switch (risk) {
      case 'high': return <span className="text-red-500 text-2xl">🚨</span>
      case 'medium': return <span className="text-yellow-500 text-2xl">⚠️</span>
      case 'low': return <span className="text-green-500 text-2xl">✅</span>
      default: return <span className="text-gray-400 text-2xl">🛡️</span>
    }
  }

  return (
    <div className="space-y-4 mt-6">
      {/* 위험도 점수 */}
      <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
        <div className="flex items-center">
          {getRiskIcon(analysisResult.risk)}
          <span className="text-white ml-2">위험도</span>
        </div>
        <div className="text-right">
          <span className={`font-bold text-xl ${getRiskColor(analysisResult.risk)}`}>
            {analysisResult.riskScore}
          </span>
          <span className="text-gray-400 text-sm ml-1">/100</span>
        </div>
      </div>

      {/* 시스템 상태 */}
      <div className="p-3 bg-gray-800 rounded-lg">
        <span className="text-white block mb-2">시스템 상태</span>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">실시간 분석</span>
            <span className={isActive ? 'text-green-400' : 'text-gray-500'}>
              {isActive ? '활성' : '비활성'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">서버 연결</span>
            <span className={
              connectionStatus === 'connected' ? 'text-green-400' :
              connectionStatus === 'connecting' ? 'text-yellow-400' :
              connectionStatus === 'error' ? 'text-red-400' : 'text-gray-500'
            }>
              {connectionStatus === 'connected' ? '연결됨' :
               connectionStatus === 'connecting' ? '연결 중' :
               connectionStatus === 'error' ? '오류' : '연결 안됨'}
            </span>
          </div>
        </div>
      </div>

      {/* 감지된 키워드 */}
      {analysisResult.keywords.length > 0 && (
        <div className="p-3 bg-gray-800 rounded-lg">
          <span className="text-white block mb-2">감지된 위험 키워드</span>
          <div className="flex flex-wrap gap-2">
            {analysisResult.keywords.map((keyword, index) => (
              <span key={index} className="px-2 py-1 bg-red-600 text-white text-xs rounded-full">
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 판단 이유 */}
      {analysisResult.reason && (
        <div className="p-3 bg-gray-800 rounded-lg">
          <span className="text-white block mb-1">AI 분석 결과</span>
          <p className="text-gray-300 text-sm">{analysisResult.reason}</p>
        </div>
      )}
    </div>
  )
}