"""Runtime settings loaded only from the environment."""

from functools import lru_cache
from typing import Literal

from cryptography.fernet import Fernet
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    rate_limit_backend: Literal["memory", "redis"] = "memory"
    bot_token: str = ""
    bot_username: str = "antiterror_robot"
    webapp_url: str = "http://localhost:5173"
    webhook_url: str = ""
    webhook_secret: str = ""
    encryption_key: str
    allow_dev_auth: bool = False
    admin_telegram_ids: str = ""
    cors_origins: str = "http://localhost:5173"
    storage_path: str = "./data/evidence"
    s3_endpoint: str = ""
    s3_bucket: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"
    data_retention_days: int = Field(default=180, ge=1, le=3650)
    emergency_retention_days: int = Field(default=30, ge=1, le=365)
    clamav_host: str = ""
    clamav_port: int = 3310
    rate_limit_reports: int = Field(default=5, ge=1)
    rate_limit_reports_window: int = Field(default=3600, ge=1)
    rate_limit_evidence: int = Field(default=20, ge=1)
    rate_limit_evidence_window: int = Field(default=3600, ge=1)
    rate_limit_reads: int = Field(default=60, ge=1)
    rate_limit_reads_window: int = Field(default=60, ge=1)
    init_data_max_age_seconds: int = Field(default=86400, ge=60, le=172800)

    @field_validator("bot_username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lstrip("@") or "antiterror_robot"

    @field_validator("admin_telegram_ids")
    @classmethod
    def validate_admins(cls, value: str) -> str:
        for part in value.split(","):
            item = part.strip()
            if item and not item.isdigit():
                raise ValueError("ADMIN_TELEGRAM_IDS must be a comma-separated list of positive integers")
        return value

    @field_validator("cors_origins")
    @classmethod
    def reject_wildcard_cors(cls, value: str) -> str:
        origins = [item.strip() for item in value.split(",") if item.strip()]
        if "*" in origins:
            raise ValueError("CORS_ORIGINS must list explicit origins")
        return value

    @property
    def admin_ids(self) -> frozenset[int]:
        return frozenset(int(part.strip()) for part in self.admin_telegram_ids.split(",") if part.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @model_validator(mode="after")
    def check_runtime_safety(self) -> "Settings":
        try:
            Fernet(self.encryption_key.encode("utf-8"))
        except Exception as exc:
            raise ValueError("ENCRYPTION_KEY must be a valid Fernet key") from exc
        if self.environment == "production":
            if self.allow_dev_auth:
                raise ValueError("ALLOW_DEV_AUTH must be disabled in production")
            if self.database_url.startswith("sqlite"):
                raise ValueError("Production database must be PostgreSQL")
            if not self.bot_token:
                raise ValueError("BOT_TOKEN is required in production")
            if not self.webapp_url.startswith("https://"):
                raise ValueError("WEBAPP_URL must use HTTPS in production")
            if self.webhook_url and not self.webhook_url.startswith("https://"):
                raise ValueError("WEBHOOK_URL must use HTTPS")
            if self.webhook_url and len(self.webhook_secret) < 16:
                raise ValueError("WEBHOOK_SECRET must be at least 16 characters when WEBHOOK_URL is set")
            if self.rate_limit_backend != "redis":
                raise ValueError("Production rate limiting must use Redis")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
