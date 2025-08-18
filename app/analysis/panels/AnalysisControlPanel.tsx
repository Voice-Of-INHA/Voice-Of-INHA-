interface AnalysisControlPanelProps {
  isActive: boolean
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  recordingTime: number
  audioLevel: number
  onStartAnalysis: () => void
  onStopAnalysis: () => void
}

export default function AnalysisControlPanel({
  isActive,
  connectionStatus,
  recordingTime,
  audioLevel,
  onStartAnalysis,
  onStopAnalysis
}: AnalysisControlPanelProps) {
  // 시간 포맷팅 함수
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-4">통화 분석 및 녹음</h2>

      <div className="text-center mb-4">
        <button
          onClick={isActive ? onStopAnalysis : onStartAnalysis}
          disabled={connectionStatus === 'connecting'}
          className={`w-40 h-20 rounded-lg text-white font-semibold shadow-lg transition-all duration-200 ${
            connectionStatus === 'connecting'
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : isActive
              ? 'bg-red-600 hover:bg-red-700 animate-pulse'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {connectionStatus === 'connecting' ? (
            <div className="flex flex-col items-center">
              <span className="text-2xl mb-1">🔄</span>
              <span className="text-sm">연결중</span>
            </div>
          ) : isActive ? (
            <div className="flex flex-col items-center">
              <span className="text-2xl mb-1">⏹️</span>
              <span className="text-sm">분석 중지</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-2xl mb-1">🎙️</span>
              <span className="text-sm">분석 시작</span>
            </div>
          )}
        </button>
      </div>

      {isActive && (
        <>
          <div className="mb-4 text-center">
            <p className="text-white text-lg font-mono">{formatTime(recordingTime)}</p>
            <p className="text-gray-400 text-xs">분석 시간</p>
          </div>

          <div className="mt-4">
            <p className="text-white text-sm mb-2">음성 레벨 ({audioLevel}%)</p>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-100 ${
                  audioLevel > 70 ? 'bg-red-500' : audioLevel > 30 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(audioLevel, 100)}%` }}
              />
            </div>
            <p className="text-gray-400 text-xs mt-1">🔴 분석 중...</p>
          </div>
        </>
      )}
    </div>
  )
}