// app/api/uploads/presign/route.ts
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  console.log("🔗 Presigned URL API 호출됨")
  
  try {
    const requestBody = await req.json()
    const { fileName, contentType } = requestBody
    
    console.log("📥 요청 데이터:", { fileName, contentType })
    
    if (!fileName || !contentType) {
      console.error("❌ fileName 또는 contentType 파라미터 누락")
      return new Response("fileName과 contentType 파라미터가 필요합니다", { status: 400 })
    }

    // Content-Type 검증 및 정규화 - 더 포괄적으로 수정
    const allowedContentTypes = [
      // WebM 형식들
      "audio/webm",
      "audio/webm;codecs=opus",
      "audio/webm;codecs=vorbis",
      
      // MP4 형식들  
      "audio/mp4",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4;codecs=aac",
      
      // 기타 형식들
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/ogg;codecs=opus"
    ]
    
    // 정확한 매칭 또는 시작 매칭 모두 허용
    const isValidContentType = allowedContentTypes.some(allowedType => 
      contentType === allowedType || contentType.startsWith(allowedType.split(';')[0])
    )
    
    if (!isValidContentType) {
      console.error("❌ 지원하지 않는 Content-Type:", contentType)
      console.log("✅ 지원하는 형식들:", allowedContentTypes)
      return new Response(`지원하지 않는 Content-Type입니다: ${contentType}`, { status: 400 })
    }

    // Content-Type 그대로 전달 (정규화하지 않음)
    console.log("🎵 사용할 Content-Type:", contentType)

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
      contentType: contentType // 원본 contentType 그대로 사용
    }
    console.log("📤 백엔드 요청 데이터:", backendRequestData)
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
    
    // 응답 데이터 검증 - 더 유연하게
    const uploadUrl = data.uploadUrl || data.presignedUrl || data.url
    const fileUrl = data.objectUrl || data.fileUrl || data.downloadUrl
    
    if (!uploadUrl) {
      console.error("❌ 백엔드 응답에 업로드 URL 없음:", data)
      throw new Error("백엔드 응답에 업로드 URL이 없습니다")
    }
    
    if (!fileUrl) {
      console.error("❌ 백엔드 응답에 파일 URL 없음:", data)
      throw new Error("백엔드 응답에 파일 URL이 없습니다")
    }
    
    // 백엔드 응답을 프론트엔드 형식에 맞춤
    const responseData = {
      presignedUrl: uploadUrl,
      fileUrl: fileUrl,
      originalContentType: contentType, // 원본 Content-Type도 함께 반환
      metadata: {
        fileName: fileName,
        contentType: contentType,
        uploadUrl: uploadUrl,
        fileUrl: fileUrl
      }
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
    
    if (errorMessage.includes('백엔드 응답 실패')) {
      return new Response(errorMessage, { status: 502 })
    }
    
    return new Response(`Presigned URL 요청 실패: ${errorMessage}`, { status: 500 })
  }
}