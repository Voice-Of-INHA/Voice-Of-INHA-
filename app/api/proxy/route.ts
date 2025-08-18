import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  
  const path = searchParams.get("path")
  const id = searchParams.get("id")
  const checkStatus = searchParams.get("checkStatus")
  const backendUrl = process.env.BACKEND_URL

  // ✅ 백엔드 상태 체크 요청
  if (checkStatus === "true") {
    if (!backendUrl) {
      return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
    }
        
    try {
      const res = await fetch(`${backendUrl}/status`, { 
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      })
      if (!res.ok) throw new Error(`상태 체크 응답 오류: ${res.status}`)
      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      console.error("❌ 백엔드 상태 체크 실패:", err)
      return new Response("백엔드 서버에 연결할 수 없습니다", { status: 500 })
    }
  }

  // ✅ 분석 이력 목록 조회 (/list)
  if (path === "list") {
    if (!backendUrl) {
      return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
    }

    try {
      const res = await fetch(`${backendUrl}/list`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      })
      
      if (!res.ok) {
        throw new Error(`분석 이력 조회 실패: ${res.status}`)
      }
      
      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      console.error("❌ 분석 이력 조회 실패:", err)
      return new Response("분석 이력을 불러올 수 없습니다", { status: 500 })
    }
  }

  // ✅ 특정 분석 결과 상세 조회 (/list?id=xxx)
  if (path === "detail" && id) {
    if (!backendUrl) {
      return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
    }

    try {
      const res = await fetch(`${backendUrl}/list?id=${id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      })
      
      if (!res.ok) {
        if (res.status === 404) {
          return new Response("해당 ID의 분석 결과를 찾을 수 없습니다", { status: 404 })
        }
        throw new Error(`상세 조회 실패: ${res.status}`)
      }
      
      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      console.error("❌ 분석 상세 조회 실패:", err)
      return new Response("분석 상세 정보를 불러올 수 없습니다", { status: 500 })
    }
  }

  // ✅ 오디오 파일 프록시 (백엔드에서 오디오 스트리밍)
  if (path === "audio" && id) {
    if (!backendUrl) {
      return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
    }

    try {
      const res = await fetch(`${backendUrl}/audio/${id}`, {
        method: "GET"
      })
      
      if (!res.ok) {
        throw new Error(`오디오 파일 조회 실패: ${res.status}`)
      }
      
      // 오디오 파일을 스트리밍으로 전달
      const contentType = res.headers.get('content-type') || 'audio/mpeg'
      const contentLength = res.headers.get('content-length')
      
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      }
      
      if (contentLength) {
        headers['Content-Length'] = contentLength
      }
      
      return new Response(res.body, {
        status: res.status,
        headers
      })
    } catch (err) {
      console.error("❌ 오디오 파일 조회 실패:", err)
      return new Response("오디오 파일을 불러올 수 없습니다", { status: 500 })
    }
  }

  // ✅ 잘못된 요청
  return new Response("잘못된 요청입니다. path 파라미터를 확인해주세요.", { status: 400 })
}

export async function POST(req: Request) {
  const backendUrl = process.env.BACKEND_URL
  
  if (!backendUrl) {
    return new Response("백엔드 URL이 설정되지 않았습니다 (.env.local BACKEND_URL)", { status: 500 })
  }

  try {
    // ✅ 의심스러운 통화 파일 업로드 (/upload/mp3)
    const formData = await req.formData()
    
    // FormData 유효성 검사
    const audioFile = formData.get('audioFile') as File
    const phoneNumber = formData.get('phoneNumber') as string
    
    if (!audioFile) {
      return new Response("오디오 파일이 없습니다", { status: 400 })
    }
    
    if (!phoneNumber) {
      return new Response("전화번호가 없습니다", { status: 400 })
    }

    // 파일 크기 제한 (50MB)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (audioFile.size > maxSize) {
      return new Response("파일 크기가 너무 큽니다 (최대 50MB)", { status: 400 })
    }

    // 파일 형식 검증
    const allowedTypes = ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav']
    if (!allowedTypes.includes(audioFile.type)) {
      return new Response("지원하지 않는 오디오 형식입니다", { status: 400 })
    }

    console.log(`📤 의심 통화 업로드 시작: ${phoneNumber}, 파일크기: ${audioFile.size} bytes`)

    const backendResponse = await fetch(`${backendUrl}/upload/mp3`, {
      method: "POST",
      body: formData,
    })

    const responseText = await backendResponse.text()
    
    // 백엔드 응답 처리
    if (!backendResponse.ok) {
      console.error("❌ 백엔드 업로드 실패:", responseText)
      return new Response(responseText || "파일 업로드에 실패했습니다", { 
        status: backendResponse.status 
      })
    }

    // JSON 응답 파싱 시도
    try {
      const jsonResponse = JSON.parse(responseText)
      console.log("✅ 의심 통화 업로드 성공:", jsonResponse)
      
      return NextResponse.json(jsonResponse, {
        status: backendResponse.status,
        headers: {
          "Content-Type": "application/json",
        }
      })
    } catch (parseError) {
      // JSON 파싱 실패 시 텍스트 그대로 반환
      console.log("✅ 의심 통화 업로드 성공 (텍스트 응답):", responseText)
      
      return new Response(responseText, {
        status: backendResponse.status,
        headers: {
          "Content-Type": "text/plain",
        }
      })
    }

  } catch (err) {
    console.error("❌ 의심 통화 업로드 요청 실패:", err)
    
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return new Response("백엔드 서버에 연결할 수 없습니다", { status: 502 })
    }
    
    return new Response("파일 업로드 중 오류가 발생했습니다", { status: 500 })
  }
}

// ✅ OPTIONS 메서드 처리 (CORS)
export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}