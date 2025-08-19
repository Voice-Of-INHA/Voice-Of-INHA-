"use client"
import { useState, useEffect } from 'react'

export default function Home() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [apiResponse, setApiResponse] = useState<any>(null)
  const [showResponse, setShowResponse] = useState(false)

  // 백엔드 헬스 체크 함수
  const checkBackendHealth = async () => {
    try {
      console.log('백엔드 헬스 체크 시작...')
      const response = await fetch('/api/proxy?path=health')
      console.log('응답 상태:', response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log('백엔드 상태:', data)
        setApiResponse(data)
        setBackendStatus('online')
      } else {
        console.error('백엔드 응답 실패:', response.status, response.statusText)
        setApiResponse({ error: `HTTP ${response.status}: ${response.statusText}` })
        setBackendStatus('offline')
      }
    } catch (error) {
      console.error('백엔드 헬스 체크 실패:', error)
      setApiResponse({ error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다' })
      setBackendStatus('offline')
    }
  }

  // 컴포넌트 마운트시 백엔드 상태 확인
  useEffect(() => {
    checkBackendHealth()
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* 백엔드 상태 표시 */}
      <div className="absolute top-6 right-6 z-20">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm border ${
          backendStatus === 'online' 
            ? 'bg-green-900/50 border-green-600 text-green-300'
            : backendStatus === 'offline'
            ? 'bg-red-900/50 border-red-600 text-red-300'
            : 'bg-gray-900/50 border-gray-600 text-gray-300'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            backendStatus === 'online' 
              ? 'bg-green-400 animate-pulse'
              : backendStatus === 'offline'
              ? 'bg-red-400'
              : 'bg-gray-400 animate-pulse'
          }`} />
          <span className="text-sm font-medium">
            {backendStatus === 'checking' && '상태 확인 중...'}
            {backendStatus === 'online' && '서버 연결됨'}
            {backendStatus === 'offline' && '서버 연결 안됨'}
          </span>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {/* 제목 */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-8 drop-shadow-lg">
          AI 보이스피싱 탐지 서비스
        </h1>
        
        {/* 부제목 */}
        <p className="text-lg md:text-xl text-gray-300 mb-12 max-w-2xl leading-relaxed drop-shadow">
          실시간 통화 분석으로 보이스피싱을 미리 차단하세요!
        </p>

        {/* 버튼들 */}
        <div className="flex flex-col gap-4 w-full max-w-md">
          {/* 탐지 시작 버튼 */}
          <button 
            onClick={() => window.location.href = '/analysis'}
            disabled={backendStatus !== 'online'}
            className={`w-full py-4 px-8 font-bold text-lg rounded-2xl shadow-lg transform transition-all duration-200 backdrop-blur-sm border ${
              backendStatus === 'online'
                ? 'bg-gray-800 hover:bg-gray-700 text-white border-gray-600 hover:scale-105'
                : 'bg-gray-700 text-gray-400 border-gray-500 cursor-not-allowed opacity-50'
            }`}
          >
            {backendStatus === 'checking' ? '연결 확인 중...' : '탐지 시작'}
          </button>
          
          {/* 과거 이력 조회 버튼 */}
          <button 
            onClick={() => window.location.href = '/pastlist'}
            disabled={backendStatus !== 'online'}
            className={`w-full py-4 px-8 font-bold text-lg rounded-2xl shadow-lg transform transition-all duration-200 backdrop-blur-sm border ${
              backendStatus === 'online'
                ? 'bg-gray-900 hover:bg-gray-800 text-white border-gray-600 hover:scale-105'
                : 'bg-gray-800 text-gray-400 border-gray-500 cursor-not-allowed opacity-50'
            }`}
          >
            과거 이력 조회
          </button>

          {/* 백엔드 상태 새로고침 버튼 */}
          <button 
            onClick={checkBackendHealth}
            className="mt-4 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-blue-300 text-sm rounded-lg border border-blue-600 transform hover:scale-105 transition-all duration-200"
          >
            🔄 연결 상태 새로고침
          </button>

          {/* API 응답 보기/숨기기 버튼 */}
          {apiResponse && (
            <button 
              onClick={() => setShowResponse(!showResponse)}
              className="mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg border border-gray-500 transform hover:scale-105 transition-all duration-200"
            >
              {showResponse ? '📄 응답 숨기기' : '📄 API 응답 보기'}
            </button>
          )}
        </div>

        {/* API 응답 표시 섹션 */}
        {showResponse && apiResponse && (
          <div className="mt-8 w-full max-w-2xl">
            <div className="bg-gray-900 border border-gray-600 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <span>🔗</span>
                API 응답 데이터
              </h3>
              <pre className="bg-black text-green-400 text-sm p-3 rounded border overflow-x-auto">
                {JSON.stringify(apiResponse, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* 추가 정보 */}
        <div className="mt-16 text-gray-400 text-sm opacity-80">
          <p>📞 실시간 통화 분석 • 🛡️ AI 기반 탐지</p>
          {backendStatus === 'offline' && (
            <p className="text-red-400 mt-2">⚠️ 서버 연결이 필요합니다</p>
          )}
        </div>
      </div>

      {/* 장식 요소들 */}
      <div className="absolute top-10 left-10 w-20 h-20 border-2 border-gray-600 rounded-full opacity-20 animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-16 h-16 border-2 border-gray-500 rounded-full opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute top-1/3 right-10 w-12 h-12 border-2 border-gray-700 rounded-full opacity-20 animate-pulse delay-2000"></div>
    </div>
  );
}