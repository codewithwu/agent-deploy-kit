"""认证业务逻辑：纯函数，输入 session/redis，返领域结果或抛业务异常。

不依赖 FastAPI，便于单测。
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import security
from backend.auth.config import settings
from backend.auth.schemas import UserOut
from backend.models import User, UserRole

__all__ = [
    "UsernameTaken",
    "EmailTaken",
    "InvalidCredentials",
    "UserInactive",
    "LoginResult",
    "register",
    "login",
]


# --- 业务异常 ---


class UsernameTaken(Exception):
    """注册时 username 已被占用。"""


class EmailTaken(Exception):
    """注册时 email 已被占用。"""


class InvalidCredentials(Exception):
    """登录时用户名或密码错误（统一文案防枚举）。"""


class UserInactive(Exception):
    """登录时账号已停用。"""


# --- 领域结果 ---


@dataclass
class LoginResult:
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserOut


# --- 业务函数 ---


async def register(db: AsyncSession, username: str, email: str, password: str) -> User:
    """注册新用户。username/email 已存在抛 UsernameTaken/EmailTaken。"""
    user = User(
        username=username,
        email=email,
        hashed_password=security.hash_password(password),
        role="user",
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        # 区分 username / email 唯一冲突：按列名判定
        msg = str(exc.orig).lower()
        if "username" in msg:
            raise UsernameTaken(username) from exc
        if "email" in msg:
            raise EmailTaken(email) from exc
        raise  # 其他完整性错误透传

    db.add(UserRole(user_id=user.id, role="user"))
    await db.commit()
    await db.refresh(user)
    return user


async def login(db: AsyncSession, identifier: str, password: str) -> LoginResult:
    """登录：identifier 接受 username 或 email。

    查询不带 is_active 过滤，先做凭证校验再判断停用，避免把"账号停用"
    与"用户不存在"混为同一类错误（便于前端给出准确提示）。
    """
    user = (
        await db.execute(
            select(User).where(
                or_(User.username == identifier, User.email == identifier),
            )
        )
    ).scalar_one_or_none()

    if user is None or not security.verify_password(password, user.hashed_password):
        # 不区分"用户不存在"与"密码错"——统一抛 InvalidCredentials 防枚举
        raise InvalidCredentials()
    if not user.is_active:
        raise UserInactive()

    access_token = security.create_access_token(user.id)
    refresh_token, _ = security.create_refresh_token(user.id)

    return LoginResult(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=_to_user_out(user),
    )


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at or datetime.now(timezone.utc),
    )
