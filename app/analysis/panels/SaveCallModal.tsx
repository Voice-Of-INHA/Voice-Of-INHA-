interface AnalysisResult {
  risk: 'low' | 'medium' | 'high' | null
  riskScore: number
  keywords: string[]
  reason: string
  timestamp: number
}

interface SaveCallModalProps {
  isOpen: boolean
  analysisResult: AnalysisResult
  phoneNumber: string
  isSaving: boolean
  recordingBlob: Blob | null
  recordingSeconds: number
  onPhoneNumberChange: (value: string) => void
  onSave: (phoneNumber: string, fileUrl: string) => void
  onSkip: () => void
}

export default function SaveCallModal({
  isOpen,
  analysisResult,
  phoneNumber,
  isSaving,
  recordingBlob,
  recordingSeconds,
  onPhoneNumberChange,
  onSave,
  onSkip
}: SaveCallModalProps) {
  // 위험도별 색상
  const getRiskColor = (risk: string | null) => {
    switch (risk) {
      case 'high': return 'text-red-500'
      case 'medium': return 'text-yellow-500'  
      case 'low': return 'text-green-500'
      default: return 'text-gray-500'
    }
  }

  // 위험 통화 저장 처리
  const handleSave = async () => {
    if (!recordingBlob || !phoneNumber.trim()) {
      alert('녹음 파일과 전화번호를 확인해주세요.')
      return
    }

    try {
      // 1. Presigned URL 요청
      const fileName = `recording_${Date.now()}.mp3`
      const presignResponse = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          contentType: 'audio/mpeg',
        }),
      })

      if (!presignResponse.ok) {
        const errorText = await presignResponse.text()
        throw new Error(`Presigned URL 요청 실패: ${presignResponse.status} - ${errorText}`)
      }

      const { presignedUrl, fileUrl: finalUrl } = await presignResponse.json()
      console.log('✅ Presigned URL 받음:', { presignedUrl, fileUrl: finalUrl })

      // 2. S3에 직접 업로드
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'audio/mpeg',
        },
        body: recordingBlob,
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(`S3 업로드 실패: ${uploadResponse.status} - ${errorText}`)
      }

      console.log('✅ S3 업로드 성공!', finalUrl)
      
      // 3. DB에 저장
      onSave(phoneNumber.trim(), finalUrl)
      
    } catch (error) {
      console.error('저장 실패:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert(`저장 실패: ${errorMessage}`)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-4">위험 통화 감지</h3>
        <p className="text-gray-300 mb-4">
          위험도가 {analysisResult.riskScore}%로 보이스피싱 의심 통화입니다. 전화번호를 입력하시면 증거용 녹음 파일이 저장됩니다.
        </p>

        {/* 분석 요약 */}
        <div className="bg-gray-800 p-3 rounded mb-4">
          <h4 className="text-white text-sm font-semibold mb-2">분석 요약</h4>
          <div className="text-xs text-gray-300 space-y-1">
            <div>
              위험도:{' '}
              <span className={getRiskColor(analysisResult.risk)}>{analysisResult.riskScore}%</span>
            </div>
            {analysisResult.keywords.length > 0 && (
              <div>키워드: {analysisResult.keywords.join(', ')}</div>
            )}
            {analysisResult.reason && <div>사유: {analysisResult.reason}</div>}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-white text-sm mb-2">상대방 전화번호</label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => onPhoneNumberChange(e.target.value)}
            placeholder="010-1234-5678"
            className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            disabled={isSaving}
          />
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? '저장 중...' : '위험 통화 저장'}
          </button>
          <button
            onClick={onSkip}
            disabled={isSaving}
            className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}