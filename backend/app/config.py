from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "TT Memory API"
    database_url: str
    jwt_secret: str
    jwt_expire_minutes: int = 60
    cors_origins: str = "http://localhost:8081"
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    r2_endpoint: str = ""
    r2_presign_expire_seconds: int = 900
    max_upload_bytes: int = 104857600

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
