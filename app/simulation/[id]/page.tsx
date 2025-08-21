"use client"
import { useState, useEffect } from 'react'

export default function SimulationPage() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [scenarios, setScenarios] = useState<Array<{ id: string; title: string; description?: string }>>([])
  const [selectedScenario, setSelectedScenario] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [showScenarios, setShowScenarios] = useState(false)

  // 백엔드 헬스 체크 함수
  const checkBackendHealth = async () => {
    try {
      console.log('백엔드 헬스 체크 시작...')
      const response = await fetch('/api/proxy?path=health')
      
      if (response.ok) {
        setBackendStatus('online')
        // 헬스 체크 성공하면 시나리오 목록 불러오기
        await loadScenarios()
      } else {
        setBackendStatus('offline')
      }
    } catch (error) {
      console.error('백엔드 헬스 체크 실패:', error)
      setBackendStatus('offline')
    }
  }

  // 시나리오 선택하기 버튼 클릭
  const handleShowScenarios = async () => {
    setShowScenarios(true)
    await loadScenarios()
  }
  const loadScenarios = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/proxy?path=scenarios')
      
      if (response.ok) {
        const data = await response.json()
        console.log('시나리오 목록:', data)
        setScenarios(data)
      } else {
        console.error('시나리오 목록 불러오기 실패')
        // 임시 더미 데이터
        setScenarios([
          { id: '1', title: '검찰/경찰 사칭', description: '검찰청 수사관을 사칭하여 대포통장 개설 의혹을 제기하는 시나리오' },
          { id: '2', title: '대출 사기', description: '저금리 대출을 미끼로 수수료를 요구하는 시나리오' },
          { id: '3', title: '택배 사기', description: '택배 보관료 명목으로 돈을 요구하는 시나리오' },
          { id: '4', title: '아르바이트 사기', description: '고수익 아르바이트를 빌미로 선급금을 요구하는 시나리오' },
          { id: '5', title: '가족 납치', description: '가족 납치를 가장하여 몸값을 요구하는 시나리오' }
        ])
      }
    } catch (error) {
      console.error('시나리오 목록 불러오기 오류:', error)
      // 오류 시에도 더미 데이터 제공
      setScenarios([
        { id: '1', title: '검찰/경찰 사칭', description: '검찰청 수사관을 사칭하여 대포통장 개설 의혹을 제기하는 시나리오' },
        { id: '2', title: '대출 사기', description: '저금리 대출을 미끼로 수수료를 요구하는 시나리오' },
        { id: '3', title: '택배 사기', description: '택배 보관료 명목으로 돈을 요구하는 시나리오' },
        { id: '4', title: '아르바이트 사기', description: '고수익 아르바이트를 빌미로 선급금을 요구하는 시나리오' },
        { id: '5', title: '가족 납치', description: '가족 납치를 가장하여 몸값을 요구하는 시나리오' }
      ])
    } finally {
      setLoading(false)
    }
  }

  // 시뮬레이션 시작
  const startSimulation = () => {
    if (!selectedScenario) {
      alert('시나리오를 선택해주세요!')
      return
    }
    
    // 선택된 시나리오로 게임 시작 페이지로 이동 (/simulation/[id])
    window.location.href = `/simulation/${selectedScenario}`
  }

  // 컴포넌트 마운트시 백엔드 상태 확인
  useEffect(() => {
    checkBackendHealth()
  }, [checkBackendHealth])

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

      {/* 뒤로가기 버튼 */}
      <div className="absolute top-6 left-6 z-20">
        <button 
          onClick={() => window.location.href = '/'}
          className="flex items-center gap-2 px-4 py-2 rounded-lg backdrop-blur-sm border bg-gray-900/50 border-gray-600 text-gray-300 hover:bg-gray-800/50 transition-colors"
        >
          <span>←</span>
          <span className="text-sm font-medium">홈으로</span>
        </button>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {/* 제목 */}
        <div className="border-4 border-white p-8 mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            VoiceGuard 시뮬레이션 훈련
          </h1>
        </div>

        {/* 시나리오 선택 섹션 */}
        <div className="w-full max-w-2xl">
          {!showScenarios ? (
            /* 초기 화면 - 시나리오 선택하기 버튼 */
            <div className="border-2 border-white p-4">
              <button 
                onClick={handleShowScenarios}
                disabled={backendStatus !== 'online'}
                className={`w-full py-4 px-8 font-bold text-xl transition-all duration-200 ${
                  backendStatus === 'online'
                    ? 'bg-white text-black hover:bg-gray-200'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                {backendStatus === 'checking' ? '연결 확인 중...' : '시나리오 선택하기'}
              </button>
            </div>
          ) : (
            /* 시나리오 목록 화면 */
            <>
              {loading ? (
                <div className="text-white text-xl">시나리오 불러오는 중...</div>
              ) : (
                <>
                  <h2 className="text-2xl text-white mb-8 font-semibold">시나리오를 선택하세요</h2>
                  
                  {/* 시나리오 라디오 버튼 목록 */}
                  <div className="space-y-4 mb-12">
                    {scenarios.map((scenario) => (
                      <label 
                        key={scenario.id}
                        className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                          selectedScenario === scenario.id
                            ? 'bg-blue-900/30 border-blue-500 text-white'
                            : 'bg-gray-900/50 border-gray-600 text-gray-300 hover:bg-gray-800/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="scenario"
                          value={scenario.id}
                          checked={selectedScenario === scenario.id}
                          onChange={(e) => setSelectedScenario(e.target.value)}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded-full border-2 mr-4 flex items-center justify-center ${
                          selectedScenario === scenario.id
                            ? 'border-blue-500'
                            : 'border-gray-500'
                        }`}>
                          {selectedScenario === scenario.id && (
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          )}
                        </div>
                        <div className="text-left">
                          <div className="font-semibold text-lg">{scenario.title}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* 시작하기 버튼 */}
                  <div className="border-2 border-white p-4">
                    <button 
                      onClick={startSimulation}
                      disabled={!selectedScenario}
                      className={`w-full py-4 px-8 font-bold text-xl transition-all duration-200 ${
                        selectedScenario
                          ? 'bg-white text-black hover:bg-gray-200'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      시작하기
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* 주의사항 */}
        <div className="mt-12 text-gray-400 text-sm opacity-80 max-w-xl">
          <p className="mb-2">⚠️ 이 시뮬레이션은 교육 목적으로 제작되었습니다</p>
          <p>실제 보이스피싱 수법을 체험하여 대응 능력을 향상시키세요</p>
        </div>
      </div>
    </div>
  )
}