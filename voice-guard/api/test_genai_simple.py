#!/usr/bin/env python3
"""
Google GenAI SDK 테스트 스크립트
"""

import os
from google import genai
from google.genai import types

def test_genai():
    print("🔍 Google GenAI 테스트 시작...")
    
    # 환경변수 설정
    project_id = "nice-script-469104-i1"
    location = "us-central1"
    
    print(f"프로젝트 ID: {project_id}")
    print(f"위치: {location}")
    
    try:
        # GenAI 클라이언트 생성
        client = genai.Client(vertexai=True, project=project_id, location=location)
        print("✅ GenAI 클라이언트 생성 성공")
        
        # 간단한 테스트 요청
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="안녕하세요. 간단히 'OK'라고만 답해주세요.",
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=50,
            ),
        )
        
        response_text = getattr(response, "text", "") or ""
        print(f"✅ GenAI 응답: {repr(response_text)}")
        
        # JSON 테스트
        json_response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="다음 JSON 형식으로만 답해주세요: {\"test\": \"ok\"}",
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=100,
            ),
        )
        
        json_text = getattr(json_response, "text", "") or ""
        print(f"✅ JSON 테스트 응답: {repr(json_text)}")
        
        return True
        
    except Exception as e:
        print(f"❌ GenAI 테스트 실패: {e}")
        import traceback
        print(f"상세 오류: {traceback.format_exc()}")
        return False

if __name__ == "__main__":
    success = test_genai()
    print(f"\n{'🎉 성공!' if success else '❌ 실패!'}")
