"""认证子包配置：pydantic-settings 读 env，缺失/类型错启动期崩。"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseSettings):
    """认证相关环境变量。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    jwt_secret: str = Field(..., min_length=16)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    redis_url: str = "redis://:158168@localhost:6379/0"
    login_rate_limit_per_min: int = 5


settings = AuthSettings()  # type: ignore[call-arg]  # 启动期校验：缺 JWT_SECRET 直接抛 ValidationError；jwt_secret 来自 env，mypy 静态看不知道
