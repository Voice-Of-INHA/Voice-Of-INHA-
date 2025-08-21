import { NextRequest, NextResponse } from 'next/server'

interface AnalysisData {
  id: number
  callId: number
  audioGcsUri: string
  transcript: string
  report: {
    advice: {
      items: string[]
      title: string
    }
    reasons: Array<{
      type: string
      basis: string
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
  "5": {
    id: 5,
    callId: 19,
    audioGcsUri: "gs://voiceofinha-s3-to-gcs/calls/19/987ea215-261b-4598-8f2d-da31ae87d8c3",
    transcript: "[T=00:00.0][SCAMMER] 통장 비밀번호 부탁드립니다 부탁드립니다. 예정으로 결정입니다. 또 다시 해야 되겠다. 근데 자기 안 맞아서 안 받아서 그냥 있을 수 있음.\n[T=00:00.0][USER] 통장 비밀번호 부탁드립니다 부탁드립니다. 예정으로 결정입니다. 또 다시 해야 되겠다. 근데 자기 안 맞아서 안 받아서 그냥 있을 수 있음.",
    report: {
      advice: {
        items: [
          "즉시 통화 종료: 더 이상 대화하지 말고 전화를 끊으세요.",
          "절대 정보 제공 금지: 비밀번호, OTP, 신분증 등 어떠한 개인/금융 정보도 제공하지 마세요.",
          "발신 번호 차단: 해당 번호를 즉시 차단하여 추가 연락을 막으세요.",
          "은행 및 금융감독원(1332) 신고: 통화 사실을 즉시 본인 거래 은행과 금융감독원에 신고하여 피해를 예방하세요.",
          "주변에 알리기: 가족, 지인에게 해당 내용을 공유하여 유사 피해를 방지하세요."
        ],
        title: "즉각 조치 체크리스트"
      },
      reasons: [
        {
          type: "계좌이체 유도",
          basis: "사기범이 계좌에 직접 접근하여 자금을 탈취할 목적으로 핵심 금융 정보인 '통장 비밀번호'를 명시적으로 요구하고 있습니다. 이는 무단 계좌 이체의 명백한 준비 단계입니다. (인용: \"통장 비밀번호 부탁드립니다 부탁드립니다.\")"
        }
      ],
      summary: "사기범이 다짜고짜 통장 비밀번호를 직접적으로 요구하는 전형적인 금융 정보 탈취형 보이스피싱입니다.",
      safe_alt: "정상적인 금융기관이나 공공기관은 절대 전화로 고객의 통장 비밀번호와 같은 민감한 금융 정보를 직접 묻지 않습니다. 정보 확인이나 변경이 필요할 경우, 공식 앱(App)이나 웹사이트를 통한 본인인증 절차를 안내하거나 고객이 직접 대표번호로 연락하도록 요청합니다. 이처럼 다짜고짜 개인정보를 요구하는 경우는 100% 보이스피싱입니다.",
      timeline: [
        {
          t: "00:00.0",
          event: "금융 정보 요구",
          quote: "통장 비밀번호 부탁드립니다"
        },
        {
          t: "00:00.0",
          event: "요청 강조",
          quote: "부탁드립니다 부탁드립니다."
        },
        {
          t: "00:00.0",
          event: "정해진 절차 암시",
          quote: "예정으로 결정입니다."
        },
        {
          t: "00:00.0",
          event: "재촉 및 혼란 유발",
          quote: "또 다시 해야 되겠다."
        },
        {
          t: "00:00.0",
          event: "비논리적 설명",
          quote: "근데 자기 안 맞아서 안 받아서 그냥 있을 수 있음."
        }
      ],
      red_flags: [
        {
          name: "비밀번호 직접 요구",
          quote: "통장 비밀번호 부탁드립니다",
          explanation: "어떤 금융기관이나 공공기관도 전화상으로 개인의 통장 비밀번호를 직접적으로 묻지 않습니다. 이는 보이스피싱의 가장 결정적인 증거입니다."
        },
        {
          name: "불필요한 반복 및 심리적 압박",
          quote: "부탁드립니다 부탁드립니다",
          explanation: "같은 단어를 반복하여 상황의 중요성을 과장하고 피해자가 심리적 압박을 느껴 정상적인 판단을 하지 못하도록 유도합니다."
        },
        {
          name: "맥락 없는 일방적 통보",
          quote: "예정으로 결정입니다.",
          explanation: "아무런 사전 설명 없이 '결정되었다'고 통보하여, 피해자가 정상적인 절차의 일부라고 착각하게 만들려는 의도가 보입니다."
        },
        {
          name: "어눌하고 비논리적인 문장",
          quote: "근데 자기 안 맞아서 안 받아서 그냥 있을 수 있음.",
          explanation: "문법에 맞지 않고 의미가 불분명한 말로 피해자를 혼란스럽게 만들어 이성적인 사고를 방해하려는 전형적인 수법입니다."
        },
        {
          name: "상황 재촉 및 불안감 조성",
          quote: "또 다시 해야 되겠다.",
          explanation: "무언가 잘못되어 다시 처리해야 한다는 뉘앙스를 풍겨, 피해자가 절차를 신속히 따르지 않으면 불이익이 있을 것이라는 불안감을 조성합니다."
        }
      ],
      risk_level: "HIGH",
      risk_score: 95,
      crime_types: ["계좌이체 유도"]
    },
    summary: "사기범이 다짜고짜 통장 비밀번호를 직접적으로 요구하는 전형적인 금융 정보 탈취형 보이스피싱입니다.",
    crimeType: "계좌이체 유도",
    status: "DONE",
    triggeredAt: "2025-08-20T23:01:31",
    completedAt: "2025-08-20T23:02:21",
    error: null
  },
  "19": {
    id: 19,
    callId: 19,
    audioGcsUri: "gs://voiceofinha-s3-to-gcs/calls/19/987ea215-261b-4598-8f2d-da31ae87d8c3",
    transcript: "[T=00:00.0][SCAMMER] 통장 비밀번호 부탁드립니다 부탁드립니다. 예정으로 결정입니다. 또 다시 해야 되겠다. 근데 자기 안 맞아서 안 받아서 그냥 있을 수 있음.\n[T=00:00.0][USER] 통장 비밀번호 부탁드립니다 부탁드립니다. 예정으로 결정입니다. 또 다시 해야 되겠다. 근데 자기 안 맞아서 안 받아서 그냥 있을 수 있음.",
    report: {
      advice: {
        title: "즉각 조치 체크리스트",
        items: [
          "즉시 통화 종료: 더 이상 대화하지 말고 전화를 끊으세요.",
          "절대 정보 제공 금지: 비밀번호, OTP, 신분증 등 어떠한 개인/금융 정보도 제공하지 마세요.",
          "발신 번호 차단: 해당 번호를 즉시 차단하여 추가 연락을 막으세요.",
          "은행 및 금융감독원(1332) 신고: 통화 사실을 즉시 본인 거래 은행과 금융감독원에 신고하여 피해를 예방하세요.",
          "주변에 알리기: 가족, 지인에게 해당 내용을 공유하여 유사 피해를 방지하세요."
        ]
      },
      reasons: [
        {
          type: "계좌이체 유도",
          basis: "사기범이 계좌에 직접 접근하여 자금을 탈취할 목적으로 핵심 금융 정보인 '통장 비밀번호'를 명시적으로 요구하고 있습니다. 이는 무단 계좌 이체의 명백한 준비 단계입니다."
        }
      ],
      summary: "사기범이 다짜고짜 통장 비밀번호를 직접적으로 요구하는 전형적인 금융 정보 탈취형 보이스피싱입니다.",
      safe_alt: "정상적인 금융기관이나 공공기관은 절대 전화로 고객의 통장 비밀번호와 같은 민감한 금융 정보를 직접 묻지 않습니다.",
      timeline: [
        {
          t: "00:00.0",
          event: "금융 정보 요구",
          quote: "통장 비밀번호 부탁드립니다"
        },
        {
          t: "00:00.0",
          event: "요청 강조",
          quote: "부탁드립니다 부탁드립니다."
        }
      ],
      red_flags: [
        {
          name: "비밀번호 직접 요구",
          quote: "통장 비밀번호 부탁드립니다",
          explanation: "어떤 금융기관이나 공공기관도 전화상으로 개인의 통장 비밀번호를 직접적으로 묻지 않습니다."
        }
      ],
      risk_level: "HIGH",
      risk_score: 95,
      crime_types: ["계좌이체 유도"]
    },
    summary: "사기범이 다짜고짜 통장 비밀번호를 직접적으로 요구하는 전형적인 금융 정보 탈취형 보이스피싱입니다.",
    crimeType: "계좌이체 유도",
    status: "DONE",
    triggeredAt: "2025-08-20T23:01:31",
    completedAt: "2025-08-20T23:02:21",
    error: null
  }
}

// 전체 calls 목록을 반환하는 GET 엔드포인트
export async function GET(request: NextRequest) {
  try {
    console.log('📋 API 요청 받음: /api/calls (전체 목록)')
    
    // 실제 구현에서는 데이터베이스에서 전체 데이터를 조회
    // const allAnalysisData = await getAllAnalysisDataFromDB()
    
    // 임시로 목업 데이터를 배열로 변환하여 반환
    const allAnalysisData = Object.values(mockAnalysisData)
    
    console.log(`✅ 전체 calls 목록 조회 성공 (${allAnalysisData.length}개)`)
    
    return NextResponse.json({
      ok: true,
      status: "SUCCESS",
      data: allAnalysisData,
      count: allAnalysisData.length
    })
    
  } catch (error) {
    console.error('❌ API 에러:', error)
    
    return NextResponse.json(
      { 
        ok: false, 
        status: "ERROR", 
        message: "서버 에러가 발생했습니다.",
        data: null,
        count: 0
      },
      { status: 500 }
    )
  }
}