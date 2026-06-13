from functools import lru_cache

from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from utils.langchain_model.llm_factory import LLMFactory


@lru_cache
def get_singleton_client(
    llm_provider: str = "bailing",
) -> ChatOpenAI | ChatOllama | ChatNVIDIA:
    """获取 LLM 实例（单例）.

    Args:
        llm_provider: LLM 提供者标识，如 "ollama"、"openai"、"bailing"、"nvidia" 等
            （具体支持列表见 LLMFactory）

    Returns:
        LLM 客户端实例
    """
    return LLMFactory(provider=llm_provider).get_client()
