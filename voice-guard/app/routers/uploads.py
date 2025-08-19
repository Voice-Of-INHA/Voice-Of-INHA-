# app/routers/uploads.py
from fastapi import APIRouter, HTTPException, Query
import boto3, uuid
from botocore.config import Config
from ..config import settings

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_TYPES = {"audio/webm", "audio/wav", "audio/mp4", "audio/mpeg"}

@router.post("/presign")
def create_presigned_url(contentType: str = Query("audio/webm")):
    if settings.aws_region is None or settings.aws_s3_bucket is None:
        raise HTTPException(500, "S3 not configured")
    if contentType not in ALLOWED_TYPES:
        raise HTTPException(400, f"unsupported contentType: {contentType}")

    # ✅ 명시적으로 자격증명 + 리전 지정
    session = boto3.session.Session(
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )
    s3 = session.client("s3", config=Config(signature_version="s3v4"))

    key = f"records/{uuid.uuid4()}"
    try:
        url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": settings.aws_s3_bucket,
                "Key": key,
                "ContentType": contentType,
            },
            ExpiresIn=300,
        )
        # 리전 엔드포인트 형태로 안내 (가독성)
        object_url = f"https://{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"
        return {"uploadUrl": url, "objectUrl": object_url, "key": key, "expiresIn": 300}
    except Exception as e:
        raise HTTPException(500, f"presign failed: {e}")
