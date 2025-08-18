interface AnalysisLogPanelProps {
  analysisLog: string
}

export default function AnalysisLogPanel({ analysisLog }: AnalysisLogPanelProps) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white mb-4">실시간 분석 로그</h2>
        
        <div className="bg-gray-800 rounded p-3 h-96 overflow-y-auto">
          <pre className="text-xs text-gray-300 whitespace-pre-wrap">
            {analysisLog || '분석 결과가 여기에 표시됩니다...'}
          </pre>
        </div>
      </div>
    </div>
  )
}