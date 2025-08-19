// /api/uploads/presign/route.ts (디버깅 강화 버전)
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  console.log("🔗 Presigned URL API 호출됨")
  
  try {
    const requestBody = await req.json()
    const { fileName, contentType = "audio/mpeg" } = requestBody
    
    console.log("📥 요청 데이터:", { fileName, contentType })
    
    if (!fileName) {
      console.error("❌ fileName 파라미터 누락")
      return new Response("fileName 파라미터가 필요합니다", { status: 400 })
    }

    // Content-Type 검증 및 정규화
    const allowedContentTypes = [
      "audio/webm",
      "audio/mpeg",  // MP3
      "audio/mp4",   // M4A
      "audio/wav"
    ]
    
    const normalizedContentType = allowedContentTypes.includes(contentType) 
      ? contentType 
      : "audio/mpeg"  // 기본값
    
    console.log("🎵 정규화된 Content-Type:", normalizedContentType)

    const backendUrl = process.env.BACKEND_URL
    console.log("🔍 백엔드 URL:", backendUrl)
    
    if (!backendUrl) {
      console.error("❌ BACKEND_URL 환경변수 누락")
      return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
    }

    // 백엔드에 Presigned URL 요청
    const targetUrl = `${backendUrl}/api/uploads/presign`
    console.log(`📤 백엔드 요청 URL: ${targetUrl}`)
    
    const backendRequestData = {
      fileName: fileName,
      contentType: normalizedContentType
    }
    console.log("📤 백엔드 요청 데이터:", backendRequestData)
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(backendRequestData)
    })

    console.log("📥 백엔드 응답 상태:", response.status)
    console.log("📥 백엔드 응답 헤더:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ 백엔드 응답 실패:")
      console.error("- 상태:", response.status, response.statusText)
      console.error("- 본문:", errorText)
      console.error("- URL:", targetUrl)
      
      throw new Error(`백엔드 응답 실패: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("✅ 백엔드 응답 데이터:", data)
    
    // 응답 데이터 검증
    if (!data.uploadUrl && !data.presignedUrl) {
      console.error("❌ 백엔드 응답에 uploadUrl/presignedUrl 없음:", data)
      throw new Error("백엔드 응답에 업로드 URL이 없습니다")
    }
    
    if (!data.objectUrl && !data.fileUrl) {
      console.error("❌ 백엔드 응답에 objectUrl/fileUrl 없음:", data)
      throw new Error("백엔드 응답에 파일 URL이 없습니다")
    }
    
    // 백엔드 응답을 프론트엔드 형식에 맞춤
    const responseData = {
      presignedUrl: data.uploadUrl || data.presignedUrl,
      fileUrl: data.objectUrl || data.fileUrl
    }
    
    console.log("✅ 최종 응답 데이터:", responseData)
    
    return NextResponse.json(responseData)

  } catch (error) {
    console.error("❌ Presigned URL API 전체 오류:")
    console.error("- 오류:", error)
    console.error("- 스택:", error instanceof Error ? error.stack : 'No stack trace')
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // 오류 타입별 상세 메시지
    if (error instanceof TypeError) {
      console.error("⚠️ 네트워크 오류 또는 백엔드 연결 실패")
      return new Response(`백엔드 연결 실패: ${errorMessage}`, { status: 502 })
    }
    
    return new Response(`Presigned URL 요청 실패: ${errorMessage}`, { status: 500 })
  }
}