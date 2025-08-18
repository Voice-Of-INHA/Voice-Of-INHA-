from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    db_url: str
    phone_salt: str = "dev_salt"
    allowed_origins: str = "http://localhost:5173"

    aws_region: str | None = None
    aws_s3_bucket: str | None = None
    aws_access_key_id: str | None = None        #
    aws_secret_access_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", case_sensitive=False)

settings = Settings()
