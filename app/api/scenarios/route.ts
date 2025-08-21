import { NextRequest, NextResponse } from 'next/server';

// 인터페이스 정의
interface ScenarioSummary {
  id: number;
  title: string;
  description?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  rounds_count: number;
  duration_minutes?: number;
  category?: string;
}

// 시나리오 목록 더미 데이터
const SCENARIO_LIST: ScenarioSummary[] = [
  {
    id: 1,
    title: "검찰/경찰 사칭",
    description: "검찰청이나 경찰서 직원을 사칭하여 대포통장 관련 협조를 요청하는 시나리오",
    difficulty: 'medium',
    rounds_count: 3,
    duration_minutes: 5,
    category: "기관 사칭"
  },
  {
    id: 2,
    title: "은행 직원 사칭",
    description: "은행 보안팀을 사칭하여 개인정보를 요구하는 시나리오",
    difficulty: 'easy',
    rounds_count: 2,
    duration_minutes: 3,
    category: "금융 사칭"
  },
  {
    id: 3,
    title: "택배 사칭",
    description: "택배회사를 사칭하여 추가 요금 결제를 유도하는 시나리오",
    difficulty: 'easy',
    rounds_count: 2,
    duration_minutes: 3,
    category: "서비스 사칭"
  }
];

// GET /api/scenarios - 시나리오 목록 조회
export async function GET(request: NextRequest) {
  try {
    console.log('[API] 시나리오 목록 조회 요청');

    // URL 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty');
    const limit = searchParams.get('limit');

    let filteredScenarios = [...SCENARIO_LIST];

    // 카테고리 필터링
    if (category) {
      filteredScenarios = filteredScenarios.filter(s => 
        s.category?.toLowerCase().includes(category.toLowerCase())
      );
      console.log(`[API] 카테고리 필터 적용: ${category}`);
    }

    // 난이도 필터링
    if (difficulty) {
      filteredScenarios = filteredScenarios.filter(s => s.difficulty === difficulty);
      console.log(`[API] 난이도 필터 적용: ${difficulty}`);
    }

    // 개수 제한
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        filteredScenarios = filteredScenarios.slice(0, limitNum);
        console.log(`[API] 개수 제한 적용: ${limitNum}`);
      }
    }

    console.log(`[API] 시나리오 목록 조회 성공: ${filteredScenarios.length}개`);

    return NextResponse.json({
      success: true,
      scenarios: filteredScenarios,
      total: filteredScenarios.length,
      filters: {
        category: category || null,
        difficulty: difficulty || null,
        limit: limit ? parseInt(limit, 10) : null
      }
    });

  } catch (error) {
    console.error('[API] 시나리오 목록 조회 중 오류:', error);
    
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

// POST /api/scenarios - 새 시나리오 생성 (필요시 구현)
export async function POST(request: NextRequest) {
  try {
    console.log('[API] 새 시나리오 생성 요청');

    // 현재는 더미 데이터이므로 생성 기능 비활성화
    return NextResponse.json(
      { success: false, error: '시나리오 생성은 현재 지원되지 않습니다.' },
      { status: 501 }
    );

  } catch (error) {
    console.error('[API] 시나리오 생성 중 오류:', error);
    
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