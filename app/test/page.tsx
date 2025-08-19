'use client'

import { useState, useRef } from 'react'
// import { Button } from '@/components/ui/button'
// import { Mic, Square, Upload, Play, Pause, RotateCcw } from 'lucide-react'
// import { motion } from 'framer-motion'

export default function RecordingUploadPage() {
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const startRecording = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/mpeg" })
        setRecordingBlob(audioBlob)
        setAudioUrl(URL.createObjectURL(audioBlob))
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("녹음 시작 실패:", error)
      setError("마이크 권한을 확인해주세요.")
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const uploadToS3 = async () => {
    if (!recordingBlob) {
      setError("녹음 파일이 없습니다.")
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      // 1. Presigned URL 요청
      console.log("🔗 Presigned URL 요청 중...")
      const fileName = `recording_${Date.now()}.mp3`
      
      const presignResponse = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: fileName,
          contentType: 'audio/mpeg'
        }),
      })

      if (!presignResponse.ok) {
        const errorText = await presignResponse.text()
        throw new Error(`Presigned URL 요청 실패: ${presignResponse.status} - ${errorText}`)
      }

      const { presignedUrl, fileUrl } = await presignResponse.json()
      console.log("✅ Presigned URL 받음:", { presignedUrl, fileUrl })

      // 2. S3에 직접 업로드
      console.log("📤 S3 업로드 시작...")
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

      console.log("✅ S3 업로드 성공!")
      console.log("📁 파일 URL:", fileUrl)
      
      setUploadSuccess(true)

    } catch (error) {
      console.error("업로드 실패:", error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(`업로드 실패: ${errorMessage}`)
    } finally {
      setIsUploading(false)
    }
  }

  const togglePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const resetRecording = () => {
    setAudioUrl(undefined)
    setRecordingBlob(null)
    setUploadSuccess(false)
    setError(null)
    setIsPlaying(false)
    
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">음성 녹음 & 업로드</h1>
          <p className="text-gray-600">녹음 후 S3에 직접 업로드합니다</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
            {error}
          </div>
        )}

        {uploadSuccess && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-center">
            ✅ 업로드가 완료되었습니다!
          </div>
        )}

        <div className="space-y-4">
          {/* 녹음 버튼 */}
          {!isRecording && !audioUrl && (
            <button 
              onClick={startRecording} 
              className="w-full py-4 px-6 text-lg bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              🎤 녹음 시작
            </button>
          )}

          {/* 녹음 중 */}
          {isRecording && (
            <div className="text-center space-y-4">
              <div className="text-red-500 font-semibold">🎙️ 녹음 중...</div>
              <button
                onClick={stopRecording}
                className="w-full py-4 px-6 text-lg bg-red-600 hover:bg-red-700 text-white rounded-lg animate-pulse transition-colors"
              >
                ⏹️ 녹음 중지
              </button>
            </div>
          )}

          {/* 녹음 완료 후 */}
          {audioUrl && !isRecording && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg p-4 border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">녹음된 파일</span>
                  <button
                    onClick={togglePlayPause}
                    className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 transition-colors"
                  >
                    {isPlaying ? '⏸️' : '▶️'}
                  </button>
                </div>
                
                <audio 
                  ref={audioRef}
                  src={audioUrl} 
                  className="w-full"
                  controls
                  onEnded={() => setIsPlaying(false)}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={resetRecording}
                  className="flex-1 px-4 py-3 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  🔄 다시 녹음
                </button>
                
                <button
                  onClick={uploadToS3}
                  disabled={isUploading || uploadSuccess}
                  className="flex-1 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      업로드 중...
                    </>
                  ) : uploadSuccess ? (
                    "업로드 완료!"
                  ) : (
                    "📤 S3 업로드"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-sm text-gray-500 mt-8">
          <p>• Chrome, Firefox, Safari 등에서 마이크 권한이 필요합니다</p>
          <p>• 녹음 파일은 MP3 형식으로 S3에 저장됩니다</p>
        </div>
      </div>
    </main>
  )
}