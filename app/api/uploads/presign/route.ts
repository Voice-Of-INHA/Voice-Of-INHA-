import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { fileName, contentType = "audio/webm" } = await req.json()
  
  console.log("📤 Presigned URL 요청 받음:", { fileName, contentType })
  
  if (!fileName) {
    console.error("❌ fileName 파라미터 누락")
    return new Response("fileName 파라미터가 필요합니다", { status: 400 })
  }

  const backendUrl = process.env.BACKEND_URL
  console.log("🔍 백엔드 URL:", backendUrl)
  
  if (!backendUrl) {
    console.error("❌ BACKEND_URL 환경변수 누락")
    return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
  }

  try {
    const targetUrl = `${backendUrl}/api/uploads/presign?contentType=${contentType}`
    console.log(`📤 백엔드에 Presigned URL 요청: ${targetUrl}`)
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    })

    console.log("📥 백엔드 응답 상태:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ 백엔드 응답 실패:", response.status, errorText)
      throw new Error(`백엔드 응답 실패: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("✅ Presigned URL 발급 성공:", data)
    
    // 백엔드 응답을 프론트엔드 형식에 맞춤
    return NextResponse.json({
      presignedUrl: data.uploadUrl,
      fileUrl: data.objectUrl
    })

  } catch (error) {
    console.error("❌ Presigned URL 요청 실패:", error)
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(`Presigned URL 요청 실패: ${errorMessage}`, { status: 502 })
  }
}