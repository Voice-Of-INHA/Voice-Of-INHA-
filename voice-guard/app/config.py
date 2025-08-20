# app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field

class Settings(BaseSettings):
    db_url: str
    phone_salt: str
    allowed_origins: str

    aws_region: str | None = None
    aws_s3_bucket: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None

    # --- Google Cloud ---
    gcp_project_id: str | None = None
    gcp_location: str | None = None
    google_application_credentials: str | None = None
    gcp_key_base64: str | None = None   # 있으면 main.py의 cloudtype 블록이 처리

    gcs_bucket: str | None = None       # GCS_BUCKET
    risk_threshold: int = 60            # RISK_THRESHOLD (기본 60)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,  # .env의 대/소문자 섞여도 OK
    )

    # 선택: 프론트 CORS 편하게 쓰도록 파싱된 리스트 제공
    @computed_field(return_type=list[str])
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

settings = Settings()
