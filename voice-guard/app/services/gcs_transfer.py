import boto3
from google.cloud import storage
from urllib.parse import urlparse

def parse_s3_url(s3_url: str) -> tuple[str, str]:
    p = urlparse(s3_url)
    if p.scheme != "s3":
        raise ValueError("s3://bucket/key 형식이어야 합니다.")
    return p.netloc, p.path.lstrip("/")

def s3_to_gcs(s3_url: str, gcs_bucket: str, gcs_key: str) -> str:
    s3_bucket, s3_key = parse_s3_url(s3_url)
    s3 = boto3.client("s3")
    storage_client = storage.Client()
    bkt = storage_client.bucket(gcs_bucket)
    blob = bkt.blob(gcs_key)

    obj = s3.get_object(Bucket=s3_bucket, Key=s3_key)
    body = obj["Body"]  # StreamingBody

    with blob.open("wb") as f:
        for chunk in iter(lambda: body.read(8 * 1024 * 1024), b""):
            f.write(chunk)

    return f"gs://{gcs_bucket}/{gcs_key}"
