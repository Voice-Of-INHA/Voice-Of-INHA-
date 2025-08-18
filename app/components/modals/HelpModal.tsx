"use client"

import { useState } from "react"

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
  initialPage?: 'analysis' | 'pastlist'
}

export default function HelpModal({ isOpen, onClose, initialPage = 'analysis' }: HelpModalProps) {
  const [currentPage, setCurrentPage] = useState<'analysis' | 'pastlist'>(initialPage)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-xl max-w-lg w-full mx-4 border border-gray-700">
        {/* 헤더와 네비게이션 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">
            🛡️ {currentPage === 'analysis' ? '실시간 분석' : '과거 이력 조회'} 도움말
          </h3>
          
          {/* 페이지 네비게이션 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage('analysis')}
              disabled={currentPage === 'analysis'}
              className={`p-2 rounded-lg transition-colors ${
                currentPage === 'analysis' 
                  ? 'bg-blue-600 text-white cursor-not-allowed' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="실시간 분석 도움말"
            >
              ← 
            </button>
            <span className="text-gray-400 text-sm">
              {currentPage === 'analysis' ? '1' : '2'} / 2
            </span>
            <button
              onClick={() => setCurrentPage('pastlist')}
              disabled={currentPage === 'pastlist'}
              className={`p-2 rounded-lg transition-colors ${
                currentPage === 'pastlist' 
                  ? 'bg-blue-600 text-white cursor-not-allowed' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="과거 이력 조회 도움말"
            >
              →
            </button>
          </div>
        </div>

        {/* 실시간 분석 페이지 */}
        {currentPage === 'analysis' && (
          <div className="space-y-4 text-gray-300 text-sm">
            <div>
              <h4 className="text-white font-semibold mb-2">🎯 시스템 작동 방식</h4>
              <ul className="space-y-1 ml-4">
                <li>• 실시간으로 통화 내용을 분석하여 보이스피싱 위험도를 판단합니다</li>
                <li>• AI가 음성을 텍스트로 변환하고 의심스러운 패턴을 감지합니다</li>
                <li>• 위험도가 50% 이상이면 자동으로 녹음 파일을 보관합니다</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-2">🚨 주의사항</h4>
              <ul className="space-y-1 ml-4">
                <li>• 다음과 같은 키워드가 나오면 즉시 의심하세요:</li>
                <li className="ml-4 text-red-400">- 안전계좌, 보호계좌, 명의도용</li>
                <li className="ml-4 text-red-400">- 경찰청, 검찰청, 금융감독원</li>
                <li className="ml-4 text-red-400">- 계좌이체, 현금인출, OTP 번호</li>
                <li>• 공공기관은 절대 전화로 계좌이체를 요구하지 않습니다</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-2">📱 사용법</h4>
              <ul className="space-y-1 ml-4">
                <li>• 의심스러운 전화가 올 때 &apos;분석 시작&apos; 버튼을 누르세요</li>
                <li>• 통화가 끝나면 &apos;분석 중지&apos; 버튼을 누르세요</li>
                <li>• 위험도가 높으면 자동으로 저장 창이 나타납니다</li>
                <li>• 상대방 전화번호를 입력하고 저장하면 신고에 활용할 수 있습니다</li>
              </ul>
            </div>
          </div>
        )}

        {/* 과거 이력 조회 페이지 */}
        {currentPage === 'pastlist' && (
          <div className="space-y-4 text-gray-300 text-sm">
            <div>
              <h4 className="text-white font-semibold mb-2">📋 이력 조회 기능</h4>
              <ul className="space-y-1 ml-4">
                <li>• 과거에 저장된 의심 통화 기록을 확인할 수 있습니다</li>
                <li>• 전화번호, 위험도, 분석 결과를 한눈에 볼 수 있습니다</li>
                <li>• 저장된 녹음 파일을 재생하여 다시 들을 수 있습니다</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-2">🔍 검색 및 필터</h4>
              <ul className="space-y-1 ml-4">
                <li>• 전화번호로 특정 발신자의 통화 기록을 검색할 수 있습니다</li>
                <li>• 위험도별로 필터링하여 고위험 통화만 확인 가능합니다</li>
                <li>• 날짜 범위를 선택하여 특정 기간의 기록만 조회할 수 있습니다</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-2">📤 신고 및 관리</h4>
              <ul className="space-y-1 ml-4">
                <li>• 의심 통화 기록을 관련 기관에 신고할 수 있습니다</li>
                <li>• 불필요한 기록은 개별 또는 일괄 삭제가 가능합니다</li>
                <li>• 즐겨찾기 기능으로 중요한 기록을 따로 관리할 수 있습니다</li>
                <li>• 녹음 파일을 다운로드하여 외부에서 활용할 수 있습니다</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-2">⚠️ 개인정보 보호</h4>
              <ul className="space-y-1 ml-4">
                <li>• 모든 데이터는 기기 내부에 안전하게 저장됩니다</li>
                <li>• 원하지 않는 기록은 언제든지 삭제할 수 있습니다</li>
                <li>• 자동 삭제 기능으로 오래된 기록을 주기적으로 정리합니다</li>
              </ul>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          확인
        </button>
      </div>
    </div>
  )
}