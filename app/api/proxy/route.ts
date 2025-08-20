import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  
  const path = searchParams.get("path")
  const id = searchParams.get("id")
  const backendUrl = process.env.BACKEND_URL

  // ✅ 백엔드 헬스 체크 (/health)
  if (path === "health") {
    console.log("🔍 헬스 체크 시작 - backendUrl:", backendUrl)
    
    if (!backendUrl) {
      return new Response(JSON.stringify({
        error: "백엔드 URL이 설정되지 않았습니다",
        env: process.env.NODE_ENV
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
    
    try {
      const targetUrl = `${backendUrl}/voice-guard/health`
      console.log("📡 요청 URL:", targetUrl)
      
      const res = await fetch(targetUrl, { 
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      })
      
      console.log("📥 응답 상태:", res.status)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error("❌ 백엔드 응답 실패:", res.status, errorText)
        
        return new Response(JSON.stringify({
          error: `HTTP ${res.status}: ${errorText}`,
          url: targetUrl
        }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        })
      }
      
      const data = await res.json()
      console.log("✅ 헬스 체크 성공:", data)
      return NextResponse.json(data)
    } catch (err) {
      console.error("❌ 헬스 체크 실패:", err)
      
      const errorMessage = err instanceof Error ? err.message : String(err)
      const errorName = err instanceof Error ? err.name : 'UnknownError'
      
      return new Response(JSON.stringify({
        error: `연결 실패: ${errorMessage}`,
        type: errorName,
        url: `${backendUrl}/voice-guard/health`
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
  }

  // ✅ 시나리오 목록 조회 (/scenarios)
  if (path === "scenarios") {
    console.log("🔍 시나리오 목록 조회")
    
    if (!backendUrl) {
      return new Response(JSON.stringify({
        error: "백엔드 URL이 설정되지 않았습니다"
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
    
    try {
      const targetUrl = `${backendUrl}/api/scenarios`
      console.log("📡 요청 URL:", targetUrl)
      
      const res = await fetch(targetUrl, { 
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error("❌ 시나리오 목록 조회 실패:", res.status, errorText)
        
        return new Response(JSON.stringify({
          error: `HTTP ${res.status}: ${errorText}`,
          url: targetUrl
        }), { 
          status: res.status,
          headers: { "Content-Type": "application/json" }
        })
      }
      
      const data = await res.json()
      console.log("✅ 시나리오 목록 조회 성공:", data)
      return NextResponse.json(data)
    } catch (err) {
      console.error("❌ 시나리오 목록 조회 실패:", err)
      
      const errorMessage = err instanceof Error ? err.message : String(err)
      
      return new Response(JSON.stringify({
        error: `연결 실패: ${errorMessage}`,
        url: `${backendUrl}/api/scenarios`
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
  }

  // ✅ 특정 시나리오 상세 조회 (/scenarios/{id})
  if (path === "scenario" && id) {
    console.log(`🔍 시나리오 상세 조회: ${id}`)
    
    if (!backendUrl) {
      return new Response(JSON.stringify({
        error: "백엔드 URL이 설정되지 않았습니다"
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
    
    try {
      const targetUrl = `${backendUrl}/api/scenarios/${id}`
      console.log("📡 요청 URL:", targetUrl)
      
      const res = await fetch(targetUrl, { 
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error("❌ 시나리오 상세 조회 실패:", res.status, errorText)
        
        return new Response(JSON.stringify({
          error: `HTTP ${res.status}: ${errorText}`,
          url: targetUrl
        }), { 
          status: res.status,
          headers: { "Content-Type": "application/json" }
        })
      }
      
      const data = await res.json()
      console.log("✅ 시나리오 상세 조회 성공:", data)
      return NextResponse.json(data)
    } catch (err) {
      console.error("❌ 시나리오 상세 조회 실패:", err)
      
      const errorMessage = err instanceof Error ? err.message : String(err)
      
      return new Response(JSON.stringify({
        error: `연결 실패: ${errorMessage}`,
        url: `${backendUrl}/api/scenarios/${id}`
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
  }

  // ✅ 라운드별 분석 결과 조회 (/analysis/{sessionId})
  if (path === "analysis" && id) {
    console.log(`🔍 분석 결과 조회: ${id}`)
    
    if (!backendUrl) {
      return new Response(JSON.stringify({
        error: "백엔드 URL이 설정되지 않았습니다"
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
    
    try {
      const targetUrl = `${backendUrl}/analysis/${id}`
      console.log("📡 요청 URL:", targetUrl)
      
      const res = await fetch(targetUrl, { 
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error("❌ 분석 결과 조회 실패:", res.status, errorText)
        
        return new Response(JSON.stringify({
          error: `HTTP ${res.status}: ${errorText}`,
          url: targetUrl
        }), { 
          status: res.status,
          headers: { "Content-Type": "application/json" }
        })
      }
      
      const data = await res.json()
      console.log("✅ 분석 결과 조회 성공:", data)
      return NextResponse.json(data)
    } catch (err) {
      console.error("❌ 분석 결과 조회 실패:", err)
      
      const errorMessage = err instanceof Error ? err.message : String(err)
      
      return new Response(JSON.stringify({
        error: `연결 실패: ${errorMessage}`,
        url: `${backendUrl}/analysis/${id}`
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
  }

  // ✅ 최종 결과 조회 (/result/{sessionId})
  if (path === "result" && id) {
    console.log(`🔍 최종 결과 조회: ${id}`)
    
    if (!backendUrl) {
      return new Response(JSON.stringify({
        error: "백엔드 URL이 설정되지 않았습니다"
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
    
    try {
      const targetUrl = `${backendUrl}/result/${id}`
      console.log("📡 요청 URL:", targetUrl)
      
      const res = await fetch(targetUrl, { 
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error("❌ 최종 결과 조회 실패:", res.status, errorText)
        
        return new Response(JSON.stringify({
          error: `HTTP ${res.status}: ${errorText}`,
          url: targetUrl
        }), { 
          status: res.status,
          headers: { "Content-Type": "application/json" }
        })
      }
      
      const data = await res.json()
      console.log("✅ 최종 결과 조회 성공:", data)
      return NextResponse.json(data)
    } catch (err) {
      console.error("❌ 최종 결과 조회 실패:", err)
      
      const errorMessage = err instanceof Error ? err.message : String(err)
      
      return new Response(JSON.stringify({
        error: `연결 실패: ${errorMessage}`,
        url: `${backendUrl}/result/${id}`
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }
  }

  // ✅ 백엔드 프록시 요청 (기존 코드)
  if (!backendUrl || !path) {
    return new Response("백엔드 URL 또는 path 누락", { status: 400 })
  }

  // URL 생성
  let fullUrl = `${backendUrl}/${path}`
  if (path === "detail" && id) {
    fullUrl = `${backendUrl}/list?id=${id}`
  } else if (path === "audio" && id) {
    fullUrl = `${backendUrl}/audio/${id}`
  }

  try {
    const res = await fetch(fullUrl, { method: "GET" })
    
    // 오디오 파일 스트리밍 처리
    if (path === "audio" && id) {
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
    }

    // 일반 JSON 응답 처리
    const text = await res.text()
    
    if (!res.ok) {
      return new Response(text, { status: res.status })
    }

    try {
      const json = JSON.parse(text)
      return NextResponse.json(json)
    } catch {
      return new Response(text, {
        status: res.status,
        headers: { "Content-Type": "text/plain" }
      })
    }

  } catch (err) {
    console.error("❌ 백엔드 연결 실패:", err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    return new Response(`백엔드에 연결할 수 없습니다: ${errorMessage}`, { status: 502 })
  }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")
  const backendUrl = process.env.BACKEND_URL
  
  if (!backendUrl) {
    return new Response("백엔드 URL이 설정되지 않았습니다 (.env.local BACKEND_URL)", { status: 500 })
  }

  // ✅ 음성 답변 분석 요청 (/analyze)
  if (path === "analyze") {
    console.log("🔍 음성 답변 분석 요청")
    
    try {
      const formData = await req.formData()
      
      // FormData 유효성 검사
      const audioFile = formData.get('audioFile') as File
      const sessionId = formData.get('sessionId') as string
      const scenarioId = formData.get('scenarioId') as string
      const round = formData.get('round') as string
      const textAnswer = formData.get('textAnswer') as string // 텍스트 답변도 지원
      
      if (!audioFile && !textAnswer) {
        return new Response("오디오 파일 또는 텍스트 답변이 필요합니다", { status: 400 })
      }
      
      if (!sessionId || !scenarioId || !round) {
        return new Response("sessionId, scenarioId, round는 필수입니다", { status: 400 })
      }

      // 오디오 파일이 있는 경우 크기 제한 (10MB)
      if (audioFile) {
        const maxSize = 10 * 1024 * 1024
        if (audioFile.size > maxSize) {
          return new Response("파일 크기가 너무 큽니다 (최대 10MB)", { status: 400 })
        }

        // 파일 형식 검증
        const allowedTypes = ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a']
        if (!allowedTypes.includes(audioFile.type)) {
          return new Response("지원하지 않는 오디오 형식입니다", { status: 400 })
        }
      }

      console.log(`📤 음성 답변 분석 시작: 시나리오=${scenarioId}, 라운드=${round}, 세션=${sessionId}`)

      const backendResponse = await fetch(`${backendUrl}/analyze`, {
        method: "POST",
        body: formData,
      })

      const text = await backendResponse.text()

      if (!backendResponse.ok) {
        console.error("❌ 음성 답변 분석 실패:", text)
        return new Response(text || "음성 답변 분석에 실패했습니다", { 
          status: backendResponse.status 
        })
      }

      try {
        const json = JSON.parse(text)
        console.log("✅ 음성 답변 분석 성공:", json)
        return new Response(JSON.stringify(json), {
          status: backendResponse.status,
          headers: { "Content-Type": "application/json" }
        })
      } catch {
        console.log("✅ 음성 답변 분석 성공 (텍스트 응답):", text)
        return new Response(text, { 
          status: backendResponse.status,
          headers: { "Content-Type": "text/plain" }
        })
      }

    } catch (err) {
      console.error("❌ 음성 답변 분석 요청 실패:", err)
      
      const errorMessage = err instanceof Error ? err.message : String(err)
      
      if (err instanceof TypeError && errorMessage.includes('fetch')) {
        return new Response("백엔드 서버에 연결할 수 없습니다", { status: 502 })
      }
      
      return new Response(`음성 답변 분석 중 오류가 발생했습니다: ${errorMessage}`, { status: 502 })
    }
  }

  // ✅ 시뮬레이션 세션 시작 (/session/start)
  if (path === "session" && searchParams.get("action") === "start") {
    console.log("🔍 시뮬레이션 세션 시작")
    
    try {
      const body = await req.json()
      const { scenarioId, userId } = body
      
      if (!scenarioId) {
        return new Response("scenarioId는 필수입니다", { status: 400 })
      }

      console.log(`📤 세션 시작: 시나리오=${scenarioId}, 사용자=${userId}`)

      const backendResponse = await fetch(`${backendUrl}/session/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
      })

      const text = await backendResponse.text()

      if (!backendResponse.ok) {
        console.error("❌ 세션 시작 실패:", text)
        return new Response(text || "세션 시작에 실패했습니다", { 
          status: backendResponse.status 
        })
      }

      try {
        const json = JSON.parse(text)
        console.log("✅ 세션 시작 성공:", json)
        return new Response(JSON.stringify(json), {
          status: backendResponse.status,
          headers: { "Content-Type": "application/json" }
        })
      } catch {
        console.log("✅ 세션 시작 성공 (텍스트 응답):", text)
        return new Response(text, { 
          status: backendResponse.status,
          headers: { "Content-Type": "text/plain" }
        })
      }

    } catch (err) {
      console.error("❌ 세션 시작 요청 실패:", err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      return new Response(`세션 시작 중 오류가 발생했습니다: ${errorMessage}`, { status: 502 })
    }
  }

  // ✅ 기존 파일 업로드 코드 (의심 통화용)
  try {
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
    const maxSize = 50 * 1024 * 1024
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

    const text = await backendResponse.text()

    if (!backendResponse.ok) {
      console.error("❌ 백엔드 업로드 실패:", text)
      return new Response(text || "파일 업로드에 실패했습니다", { 
        status: backendResponse.status 
      })
    }

    try {
      const json = JSON.parse(text)
      console.log("✅ 의심 통화 업로드 성공:", json)
      return new Response(JSON.stringify(json), {
        status: backendResponse.status,
        headers: { "Content-Type": "application/json" }
      })
    } catch {
      console.log("✅ 의심 통화 업로드 성공 (텍스트 응답):", text)
      return new Response(text, { 
        status: backendResponse.status,
        headers: { "Content-Type": "text/plain" }
      })
    }

  } catch (err) {
    console.error("❌ 의심 통화 업로드 요청 실패:", err)
    
    const errorMessage = err instanceof Error ? err.message : String(err)
    
    if (err instanceof TypeError && errorMessage.includes('fetch')) {
      return new Response("백엔드 서버에 연결할 수 없습니다", { status: 502 })
    }
    
    return new Response(`파일 업로드 중 오류가 발생했습니다: ${errorMessage}`, { status: 502 })
  }
}

// ✅ OPTIONS 메서드 처리 (CORS)
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