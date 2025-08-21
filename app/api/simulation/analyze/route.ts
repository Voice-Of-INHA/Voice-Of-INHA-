import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // JSON 데이터를 파싱
    const body = await request.json();
    
    // 백엔드 서버로 프록시
    const response = await fetch('https://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/api/simulation/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Analyze Proxy Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}