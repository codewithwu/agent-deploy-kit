from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """语义检索子包的环境配置。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # 必填：未设置时启动即报错（fail-fast），比原运行期崩更友好
    ollama_baseurl: str = Field(...)

    ollama_embedding_model_name: str = Field(default="bge-m3:latest")


settings = Settings()  # type: ignore[call-arg]  # mypy 看不到 pydantic-settings 通过 env_file 注入必填字段
