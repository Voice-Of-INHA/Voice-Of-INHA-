// app/api/scenarios/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'

// Next.js App Router API Route
// GET /api/scenarios/[id]
export async function GET(
  request: NextRequest,
  context: { params: { id: string } } // ✅ context로 받아야 함
) {
  try {
    const { id } = context.params

    // 백엔드 API 호출
    const response = await fetch(
      `https://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/api/scenarios/${id}`
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: `시나리오를 가져올 수 없습니다: ${response.status}` },
        { status: response.status }
      )
    }

    const scenarioData = await response.json()

    return NextResponse.json(scenarioData)
  } catch (error) {
    console.error('❌ 시나리오 가져오기 실패:', error)
    return NextResponse.json(
      { error: '시나리오를 가져오는 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
