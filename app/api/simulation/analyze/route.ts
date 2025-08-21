// app/api/simulation/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // 클라이언트에서 받은 JSON 데이터
    const body = await request.json();
    
    // 백엔드 서버로 프록시 요청
    const response = await fetch('https://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/api/simulation/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('백엔드 분석 오류:', response.status, errorText);
      return NextResponse.json(
        { error: `분석 서버 오류: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('분석 프록시 오류:', error);
    return NextResponse.json(
      { error: '분석 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}