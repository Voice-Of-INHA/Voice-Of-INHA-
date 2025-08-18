# test_vertex_minimal.py
import os
from vertexai import init
from vertexai.generative_models import GenerativeModel

# 환경변수: GOOGLE_APPLICATION_CREDENTIALS 가 이미 설정되어 있다고 가정
PROJECT_ID = "YOUR_PROJECT_ID"
LOCATION   = "us-central1"  # 중요!

init(project=PROJECT_ID, location=LOCATION)

model = GenerativeModel("gemini-1.5-flash-002")
resp = model.generate_content("단답: 'OK' 라고만 출력해.")
print(resp.text)
