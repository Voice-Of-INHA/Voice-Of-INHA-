import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const fileName = searchParams.get("fileName")
  
  if (!fileName) {
    return new Response("fileName 파라미터가 필요합니다", { status: 400 })
  }

  const backendUrl = process.env.BACKEND_URL
  
  if (!backendUrl) {
    return new Response("백엔드 URL이 설정되지 않았습니다", { status: 500 })
  }

  try {
    console.log(`📤 백엔드에 Presigned URL 요청: ${fileName}`)
    
    const response = await fetch(`${backendUrl}/api/uploads/presign?fileName=${fileName}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`백엔드 응답 실패: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("✅ Presigned URL 발급 성공")
    
    return NextResponse.json(data)

  } catch (error) {
    console.error("❌ Presigned URL 요청 실패:", error)
    
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(`Presigned URL 요청 실패: ${errorMessage}`, { status: 502 })
  }
}