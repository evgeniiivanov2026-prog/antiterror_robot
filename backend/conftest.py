"""Test environment must be in place before the application is imported."""

import os

from cryptography.fernet import Fernet

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["RATE_LIMIT_BACKEND"] = "memory"
os.environ["BOT_TOKEN"] = "123456789:TEST_token_value_for_hmac_only"
os.environ["BOT_USERNAME"] = "antiterror_robot"
os.environ["WEBAPP_URL"] = "https://localhost:8443"
os.environ["WEBHOOK_URL"] = ""
os.environ["WEBHOOK_SECRET"] = ""
os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["ALLOW_DEV_AUTH"] = "false"
os.environ["ADMIN_TELEGRAM_IDS"] = ""
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
os.environ["STORAGE_PATH"] = "./data/evidence-test"
os.environ["S3_ENDPOINT"] = ""
os.environ["S3_BUCKET"] = ""
os.environ["S3_ACCESS_KEY"] = ""
os.environ["S3_SECRET_KEY"] = ""
os.environ["DATA_RETENTION_DAYS"] = "180"
os.environ["EMERGENCY_RETENTION_DAYS"] = "30"
os.environ["CLAMAV_HOST"] = ""
