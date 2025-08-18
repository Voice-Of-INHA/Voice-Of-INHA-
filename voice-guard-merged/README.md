# VoiceGuard - 통합 음성 사기 방지 시스템

실시간 음성 분석과 AI 기반 위험도 평가를 통한 전화 사기 방지 시스템입니다.

## 🚀 주요 기능

- **실시간 음성 인식**: Google Cloud Speech-to-Text를 통한 실시간 한국어 음성 인식
- **AI 위험도 분석**: Google Vertex AI를 통한 텍스트 위험도 분석
- **룰 기반 필터링**: 정규표현식을 통한 빠른 위험 신호 감지
- **통화 로그 관리**: MySQL 데이터베이스를 통한 통화 기록 저장
- **오디오 파일 저장**: AWS S3를 통한 오디오 파일 관리
- **WebSocket 실시간 통신**: 브라우저와의 실시간 양방향 통신

## 📁 프로젝트 구조

```
voice-guard-merged/
├── app/
│   ├── main.py              # 메인 FastAPI 앱
│   ├── config.py            # 설정 관리
│   ├── db.py                # 데이터베이스 연결
│   ├── models/              # SQLAlchemy 모델
│   │   └── call_log.py      # 통화 로그 모델
│   ├── routers/             # API 라우터
│   │   ├── call_logs.py     # 통화 로그 API
│   │   ├── uploads.py       # 파일 업로드 API
│   │   └── realtime.py      # 실시간 분석 API
│   ├── schemas/             # Pydantic 스키마
│   │   ├── call_log.py      # 통화 로그 스키마
│   │   └── common.py        # 공통 스키마
│   ├── services/            # 비즈니스 로직
│   │   └── call_log_service.py
│   ├── utils/               # 유틸리티
│   │   └── security.py      # 보안 관련 함수
│   └── ai/                  # AI 분석 모듈
│       ├── stt_service.py   # Google STT 서비스
│       ├── risk_analyzer.py # 위험도 분석기
│       └── rule_filter.py   # 룰 기반 필터
├── keys/                    # GCP 키 파일
├── static/                  # 정적 파일
│   └── stt-test.html        # 테스트 페이지
├── requirements.txt         # Python 의존성
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

### 3. 데이터베이스 설정
- MySQL 데이터베이스 생성
- `.env` 파일의 `db_url` 설정

### 4. 서비스 실행
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 🔧 설정 항목

### 필수 설정
- **Database**: MySQL 연결 정보
- **Google Cloud**: STT 및 Vertex AI 자격증명
- **AWS S3**: 오디오 파일 저장용

### 선택 설정
- **Security**: 전화번호 해시화용 솔트
- **CORS**: 프론트엔드 도메인 허용

## 📡 API 엔드포인트

### REST API
- `GET /api/calls` - 통화 로그 목록
- `POST /api/calls` - 통화 로그 생성
- `GET /api/calls/{id}` - 통화 로그 상세
- `POST /api/uploads/presign` - S3 업로드 URL 생성

### WebSocket
- `WS /ws/stt` - 실시간 음성 분석
- `WS /ws/analysis` - 기존 분석 API (호환성)

### 기타
- `GET /` - 테스트 페이지
- `GET /health` - 헬스체크
- `GET /diag/creds` - 자격증명 진단

## 🎯 위험도 분석 기준

### 룰 기반 점수
- 협박/압박: +15점
- 금전요구: +12점
- 정부기관사칭: +10점
- 개인정보요구: +8점
- 원격제어유도: +8점
- 링크/앱설치유도: +5점

### 위험도 레벨
- **LOW**: 0-14점 (정상)
- **MID**: 15-29점 (주의)
- **HIGH**: 30점 이상 (의심)

## 🔒 보안 기능

- 전화번호 해시화 저장
- GCP 자격증명 자동 설정
- CORS 설정으로 도메인 제한
- 환경변수를 통한 민감정보 관리

## 🧪 테스트

브라우저에서 `http://localhost:8000` 접속하여 실시간 음성 분석 테스트를 할 수 있습니다.

## 📝 라이선스

이 프로젝트는 교육 및 연구 목적으로 개발되었습니다.
