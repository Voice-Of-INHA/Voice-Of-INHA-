# app/services/gcs_transfer.py
import re
import boto3
from google.cloud import storage
from urllib.parse import urlparse

def parse_any_s3_url(url: str) -> tuple[str, str]:
    """
    지원:
      - s3://bucket/key
      - https://bucket.s3.ap-northeast-2.amazonaws.com/key
      - https://s3.ap-northeast-2.amazonaws.com/bucket/key
      - https://s3.amazonaws.com/bucket/key
    반환: (bucket, key)
    """
    p = urlparse(url)
    scheme = p.scheme.lower()

    # s3://bucket/key
    if scheme == "s3":
        return p.netloc, p.path.lstrip("/")

    # https://... 스타일
    if scheme in ("http", "https"):
        host = p.netloc
        path = p.path.lstrip("/")

        # 1) 가상 호스팅 스타일: bucket.s3.region.amazonaws.com
        m = re.match(r"^([^.]+)\.s3(?:\.[^.]+)?\.amazonaws\.com$", host)
        if m:
            bucket = m.group(1)
            key = path
            return bucket, key

        # 2) 경로 스타일: s3.region.amazonaws.com/bucket/key 또는 s3.amazonaws.com/bucket/key
        m2 = re.match(r"^s3(?:\.[^.]+)?\.amazonaws\.com$", host)
        if m2 and "/" in path:
            bucket, key = path.split("/", 1)
            return bucket, key

    raise ValueError(f"지원하지 않는 S3 URL 형식입니다: {url}")

def s3_to_gcs(src_url: str, gcs_bucket: str, gcs_key: str) -> str:
    """
    src_url: s3://... 또는 https://...amazonaws.com/... 모두 허용
    GCS에 스트리밍 업로드
    """
    s3_bucket, s3_key = parse_any_s3_url(src_url)

    s3 = boto3.client("s3")
    storage_client = storage.Client()
    bkt = storage_client.bucket(gcs_bucket)
    blob = bkt.blob(gcs_key)

    # S3에서 스트리밍으로 읽어와 GCS로 그대로 씀
    obj = s3.get_object(Bucket=s3_bucket, Key=s3_key)
    body = obj["Body"]  # StreamingBody

    with blob.open("wb") as f:
        for chunk in iter(lambda: body.read(8 * 1024 * 1024), b""):
            f.write(chunk)

    return f"gs://{gcs_bucket}/{gcs_key}"
