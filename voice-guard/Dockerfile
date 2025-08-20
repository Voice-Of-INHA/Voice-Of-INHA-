# 사용할 파이썬 이미지 (컨테이너의 기반 운영체제)를 지정합니다.
# 사용자의 에러 로그에 3.10 버전이 있었으므로 해당 버전을 사용합니다.
FROM python:3.10-slim

# apt-get을 업데이트하고 ffmpeg를 설치합니다.
# 이 명령어가 ffmpeg를 서버에 깔아주는 핵심 역할입니다.
RUN apt-get update && apt-get install -y ffmpeg

# 컨테이너 내부의 작업 디렉토리를 /app으로 설정합니다.
WORKDIR /app

# 로컬의 requirements.txt 파일을 컨테이너의 /app으로 복사합니다.
COPY requirements.txt .

# requirements.txt에 있는 파이썬 라이브러리들을 설치합니다.
RUN pip install --no-cache-dir -r requirements.txt

# 로컬의 모든 소스 코드(app 폴더 등)를 컨테이너로 복사합니다.
COPY . .

# 컨테이너가 시작될 때 실행할 명령어입니다.
# 클라우드타입이 이 명령어를 자동으로 실행해 앱을 띄웁니다.
# 배포 환경이므로 --reload 옵션은 제외하는 것이 좋습니다.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]