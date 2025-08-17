"use client"

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
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
            className="w-full py-4 px-8 bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg rounded-2xl shadow-lg transform hover:scale-105 transition-all duration-200 backdrop-blur-sm border border-gray-600"
          >
            탐지 시작
          </button>
          
          {/* 과거 이력 조회 버튼 */}
          <button 
            onClick={() => window.location.href = '/pastlist'}
            className="w-full py-4 px-8 bg-gray-900 hover:bg-gray-800 text-white font-bold text-lg rounded-2xl shadow-lg transform hover:scale-105 transition-all duration-200 backdrop-blur-sm border border-gray-600"
          >
            과거 이력 조회
          </button>
        </div>

        {/* 추가 정보 */}
        <div className="mt-16 text-gray-400 text-sm opacity-80">
          <p>📞 실시간 통화 분석 • 🛡️ AI 기반 탐지</p>
        </div>
      </div>

      {/* 장식 요소들 */}
      <div className="absolute top-10 left-10 w-20 h-20 border-2 border-gray-600 rounded-full opacity-20 animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-16 h-16 border-2 border-gray-500 rounded-full opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute top-1/3 right-10 w-12 h-12 border-2 border-gray-700 rounded-full opacity-20 animate-pulse delay-2000"></div>
    </div>
  );
}