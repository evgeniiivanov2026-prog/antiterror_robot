"""Runtime settings. Secrets come only from the environment."""

from functools import lru_cache
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _parse_id_list(raw: str) -> set[int]:
    values: set[int] = set()
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        if not item.isdigit():
            raise ValueError("Telegram id lists must contain only numbers")
        values.add(int(item))
    return values


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_name: str = "AntiTerror Robot"
    log_level: str = "INFO"
    force_https: bool = False
    trust_proxy: bool = False
    auto_create_db: bool = False

    database_url: str = "postgresql+asyncpg://antiterror:replace-with-local-password@localhost:5432/antiterror"
    redis_url: str = "redis://localhost:6379/0"

    bot_token: str = ""
    bot_username: str = "antiterror_robot"
    bot_display_name: str = "AntiTerror Robot"
    bot_webhook_secret: str = ""
    bot_mode: str = "polling"
    webapp_url: str = ""

    contact_encryption_key: str = ""
    moderator_telegram_ids: str = ""
    admin_telegram_ids: str = ""
    allow_dev_auth_bypass: bool = False

    s3_endpoint_url: str = ""
    s3_bucket: str = "antiterror-evidence"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"
    local_storage_path: str = "/tmp/antiterror-evidence"

    retention_days: int = 180
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60
    rate_limit_reports: int = 10
    rate_limit_reports_window_seconds: int = 3600
    max_files_per_report: int = 8

    clamav_host: str = ""
    clamav_port: int = 3310
    cors_origins: str = ""
    telegram_auth_max_age_seconds: int = Field(default=86400)

    @field_validator("app_env")
    @classmethod
    def _env_name(cls, value: str) -> str:
        allowed = {"development", "test", "production"}
        if value not in allowed:
            raise ValueError("APP_ENV must be development, test, or production")
        return value

    @field_validator("bot_mode")
    @classmethod
    def _bot_mode(cls, value: str) -> str:
        allowed = {"polling", "webhook", "disabled"}
        if value not in allowed:
            raise ValueError("BOT_MODE must be polling, webhook, or disabled")
        return value

    @field_validator("bot_username")
    @classmethod
    def _username(cls, value: str) -> str:
        cleaned = value.lstrip("@").strip()
        if not cleaned:
            raise ValueError("BOT_USERNAME is empty")
        return cleaned

    @model_validator(mode="after")
    def _production_guard(self) -> "Settings":
        if self.app_env != "production":
            return self
        if self.allow_dev_auth_bypass:
            raise ValueError("ALLOW_DEV_AUTH_BYPASS must be false in production")
        if not self.force_https:
            raise ValueError("FORCE_HTTPS must be true in production")
        if not self.contact_encryption_key:
            raise ValueError("CONTACT_ENCRYPTION_KEY is required in production")
        if "replace-with" in self.database_url or "change-me" in self.database_url:
            raise ValueError("DATABASE_URL still contains a placeholder")
        if self.bot_mode != "disabled" and not self.bot_token:
            raise ValueError("BOT_TOKEN is required when the bot is enabled")
        if self.bot_mode == "webhook" and not self.bot_webhook_secret:
            raise ValueError("BOT_WEBHOOK_SECRET is required in webhook mode")
        if self.webapp_url and not self.webapp_url.startswith("https://"):
            raise ValueError("WEBAPP_URL must use HTTPS")
        return self

    @property
    def admin_ids(self) -> set[int]:
        return _parse_id_list(self.admin_telegram_ids)

    @property
    def moderator_ids(self) -> set[int]:
        return _parse_id_list(self.moderator_telegram_ids)

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def s3_enabled(self) -> bool:
        return bool(self.s3_endpoint_url and self.s3_access_key and self.s3_secret_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
