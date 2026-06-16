"""用户模型。"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class User(Base):
    """用户表。

    简单但可扩展的用户模型，后续可轻松添加 nickname、avatar、细粒度权限等。
    `role` 字段当前用枚举字符串，未来通过 user_roles 关联表支持一用户多角色。
    """

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'admin')",
            name="ck_users_role_valid",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class UserRole(Base):
    """用户-角色关联表（镜像 users.role 当前值；为多角色/细粒度权限留口子）。"""

    __tablename__ = "user_roles"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'admin')",
            name="ck_user_roles_role_valid",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
