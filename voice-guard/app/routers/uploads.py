# app/routers/uploads.py
from fastapi import APIRouter, HTTPException, Body
import boto3, uuid
from botocore.config import Config
from pydantic import BaseModel
from ..config import settings

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# 요청 Body 스키마
class PresignRequest(BaseModel):
    fileName: str
    contentType: str

ALLOWED_TYPES = {"audio/webm", "audio/wav", "audio/mp4", "audio/mpeg"}

@router.post("/presign")
def create_presigned_url(body: PresignRequest = Body(...)):
    file_name = body.fileName
    content_type = body.contentType

    if settings.aws_region is None or settings.aws_s3_bucket is None:
        raise HTTPException(500, "S3 not configured")

    # "audio/webm;codecs=opus" → "audio/webm" 로 잘라 검사
    base_type = content_type.split(";")[0]
    if base_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"unsupported contentType: {content_type}")

    session = boto3.session.Session(
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )
    s3 = session.client("s3", config=Config(signature_version="s3v4"))

    key = f"records/{uuid.uuid4()}"
    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.aws_s3_bucket,
                "Key": key,
                "ContentType": content_type,  # ⚡ 프론트에서 준 그대로
            },
            ExpiresIn=300,
        )
        object_url = f"https://{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"
        return {
            "uploadUrl": url,
            "objectUrl": object_url,
            "key": key,
            "expiresIn": 300,
        }
    except Exception as e:
        raise HTTPException(500, f"presign failed: {e}")