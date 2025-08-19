import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const backendUrl = process.env.BACKEND_URL
  
  if (!backendUrl) {
    return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
  }

  try {
    const callData = await req.json()
    
    // 요청 데이터 검증 - callDate 제거
    const requiredFields = ['phone', 'totalSeconds', 'riskScore', 'fraudType', 'keywords', 'audioUrl']
    for (const field of requiredFields) {
      if (callData[field] === undefined || callData[field] === null) {
        return new Response(`필수 필드 누락: ${field}`, { status: 400 })
      }
    }

    console.log(`📤 백엔드에 통화 기록 저장 요청:`, callData)

    const response = await fetch(`${backendUrl}/api/calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(callData)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`백엔드 응답 실패: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    console.log("✅ 통화 기록 저장 성공:", result)
    
    return NextResponse.json(result)

  } catch (error) {
    console.error("❌ 통화 기록 저장 실패:", error)
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(`통화 기록 저장 실패: ${errorMessage}`, { status: 502 })
  }
}

export async function GET(req: Request) {
  // 통화 기록 조회
  const backendUrl = process.env.BACKEND_URL
  
  if (!backendUrl) {
    return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
  }

  try {
    const response = await fetch(`${backendUrl}/api/calls`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`백엔드 응답 실패: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error("❌ 통화 기록 조회 실패:", error)
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(`통화 기록 조회 실패: ${errorMessage}`, { status: 502 })
  }
}