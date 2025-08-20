import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const backendUrl = process.env.BACKEND_URL
  if (!backendUrl) {
    console.error("BACKEND_URL 환경변수가 설정되지 않음")
    return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
  }

  try {
    const resolvedParams = await params
    const callId = resolvedParams.id
    
    if (!callId) {
      return new Response("Call ID가 필요합니다", { status: 400 })
    }

    console.log(`📤 백엔드에 통화 분석 요청: call_id=${callId}`)
    console.log(`📡 요청 URL: ${backendUrl}/api/calls/${callId}/analyze`)

    // 백엔드의 analyze 엔드포인트 호출
    const res = await fetch(`${backendUrl}/api/calls/${callId}/analyze`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    console.log(`📥 백엔드 응답 상태: ${res.status}`)

    if (!res.ok) {
      const text = await res.text()
      console.error(`❌ 백엔드 분석 요청 실패: ${res.status} - ${text}`)
      throw new Error(`백엔드 분석 요청 실패: ${res.status} - ${text}`)
    }

    // 응답이 JSON인지 확인
    const contentType = res.headers.get('content-type')
    let json
    
    if (contentType && contentType.includes('application/json')) {
      json = await res.json()
    } else {
      // JSON이 아닌 경우 텍스트로 처리
      const text = await res.text()
      json = { message: text, success: true }
    }

    console.log("✅ 통화 분석 요청 성공:", json)
    return NextResponse.json(json)
    
  } catch (err) {
    console.error("❌ 통화 분석 요청 실패:", err)
    const msg = err instanceof Error ? err.message : String(err)
    
    // 네트워크 에러 vs 서버 에러 구분
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return new Response(`백엔드 서버 연결 실패: ${msg}`, { status: 503 })
    }
    
    return new Response(`통화 분석 요청 실패: ${msg}`, { status: 502 })
  }
}