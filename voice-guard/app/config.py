from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    db_url: str
    phone_salt: str
    allowed_origins: str

    aws_region: str | None = None
    aws_s3_bucket: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None

    # Google Cloud Settings
    gcp_project_id: str | None = None
    gcp_location: str | None = None
    google_application_credentials: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", case_sensitive=False)

settings = Settings()
