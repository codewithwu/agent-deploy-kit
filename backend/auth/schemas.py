"""认证子包 Pydantic 模型：请求/响应。"""

import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

# 用户名规则：3-50 字符，仅字母/数字/下划线/点/连字符
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.\-]{3,50}$")
# 密码规则：>=8 位，必须含字母+数字
_PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,128}$")


class RegisterIn(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def _username_format(cls, v: str) -> str:
        if not _USERNAME_RE.match(v):
            raise ValueError("用户名需 3-50 位，仅含字母/数字/下划线/点/连字符")
        return v

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError("密码需 8-128 位，且必须含字母和数字")
        return v


class LoginIn(BaseModel):
    """username 字段同时接受 username 或 email。"""

    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)


class ChangePasswordIn(BaseModel):
    old_password: str = Field(..., min_length=1, max_length=128)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError("密码需 8-128 位，且必须含字母和数字")
        return v


class DeleteMeIn(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)


class UserOut(BaseModel):
    """对外暴露的用户视图。密码相关字段一律不返回。"""

    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime


class RegisterOut(BaseModel):
    user_id: int
    username: str
    email: str
    role: str


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access token 剩余秒数


class LoginOut(TokenPairOut):
    user: UserOut


class VerifyOut(BaseModel):
    valid: bool
    user: UserOut
