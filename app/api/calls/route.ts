import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const backendUrl = process.env.BACKEND_URL
  if (!backendUrl) {
    return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
  }

  try {
    const callData = await req.json()

    // 요청 데이터 검증 (callDate는 백엔드가 생성하므로 제외)
    const required = ['phone', 'totalSeconds', 'riskScore', 'fraudType', 'keywords', 'audioUrl'] as const
    for (const key of required) {
      if (callData[key] === undefined || callData[key] === null) {
        return new Response(`필수 필드 누락: ${key}`, { status: 400 })
      }
    }

    console.log("📤 백엔드에 통화 기록 저장 요청:", callData)

    const res = await fetch(`${backendUrl}/api/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callData),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`백엔드 응답 실패: ${res.status} - ${text}`)
    }

    const json = await res.json()
    console.log("✅ 통화 기록 저장 성공:", json)
    return NextResponse.json(json)
  } catch (err) {
    console.error("❌ 통화 기록 저장 실패:", err)
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(`통화 기록 저장 실패: ${msg}`, { status: 502 })
  }
}

export async function GET(req: Request) {
  const backendUrl = process.env.BACKEND_URL
  if (!backendUrl) {
    return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    // 목록 또는 단건 조회를 백엔드에 위임
    const target = id
      ? `${backendUrl}/api/calls/${encodeURIComponent(id)}`
      : `${backendUrl}/api/calls`

    const res = await fetch(target, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // 필요시 캐시 무효화:
      // cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`백엔드 응답 실패: ${res.status} - ${text}`)
    }

    const json = await res.json()
    return NextResponse.json(json)
  } catch (err) {
    console.error("❌ 통화 기록 조회 실패:", err)
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(`통화 기록 조회 실패: ${msg}`, { status: 502 })
  }
}
