// app/api/simulation/stt/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // 클라이언트에서 받은 FormData를 그대로 전달
    const formData = await request.formData();
    
    // 백엔드 서버로 프록시 요청
    const response = await fetch('https://port-0-voice-of-inha-meh9fr2ha78ceb2e.sel5.cloudtype.app/api/simulation/stt', {
      method: 'POST',
      body: formData,
      // FormData일 때는 Content-Type을 명시하지 않아야 boundary가 자동으로 설정됨
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('백엔드 STT 오류:', response.status, errorText);
      return NextResponse.json(
        { success: false, error: `STT 서버 오류: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('STT 프록시 오류:', error);
    return NextResponse.json(
      { success: false, error: 'STT 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}