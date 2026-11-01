from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    enforce_https: bool = False
    allow_dev_auth: bool = False

    bot_token: str = ""
    bot_mode: str = "disabled"
    webhook_secret: str = ""
    public_api_url: str = ""
    webapp_url: str = ""

    database_url: str = "sqlite+aiosqlite:///./dev.db"
    redis_url: str = ""

    contact_encryption_key: str = ""
    log_hash_salt: str = "development-only-salt"

    s3_endpoint: str = ""
    s3_bucket: str = "antiterror-evidence"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    clamav_host: str = ""
    clamav_port: int = 3310

    pdf_font_path: str = ""
    retention_days: int = 90

    moderator_ids: str = ""
    admin_ids: str = ""

    cors_origins: str = "http://localhost:5173"
    init_data_max_age_seconds: int = 86400

    rate_limit_reports: int = 5
    rate_limit_evidence: int = 20
    rate_limit_reads: int = 60
    rate_limit_emergency: int = 10
    rate_limit_window_seconds: int = 3600
    read_window_seconds: int = 60

    max_image_bytes: int = 10 * 1024 * 1024
    max_video_bytes: int = 25 * 1024 * 1024
    max_audio_bytes: int = 15 * 1024 * 1024
    max_document_bytes: int = 5 * 1024 * 1024
    max_json_bytes: int = 64 * 1024

    log_level: str = "INFO"

    trusted_hosts: str = Field(default="")

    def origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    def id_set(self, raw: str) -> set[int]:
        values: set[int] = set()
        for item in raw.split(","):
            item = item.strip()
            if item.isdigit():
                values.add(int(item))
        return values

    @property
    def moderators(self) -> set[int]:
        return self.id_set(self.moderator_ids)

    @property
    def admins(self) -> set[int]:
        return self.id_set(self.admin_ids)


def assert_runtime_safe(settings: Settings) -> None:
    if settings.environment != "production":
        return
    problems: list[str] = []
    if settings.allow_dev_auth:
        problems.append("ALLOW_DEV_AUTH must be false in production")
    if not settings.bot_token:
        problems.append("BOT_TOKEN is required in production")
    if len(settings.contact_encryption_key) < 32:
        problems.append("CONTACT_ENCRYPTION_KEY must be at least 32 characters")
    if len(settings.log_hash_salt) < 16:
        problems.append("LOG_HASH_SALT must be at least 16 characters")
    if not settings.enforce_https:
        problems.append("ENFORCE_HTTPS must be true in production")
    if not settings.redis_url:
        problems.append("REDIS_URL is required in production")
    if not settings.s3_endpoint or not settings.s3_access_key or not settings.s3_secret_key:
        problems.append("S3 credentials are required in production")
    if "local-dev-only" in settings.database_url or "local-minio" in settings.s3_secret_key:
        problems.append("replace local-only credentials before production")
    if settings.bot_mode == "webhook" and len(settings.webhook_secret) < 16:
        problems.append("WEBHOOK_SECRET must be at least 16 characters")
    if settings.bot_mode == "webhook" and not settings.public_api_url.startswith("https://"):
        problems.append("PUBLIC_API_URL must be https in production")
    if problems:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
