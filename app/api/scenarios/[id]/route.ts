import { NextRequest, NextResponse } from 'next/server'

interface Round {
  round: number
  question: string
  audio_url: string
}

interface Scenario {
  id: number
  title: string
  rounds: Round[]
  guideline: string
}

// 실제 데이터 (사용자가 제공한 JSON 기반)
const mockScenarios: Record<string, Scenario> = {
  "1": {
    id: 1,
    title: "검찰/경찰 사칭",
    rounds: [
      {
        round: 1,
        question: "안녕하세요. 서울 지방 검찰청 김종의 수사관입니다. 현재 본인 명의로 대포통장이 개설되어 연락드렸습니다. 김종의씨 맞으신가요?",
        audio_url: "https://voiceofinha-dev-bucket.s3.ap-northeast-2.amazonaws.com/scenario/%E1%84%80%E1%85%A5%E1%86%B7%E1%84%8E%E1%85%A1%E1%86%AF%E1%84%8E%E1%85%A5%E1%86%BC1.mp3"
      },
      {
        round: 2,
        question: "예, 지금 본인 명의로 된 대포통장이 발견되었으니, 빨리 조취를 취해야 합니다…",
        audio_url: "https://voiceofinha-dev-bucket.s3.ap-northeast-2.amazonaws.com/scenario/%E1%84%80%E1%85%A5%E1%86%B7%E1%84%8E%E1%85%A1%E1%86%AF%E1%84%8E%E1%85%A5%E1%86%BC2.mp3"
      },
      {
        round: 3,
        question: "지금 저희 검찰청 홈페이지에 들어가셔서 이름과 주민번호를 입력하면…",
        audio_url: "https://voiceofinha-dev-bucket.s3.ap-northeast-2.amazonaws.com/scenario/%E1%84%80%E1%85%A5%E1%86%B7%E1%84%8E%E1%85%A1%E1%86%AF%E1%84%8E%E1%85%A5%E1%86%BC3.mp3"
      }
    ],
    guideline: "경찰서에서는 대포통장 관련 전화를 걸지 않습니다. \n보이스피싱 범죄의 전형적인 수법 중 하나가 \"자신을 경찰, 검찰이라고 사칭하며 대포통장과 관련된 전화를 거는 것\"입니다. \n만약 경찰서나 검찰청이라고 속이는 전화를 받았다면, 해당 기관의 공식 전화번호로 직접 전화하여 사실 여부를 확인해야 합니다.\n"
  }
}

// 개별 시나리오 데이터를 반환하는 GET 엔드포인트
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log(`📋 시나리오 데이터 조회 요청: ID ${id}`)
    
    // 실제 구현에서는 데이터베이스에서 해당 ID의 시나리오를 조회
    // const scenario = await getScenarioById(id)
    
    // 임시로 목업 데이터에서 조회
    const scenario = mockScenarios[id]
    
    if (!scenario) {
      console.log(`❌ ID ${id}에 해당하는 시나리오를 찾을 수 없습니다.`)
      return NextResponse.json(
        { 
          ok: false, 
          status: "NOT_FOUND", 
          message: "해당 ID의 시나리오를 찾을 수 없습니다.",
          data: null
        },
        { status: 404 }
      )
    }
    
    console.log(`✅ ID ${id} 시나리오 데이터 조회 성공`)
    
    return NextResponse.json({
      ok: true,
      status: "SUCCESS",
      data: scenario
    })
    
  } catch (error) {
    console.error('❌ API 에러:', error)
    
    return NextResponse.json(
      { 
        ok: false, 
        status: "ERROR", 
        message: "서버 에러가 발생했습니다.",
        data: null
      },
      { status: 500 }
    )
  }
}
