// ✅ Vercel에서 process.env 확실히 읽히도록 Node 런타임 고정
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

// ✅ 환경변수(따옴표/공백 제거) 읽기 — 함수 없이 상수로만 처리
const BACKEND_URL = (
  (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? '')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/^'(.*)'$/, '$1')
)

// 필요 시에만 검사해서 에러 내도록 헬퍼
function getBackendUrl(): string {
  if (!BACKEND_URL) {
    throw new Error('BACKEND_URL 미설정')
  }
  return BACKEND_URL
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')
  const id = searchParams.get('id')

  // ✅ 헬스 체크
  if (path === 'health') {
    try {
      const backendUrl = getBackendUrl()
      const targetUrl = `${backendUrl}/voice-guard/health`
      console.log('📡 요청 URL:', targetUrl)

      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      console.log('📥 백엔드 응답 상태:', res.status)

      if (!res.ok) {
        const errorText = await res.text()
        console.error('❌ 백엔드 응답 실패:', res.status, errorText)
        return new Response(`헬스 체크 실패: ${res.status} - ${errorText}`, { status: 500 })
      }

      const data = await res.json()
      console.log('✅ 백엔드 헬스 체크 성공:', data)
      return NextResponse.json(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('❌ 백엔드 헬스 체크 실패:', msg)
      const detail = BACKEND_URL ? `(${BACKEND_URL})` : '(env 미설정)'
      return new Response(`백엔드 서버 연결 실패: ${msg} ${detail}`, { status: 500 })
    }
  }

  // ✅ 분석 이력 목록 (/list)
  if (path === 'list') {
    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/list`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) return new Response(`분석 이력 조회 실패: ${res.status}`, { status: 500 })
      return NextResponse.json(await res.json())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('❌ 분석 이력 조회 실패:', msg)
      return new Response('분석 이력을 불러올 수 없습니다', { status: 500 })
    }
  }

  // ✅ 상세 조회 (/detail?id=xxx)
  if (path === 'detail' && id) {
    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/list?id=${id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.status === 404) return new Response('해당 ID의 분석 결과를 찾을 수 없습니다', { status: 404 })
      if (!res.ok) return new Response(`상세 조회 실패: ${res.status}`, { status: 500 })
      return NextResponse.json(await res.json())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('❌ 분석 상세 조회 실패:', msg)
      return new Response('분석 상세 정보를 불러올 수 없습니다', { status: 500 })
    }
  }

  // ✅ 오디오 프록시 (/audio?id=xxx)
  if (path === 'audio' && id) {
    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/audio/${id}`, { method: 'GET' })
      if (!res.ok) return new Response(`오디오 파일 조회 실패: ${res.status}`, { status: 500 })

      const contentType = res.headers.get('content-type') || 'audio/mpeg'
      const contentLength = res.headers.get('content-length')

      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      }
      if (contentLength) headers['Content-Length'] = contentLength

      return new Response(res.body, { status: res.status, headers })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('❌ 오디오 파일 조회 실패:', msg)
      return new Response('오디오 파일을 불러올 수 없습니다', { status: 500 })
    }
  }

  return new Response('잘못된 요청입니다. path 파라미터를 확인해주세요.', { status: 400 })
}

export async function POST(req: Request) {
  let backendUrl: string
  try {
    backendUrl = getBackendUrl()
  } catch {
    return new Response('백엔드 URL이 설정되지 않았습니다 (.env BACKEND_URL)', { status: 500 })
  }

  try {
    const formData = await req.formData()
    const audioFile = formData.get('audioFile') as File | null
    const phoneNumber = formData.get('phoneNumber') as string | null

    if (!audioFile) return new Response('오디오 파일이 없습니다', { status: 400 })
    if (!phoneNumber) return new Response('전화번호가 없습니다', { status: 400 })

    // 파일 크기 제한 (50MB)
    const maxSize = 50 * 1024 * 1024
    if (audioFile.size > maxSize) return new Response('파일 크기가 너무 큽니다 (최대 50MB)', { status: 400 })

    // 파일 형식 검증
    const allowedTypes = ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav']
    if (!allowedTypes.includes(audioFile.type)) return new Response('지원하지 않는 오디오 형식입니다', { status: 400 })

    console.log(`📤 의심 통화 업로드 시작: ${phoneNumber}, 파일크기: ${audioFile.size} bytes`)

    const backendResponse = await fetch(`${backendUrl}/upload/mp3`, {
      method: 'POST',
      body: formData,
    })

    const responseText = await backendResponse.text()

    if (!backendResponse.ok) {
      console.error('❌ 백엔드 업로드 실패:', responseText)
      return new Response(responseText || '파일 업로드에 실패했습니다', {
        status: backendResponse.status,
      })
    }

    try {
      return NextResponse.json(JSON.parse(responseText), {
        status: backendResponse.status,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      return new Response(responseText, {
        status: backendResponse.status,
        headers: { 'Content-Type': 'text/plain' },
      })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('❌ 의심 통화 업로드 요청 실패:', msg)
    if (msg.includes('fetch')) {
      return new Response('백엔드 서버에 연결할 수 없습니다', { status: 502 })
    }
    return new Response('파일 업로드 중 오류가 발생했습니다', { status: 500 })
  }
}

// ✅ OPTIONS 메서드 (CORS)
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
