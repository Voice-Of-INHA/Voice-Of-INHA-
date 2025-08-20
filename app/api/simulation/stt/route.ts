import { NextRequest, NextResponse } from 'next/server'

// 메모리에 임시로 저장 (실제로는 데이터베이스 사용 권장)
let storedResponses: { [key: string]: string } = {}

export async function POST(request: NextRequest) {
  try {
    console.log('=== STT POST 요청 시작 ===');
    const formData = await request.formData()
    const audioFile = formData.get('audio_file') as File
    const round = formData.get('round') as string

    console.log('받은 데이터:', { round, audioFile: audioFile?.name, audioFileSize: audioFile?.size });

    if (!audioFile) {
      console.log('오디오 파일 누락');
      return NextResponse.json(
        { error: '오디오 파일이 필요합니다.' },
        { status: 400 }
      )
    }

    if (!round) {
      console.log('라운드 정보 누락');
      return NextResponse.json(
        { error: '라운드 정보가 필요합니다.' },
        { status: 400 }
      )
    }

    console.log(`라운드 ${round} STT 요청 처리 중...`)
    console.log('파일 정보:', {
      name: audioFile.name,
      size: audioFile.size,
      type: audioFile.type
    })

    // 실제 STT 처리 시뮬레이션 (실제로는 여기서 STT 서비스 호출)
    // 예시: OpenAI Whisper, Google Speech-to-Text, Azure Speech Services 등
    
    // 더미 응답 생성 (실제 구현 시 실제 STT 결과로 교체)
    const dummyResponses = [
      "안녕하세요, 잘못 걸린 것 같은데요.",
      "저는 그런 서비스를 신청한 적이 없어요.",
      "개인정보는 알려드릴 수 없습니다.",
      "확인이 필요하다면 공식 사이트에서 확인하겠습니다.",
      "이런 전화는 사기 같은데요. 끊겠습니다."
    ]
    
    const transcription = dummyResponses[Math.floor(Math.random() * dummyResponses.length)]

    // 응답을 메모리에 저장
    storedResponses[round] = transcription

    console.log(`라운드 ${round} STT 완료:`, transcription)
    console.log('현재 저장된 응답들:', storedResponses)
    console.log('=== STT POST 요청 완료 ===')

    return NextResponse.json({
      success: true,
      transcript: transcription,  // transcription → transcript로 변경
      round: parseInt(round),
      file_info: {
        name: audioFile.name,
        size: audioFile.size,
        type: audioFile.type
      },
      message: 'STT 처리가 완료되었습니다.'
    })

  } catch (error) {
    console.error('STT 처리 오류:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'STT 처리 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('=== STT GET 요청 시작 ===');
    const { searchParams } = new URL(request.url)
    const round = searchParams.get('round')

    console.log('GET 요청 파라미터:', { round, url: request.url });
    console.log('현재 저장된 응답들:', storedResponses);

    if (round) {
      // 특정 라운드 응답 반환
      const transcript = storedResponses[round]
      if (transcript) {
        console.log(`라운드 ${round} transcript 조회 성공:`, transcript)
        console.log('=== STT GET 요청 완료 (특정 라운드) ===');
        return NextResponse.json({
          success: true,
          round: parseInt(round),
          transcript: transcript
        })
      } else {
        console.log(`라운드 ${round} transcript 없음`)
        console.log('=== STT GET 요청 완료 (transcript 없음) ===');
        return NextResponse.json(
          { 
            success: false,
            error: `라운드 ${round}의 응답을 찾을 수 없습니다.`,
            round: parseInt(round)
          },
          { status: 404 }
        )
      }
    } else {
      // 모든 라운드 응답 반환
      const allResponses = Object.keys(storedResponses).map(round => ({
        round: parseInt(round),
        transcript: storedResponses[round]
      })).sort((a, b) => a.round - b.round)

      console.log(`전체 응답 조회: ${allResponses.length}개`, allResponses)
      console.log('=== STT GET 요청 완료 (전체 응답) ===');

      return NextResponse.json({
        success: true,
        responses: allResponses,
        total: allResponses.length
      })
    }

  } catch (error) {
    console.error('응답 조회 오류:', error)
    return NextResponse.json(
      { 
        success: false,
        error: '응답 조회 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}