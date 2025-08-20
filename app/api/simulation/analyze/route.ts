import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transcript } = body

    if (!transcript) {
      return NextResponse.json(
        { error: 'transcript가 필요합니다.' },
        { status: 400 }
      )
    }

    console.log('시뮬레이션 분석 요청:', transcript)

    // 여기서 실제 분석 서비스로 전송하는 로직을 구현할 수 있습니다
    // 현재는 더미 응답을 반환합니다
    const analysisResult = {
      risk: 'medium',
      score: 65,
      explanation: '사용자의 응답을 분석한 결과, 중간 수준의 위험도를 보입니다.',
      feedback: '전화번호나 개인정보를 요구하는 경우 주의가 필요합니다.',
      llm: 'AI 분석 결과: 보이스피싱 위험도 65%로 판단됩니다.'
    }

    return NextResponse.json({
      success: true,
      analysis: analysisResult
    })

  } catch (error) {
    console.error('분석 처리 오류:', error)
    return NextResponse.json(
      { error: '분석 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
