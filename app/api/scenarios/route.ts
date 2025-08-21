import { NextResponse } from 'next/server';

export async function GET() {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    return new Response('백엔드 URL이 설정되지 않았습니다', { status: 500 });
  }

  try {
    const response = await fetch(`${backendUrl}/api/scenarios`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`백엔드 응답 실패: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('시나리오 목록 조회 실패:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(`시나리오 목록 조회 실패: ${msg}`, { status: 502 });
  }
}