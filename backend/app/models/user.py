"""Account row. Only the Telegram numeric id is stored, never the profile name."""

import enum
import uuid

from sqlalchemy import BigInteger, Enum, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, timestamp_column, utcnow


class UserRole(str, enum.Enum):
    user = "user"
    moderator = "moderator"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=False, length=32, values_callable=lambda items: [item.value for item in items]),
        default=UserRole.user,
    )
    created_at: Mapped[object] = mapped_column(timestamp_column(), default=utcnow)
    updated_at: Mapped[object] = mapped_column(timestamp_column(), default=utcnow)
