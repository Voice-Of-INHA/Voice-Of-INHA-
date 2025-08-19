"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"

// 실제 DB 응답을 화면 모델로 변환해 사용할 타입
interface AnalysisRecord {
  id: string
  phoneNumber: string
  callDate: string // 0000년00월00일
  callDuration: string // 00분 00초
  riskPercentage: number
  phishingType: string
  keywords: string[]
  audioFileUrl: string
  risk: "medium" | "high"
}

interface ApiResponseItem {
  id?: number
  phone?: string
  callDate?: string
  totalSeconds?: number
  riskScore?: number
  fraudType?: string
  keywords?: string[]
  audioUrl?: string
}

const CircularGauge = ({ percentage, size = 100 }: { percentage: number; size?: number }) => {
  const radius = size / 2 - 6
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const color =
    percentage >= 70 ? "#ef4444" : percentage >= 50 ? "#f59e0b" : "#10b981"

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#374151" strokeWidth="6" fill="transparent" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="6"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-white font-bold text-lg">{percentage}%</span>
          <div className="text-gray-400 text-xs">위험도</div>
        </div>
      </div>
    </div>
  )
}

const formatDuration = (totalSeconds: number = 0): string => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, "0")}분 ${seconds
    .toString()
    .padStart(2, "0")}초`
}

const formatDate = (iso?: string): string => {
  if (!iso) return "알 수 없음"
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, "0")
    const day = d.getDate().toString().padStart(2, "0")
    return `${y}년${m}월${day}일`
  } catch {
    return iso
  }
}

export default function AnalysisDetailPage() {
  const params = useParams()
  const id = useMemo(() => String(params?.id ?? ""), [params])

  const [record, setRecord] = useState<AnalysisRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const load = async () => {
      if (!id) return
      setIsLoading(true)
      setError(null)
      try {
        console.log(`📄 상세 조회 /api/calls?id=${id}`)
        const res = await fetch(`/api/calls?id=${encodeURIComponent(id)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          // cache: "no-store",
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`/api/calls?id=${id} 실패: ${res.status} - ${text}`)
        }
        const data: ApiResponseItem = await res.json()

        const riskScore = data.riskScore ?? 0
        const mapped: AnalysisRecord = {
          id: (data.id ?? id).toString(),
          phoneNumber: data.phone ?? "알 수 없음",
          callDate: formatDate(data.callDate),
          callDuration: formatDuration(data.totalSeconds),
          riskPercentage: riskScore,
          phishingType: data.fraudType ?? "분석 중",
          keywords: data.keywords ?? [],
          audioFileUrl: data.audioUrl ?? "",
          risk: riskScore >= 70 ? "high" : "medium",
        }
        setRecord(mapped)
      } catch (e) {
        console.error("❌ 상세 조회 실패:", e)
        setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다")
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  const getPhishingTypeColor = (t: string) =>
    /사기|사칭|협박/.test(t) ? "bg-red-900 text-red-300 border border-red-600" : "bg-yellow-900 text-yellow-300 border border-yellow-600"

  const getRiskIcon = (risk: string) =>
    risk === "high" ? (
      <span className="text-red-500 text-3xl">⚠️</span>
    ) : (
      <span className="text-yellow-500 text-3xl">🛡️</span>
    )

  const handleAudioPlay = async () => {
    if (!record?.audioFileUrl) return
    try {
      // 이미 재생 중이면 일시정지
      if (audioEl && !audioEl.paused) {
        audioEl.pause()
        setIsPlaying(false)
        return
      }
      // 기존 객체 재사용
      if (audioEl) {
        await audioEl.play()
        setIsPlaying(true)
        return
      }
      // 새 오디오 객체
      const a = new Audio(record.audioFileUrl)
      a.onloadedmetadata = () => setDuration(a.duration)
      a.ontimeupdate = () => setCurrentTime(a.currentTime)
      a.onplay = () => setIsPlaying(true)
      a.onpause = () => setIsPlaying(false)
      a.onended = () => {
        setIsPlaying(false)
        setCurrentTime(0)
      }
      a.onerror = (e) => {
        console.error("❌ 오디오 오류:", e)
        alert("오디오 파일을 재생할 수 없습니다.")
        setIsPlaying(false)
      }
      setAudioEl(a)
      await a.play()
    } catch (e) {
      console.error("❌ 오디오 재생 실패:", e)
      alert("오디오 재생 중 오류가 발생했습니다.")
      setIsPlaying(false)
    }
  }

  const handleSeek: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const t = parseFloat(e.target.value)
    if (audioEl) {
      audioEl.currentTime = t
      setCurrentTime(t)
    }
  }

  const fmtTime = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-gray-400">상세 분석 결과를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !record) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl text-gray-400 mb-4">❌</div>
          <p className="text-gray-400 text-lg">{error || "데이터를 찾을 수 없습니다."}</p>
          <button
            onClick={() => location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <button
          className="flex items-center text-white hover:text-gray-300 p-2 rounded-lg hover:bg-gray-800 transition-colors"
          onClick={() => window.history.back()}
        >
          ← 돌아가기
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">분석 상세 결과</h1>
          <p className="text-gray-400 text-sm">ID: {record.id}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => location.reload()}
            className="flex items-center text-white hover:text-gray-300 p-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            🔄 새로고침
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* 기본 정보 카드 */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              {getRiskIcon(record.risk)}
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">{record.phoneNumber}</h2>
                <div className="flex items-center space-x-6 text-gray-400">
                  <div className="flex items-center space-x-2">
                    <span>📅</span>
                    <span>{record.callDate}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>📞</span>
                    <span>{record.callDuration}</span>
                  </div>
                </div>
              </div>
            </div>
            <CircularGauge percentage={record.riskPercentage} size={120} />
          </div>

          {/* 유형 & 키워드 */}
          <div className="space-y-6">
            <div>
              <span className="text-gray-400 text-sm mb-2 block">탐지된 유형:</span>
              <span className={`px-3 py-2 text-sm rounded-lg ${getPhishingTypeColor(record.phishingType)}`}>
                {record.phishingType}
              </span>
            </div>

            {record.keywords.length > 0 && (
              <div>
                <span className="text-gray-400 text-sm mb-2 block">탐지된 키워드:</span>
                <div className="flex flex-wrap gap-2">
                  {record.keywords.map((k, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-900 text-blue-300 text-sm rounded border border-blue-600">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 오디오 재생 */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleAudioPlay}
                  className="flex items-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors space-x-2"
                >
                  {isPlaying ? (
                    <>
                      <span>⏸️</span>
                      <span>일시정지</span>
                    </>
                  ) : (
                    <>
                      <span>▶️</span>
                      <span>녹음 재생</span>
                    </>
                  )}
                </button>

                {duration > 0 && (
                  <div className="flex items-center space-x-2 text-gray-400 text-sm">
                    <span>{fmtTime(currentTime)}</span>
                    <span>/</span>
                    <span>{fmtTime(duration)}</span>
                  </div>
                )}
              </div>

              {duration > 0 && (
                <div className="w-full">
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                        (currentTime / duration) * 100
                      }%, #374151 ${(currentTime / duration) * 100}%, #374151 100%)`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 안내 카드들 (정적) */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">🛡️ 보이스피싱 예방 수칙</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg">
              <span className="text-red-400 font-bold">1.</span>
              <p className="text-gray-300 text-sm">금융기관이나 수사기관에서 전화로 개인정보를 요구하지 않습니다.</p>
            </div>
            <div className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg">
              <span className="text-red-400 font-bold">2.</span>
              <p className="text-gray-300 text-sm">의심스러운 전화는 즉시 끊고 해당 기관에 직접 확인하세요.</p>
            </div>
            <div className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg">
              <span className="text-red-400 font-bold">3.</span>
              <p className="text-gray-300 text-sm">계좌이체나 현금인출을 요구하면 112에 신고하세요.</p>
            </div>
            <div className="flex items-start space-x-3 bg-gray-800 p-3 rounded-lg">
              <span className="text-red-400 font-bold">4.</span>
              <p className="text-gray-300 text-sm">가족이나 지인에게 상황을 공유하고 조언을 구하세요.</p>
            </div>
          </div>
        </div>

        <div className="bg-red-900 border border-red-600 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-300 mb-4">🚨 신고 안내</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-800 p-4 rounded-lg">
              <h4 className="text-red-300 font-medium mb-2">긴급신고</h4>
              <p className="text-red-200 text-2xl font-bold">112</p>
              <p className="text-red-300 text-sm">경찰서 (24시간)</p>
            </div>
            <div className="bg-red-800 p-4 rounded-lg">
              <h4 className="text-red-300 font-medium mb-2">피해신고</h4>
              <p className="text-red-200 text-2xl font-bold">1332</p>
              <p className="text-red-300 text-sm">금융감독원 (평일 9-18시)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
