import { NextRequest, NextResponse } from 'next/server'

interface AnalysisData {
  id: number
  callId: number
  audioGcsUri: string
  transcript: string
  report: {
    advice: string[]
    reasons: Array<{
      type: string
      quote: string
    }>
    summary: string
    safe_alt: string
    timeline: Array<{
      t: string
      event: string
      quote: string
    }>
    red_flags: Array<{
      name: string
      quote: string
      explanation: string
    }>
    risk_level: string
    risk_score: number
    crime_types: string[]
  }
  summary: string
  crimeType: string
  status: string
  triggeredAt: string
  completedAt: string
  error: string | null
}

// 실제 데이터 (사용자가 제공한 JSON 기반)
const mockAnalysisData: Record<string, AnalysisData> = {
  "6": {
    id: 6,
    callId: 20,
    audioGcsUri: "gs://voiceofinha-s3-to-gcs/calls/20/7a33ee41-17b9-4d85-a4b6-bcddaf511f4f",
    transcript: "[T=00:00.0][SCAMMER] 안녕하세요 여기는 서울중앙지검 형사 고입니다 김지영 씨 맞으시죠 내가 왔는데 혹시 어떤 것 때문에 그러세요? 현재 본인 명의의 은행계좌가 범죄이용 개념으로써 중입니다. 전화 내용은 모두 녹음되고 있으며 진주시 형사처벌 대상입니다. 제가 어떤 거 아무것도 안 했는데 왜 그러세요? 본인명의 계좌로 불법 해외송금이 요건사실을 수 있기 때문에 현재 긴급조치가 필요합니다.\n[T=00:00.0][USER] 안녕하세요 여기는 서울중앙지검 형사 고입니다 김지영 씨 맞으시죠 내가 왔는데 혹시 어떤 것 때문에 그러세요? 현재 본인 명의의 은행계좌가 범죄이용 개념으로써 중입니다. 전화 내용은 모두 녹음되고 있으며 진주시 형사처벌 대상입니다. 제가 어떤 거 아무것도 안 했는데 왜 그러세요? 본인명의 계좌로 불법 해외송금이 요건사실을 수 있기 때문에 현재 긴급조치가 필요합니다.",
    report: {
      advice: [
        "즉시 전화를 끊으세요.",
        "발신 번호를 차단하고 절대 다시 통화하지 마세요.",
        "주변 사람에게 상황을 알리거나 경찰(112) 또는 금융감독원(1332)에 신고하여 사실 여부를 확인하세요.",
        "절대 상대방의 요구에 따라 개인정보, 금융정보를 알려주거나 자금을 이체하지 마세요.",
        "상대방이 보내는 문자 메시지의 링크를 클릭하거나 앱을 설치하지 마세요."
      ],
      reasons: [
        {
          type: "검찰사칭",
          quote: "안녕하세요 여기는 서울중앙지검 형사 고입니다"
        },
        {
          type: "협박/납치",
          quote: "전화 내용은 모두 녹음되고 있으며 진주시 형사처벌 대상입니다."
        }
      ],
      summary: "검찰을 사칭하여 계좌가 범죄에 연루되었다고 협박하며 긴급 조치를 요구하는 전형적인 보이스피싱입니다.",
      safe_alt: "실제 수사기관은 전화로 사건 수사를 진행하지 않으며, 개인의 금융 정보를 요구하거나 자금 이체를 지시하지 않습니다. 수사가 필요한 경우, 공식적인 절차에 따라 등기우편으로 출석요구서를 발송하거나 경찰관이 직접 방문합니다. 전화로 '범죄 연루', '안전 계좌', '자산 보호' 등을 언급하는 경우는 100% 보이스피싱입니다.",
      timeline: [
        {
          t: "00:00",
          event: "수사기관 사칭 및 신원 확인",
          quote: "안녕하세요 여기는 서울중앙지검 형사 고입니다 김지영 씨 맞으시죠"
        },
        {
          t: "00:05",
          event: "범죄 연루 통보",
          quote: "현재 본인 명의의 은행계좌가 범죄이용 개념으로써 중입니다."
        },
        {
          t: "00:08",
          event: "녹음 고지 및 심리적 압박",
          quote: "전화 내용은 모두 녹음되고 있으며"
        },
        {
          t: "00:10",
          event: "형사처벌 위협",
          quote: "진주시 형사처벌 대상입니다."
        },
        {
          t: "00:13",
          event: "구체적인 범죄 사실 언급",
          quote: "본인명의 계좌로 불법 해외송금이 요건사실을 수 있기 때문에"
        },
        {
          t: "00:16",
          event: "긴급 조치 요구",
          quote: "현재 긴급조치가 필요합니다."
        }
      ],
      red_flags: [
        {
          name: "수사기관 사칭",
          quote: "여기는 서울중앙지검 형사 고입니다",
          explanation: "수사기관은 전화로 사건을 통보하고 수사를 진행하지 않습니다. 이는 신뢰를 얻기 위한 전형적인 사칭 수법입니다."
        },
        {
          name: "다짜고짜 범죄 연루 통보",
          quote: "현재 본인 명의의 은행계좌가 범죄이용 개념으로써 중입니다.",
          explanation: "아무런 사전 고지 없이 전화로 본인 계좌가 범죄에 연루되었다고 알려 피해자를 당황하게 만듭니다."
        },
        {
          name: "형사처벌 위협",
          quote: "진주시 형사처벌 대상입니다.",
          explanation: "정상적인 법 절차를 무시하고 즉각적인 형사처벌을 언급하며 피해자를 심리적으로 압박하고 공포심을 유발합니다."
        },
        {
          name: "긴급성 강조",
          quote: "현재 긴급조치가 필요합니다.",
          explanation: "피해자가 상황을冷静하게 판단할 시간을 주지 않고, 즉각적인 조치가 필요하다고 재촉하여 비합리적인 결정을 유도합니다."
        },
        {
          name: "녹음 고지를 통한 신뢰 유도",
          quote: "전화 내용은 모두 녹음되고 있으며",
          explanation: "통화 내용이 녹음된다고 말하며 마치 공식적인 절차인 것처럼 위장하여 신뢰를 얻으려는 수법입니다."
        }
      ],
      risk_level: "HIGH",
      risk_score: 95,
      crime_types: ["검찰사칭", "협박/납치"]
    },
    summary: "검찰을 사칭하여 계좌가 범죄에 연루되었다고 협박하며 긴급 조치를 요구하는 전형적인 보이스피싱입니다.",
    crimeType: "검찰사칭",
    status: "DONE",
    triggeredAt: "2025-08-21T01:12:16",
    completedAt: "2025-08-21T01:13:11",
    error: null
  }
}

// 개별 통화 분석 데이터를 반환하는 GET 엔드포인트
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log(`📋 개별 통화 분석 데이터 조회 요청: ID ${id}`)
    
    // 실제 구현에서는 데이터베이스에서 해당 ID의 데이터를 조회
    // const analysisData = await getAnalysisDataById(id)
    
    // 임시로 목업 데이터에서 조회 (id 또는 callId로 검색)
    let analysisData: AnalysisData | undefined = mockAnalysisData[id]
    
    // id로 찾지 못한 경우 callId로 검색
    if (!analysisData) {
      analysisData = Object.values(mockAnalysisData).find(data => data.callId.toString() === id)
    }
    
    if (!analysisData) {
      console.log(`❌ ID ${id}에 해당하는 데이터를 찾을 수 없습니다.`)
      return NextResponse.json(
        { 
          ok: false, 
          status: "NOT_FOUND", 
          message: "해당 ID의 데이터를 찾을 수 없습니다.",
          data: null
        },
        { status: 404 }
      )
    }
    
    console.log(`✅ ID ${id} 통화 분석 데이터 조회 성공`)
    
    return NextResponse.json({
      ok: true,
      status: "SUCCESS",
      data: analysisData
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