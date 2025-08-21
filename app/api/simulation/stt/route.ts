import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // FormData를 그대로 전달
    const formData = await request.formData();
    
    // 백엔드 서버로 프록시
    const response = await fetch('https://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/api/simulation/stt', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('STT Proxy Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}