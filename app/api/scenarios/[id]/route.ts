import { NextRequest, NextResponse } from 'next/server';

// 인터페이스 정의
interface Round {
  round: number;
  question: string;
  audio_url: string;
}

interface Scenario {
  id: number;
  title: string;
  rounds: Round[];
  guideline: string;
}

// 더미 시나리오 데이터
const DUMMY_SCENARIOS: Record<string, Scenario> = {
  '1': {
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
  },
  '2': {
    id: 2,
    title: "은행 직원 사칭",
    rounds: [
      {
        round: 1,
        question: "안녕하세요. OO은행 보안팀 김과장입니다. 고객님의 계좌에서 의심스러운 거래가 감지되어 연락드렸습니다.",
        audio_url: "https://example.com/bank1.mp3"
      },
      {
        round: 2,
        question: "지금 즉시 본인 확인을 위해 카드번호와 비밀번호를 말씀해주시겠습니까?",
        audio_url: "https://example.com/bank2.mp3"
      }
    ],
    guideline: "은행에서는 전화로 카드번호나 비밀번호를 묻지 않습니다. \n의심스러운 거래가 있다면 직접 은행에 방문하거나 공식 고객센터로 연락하세요."
  },
  '3': {
    id: 3,
    title: "택배 사칭",
    rounds: [
      {
        round: 1,
        question: "안녕하세요. CJ대한통운입니다. 고객님 택배가 배송 중인데 주소가 잘못되어 추가 요금이 발생했습니다.",
        audio_url: "https://example.com/delivery1.mp3"
      },
      {
        round: 2,
        question: "지금 휴대폰으로 문자 링크를 보내드릴테니 클릭해서 결제해주세요.",
        audio_url: "https://example.com/delivery2.mp3"
      }
    ],
    guideline: "택배회사에서는 추가 요금을 문자 링크로 결제하게 하지 않습니다. \n의심스러운 링크는 절대 클릭하지 마세요."
  }
};

// GET /api/scenarios/[id] - 특정 시나리오 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`[API] 시나리오 조회 요청: ID=${params.id}`);

    // ID 유효성 검사
    if (!params.id) {
      console.log('[API] 시나리오 ID가 제공되지 않음');
      return NextResponse.json(
        { success: false, error: '시나리오 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 시나리오 조회
    const scenario = DUMMY_SCENARIOS[params.id];
    
    if (!scenario) {
      console.log(`[API] 시나리오를 찾을 수 없음: ID=${params.id}`);
      return NextResponse.json(
        { success: false, error: '시나리오를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`[API] 시나리오 조회 성공: ${scenario.title}`);
    
    // 성공 응답
    return NextResponse.json({
      success: true,
      scenario: scenario
    });

  } catch (error) {
    console.error('[API] 시나리오 조회 중 오류:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: '서버 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      },
      { status: 500 }
    );
  }
}

// PUT /api/scenarios/[id] - 시나리오 업데이트 (필요시 구현)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`[API] 시나리오 업데이트 요청: ID=${params.id}`);

    // 현재는 더미 데이터이므로 업데이트 기능 비활성화
    return NextResponse.json(
      { success: false, error: '시나리오 업데이트는 현재 지원되지 않습니다.' },
      { status: 501 }
    );

  } catch (error) {
    console.error('[API] 시나리오 업데이트 중 오류:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: '서버 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/scenarios/[id] - 시나리오 삭제 (필요시 구현)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`[API] 시나리오 삭제 요청: ID=${params.id}`);

    // 현재는 더미 데이터이므로 삭제 기능 비활성화
    return NextResponse.json(
      { success: false, error: '시나리오 삭제는 현재 지원되지 않습니다.' },
      { status: 501 }
    );

  } catch (error) {
    console.error('[API] 시나리오 삭제 중 오류:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: '서버 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      },
      { status: 500 }
    );
  }
}