# VoiceGuard - 통합 시스템

두 개의 독립적인 시스템을 상위 레벨에서 연결한 통합 시스템입니다.

## 🚀 시스템 구성

### 1. Voice_Of_Inha_Backend (기존 시스템)
- **기능**: DB 관리 + 기본 API
- **경로**: `/api/*`, `/ws/analysis`
- **특징**: 원본 로직 그대로 유지

### 2. voice-guard (AI 시스템)
- **기능**: STT + AI 분석
- **경로**: `/voice-guard/*`
- **특징**: 원본 로직 그대로 유지

## 📁 프로젝트 구조

```
voice-guard-merged/
├── app/
│   ├── main.py              # 메인 앱 (상위 연결)
│   ├── config.py            # 설정 (Voice_Of_Inha_Backend)
│   ├── db.py                # DB 연결 (Voice_Of_Inha_Backend)
│   ├── models/              # DB 모델 (Voice_Of_Inha_Backend)
│   ├── routers/             # 라우터들
│   │   ├── call_logs.py     # 통화 로그 (Voice_Of_Inha_Backend)
│   │   ├── uploads.py       # 파일 업로드 (Voice_Of_Inha_Backend)
│   │   ├── realtime.py      # 실시간 분석 (Voice_Of_Inha_Backend)
│   │   └── voice_guard.py   # AI 시스템 (voice-guard)
│   ├── schemas/             # 스키마 (Voice_Of_Inha_Backend)
│   ├── services/            # 서비스 (Voice_Of_Inha_Backend)
│   ├── utils/               # 유틸리티 (Voice_Of_Inha_Backend)
│   └── ai/                  # AI 모듈 (voice-guard)
│       ├── stt_service.py   # STT 서비스
│       ├── rule_filter.py   # 룰 필터
│       └── risk_analyzer.py # 위험도 분석
├── keys/                    # GCP 키 파일
├── static/                  # 정적 파일
├── requirements.txt         # 통합 의존성
├── env.example             # 환경변수 예제
└── README.md               # 프로젝트 문서
```

## 🛠️ 설치 및 실행

### 1. 의존성 설치
```bash
pip install -r requirements.txt
```

### 2. 환경변수 설정
```bash
cp env.example .env
# .env 파일을 편집하여 실제 값으로 설정
```

### 3. 서비스 실행
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 📡 API 엔드포인트

### Voice_Of_Inha_Backend (기존 시스템)
- `GET /api/calls` - 통화 로그 목록
- `POST /api/calls` - 통화 로그 생성
- `GET /api/calls/{id}` - 통화 로그 상세
- `POST /api/uploads/presign` - S3 업로드 URL 생성
- `WS /ws/analysis` - 실시간 분석 (데모)

### voice-guard (AI 시스템)
- `GET /voice-guard/` - AI 테스트 페이지
- `GET /voice-guard/health` - AI 헬스체크
- `GET /voice-guard/diag/creds` - AI 자격증명 진단
- `GET /voice-guard/diag/stt` - STT 진단
- `GET /voice-guard/diag/vertex` - Vertex AI 진단
- `WS /voice-guard/ws/stt` - AI 실시간 분석

### 통합 정보
- `GET /` - 메인 페이지
- `GET /health` - 전체 시스템 헬스체크
- `GET /systems` - 시스템 정보

## 🔧 설정 항목

### 필수 설정
- **Database**: MySQL 연결 정보
- **Google Cloud**: STT 및 Vertex AI 자격증명
- **AWS S3**: 오디오 파일 저장용

### 선택 설정
- **Security**: 전화번호 해시화용 솔트
- **CORS**: 프론트엔드 도메인 허용

## 🎯 특징

- ✅ **독립성**: 각 시스템의 로직은 전혀 수정하지 않음
- ✅ **연결성**: 상위 레벨에서만 연결
- ✅ **호환성**: 기존 API와 100% 호환
- ✅ **확장성**: 새로운 시스템 추가 용이

## 🧪 테스트

- **기존 시스템**: `http://localhost:8000/api/calls`
- **AI 시스템**: `http://localhost:8000/voice-guard/`
- **통합 정보**: `http://localhost:8000/systems`

## 📝 라이선스

이 프로젝트는 교육 및 연구 목적으로 개발되었습니다.
