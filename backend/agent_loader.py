"""按 AGENT_NAME 环境变量从 agents/ 动态加载智能体实例。"""

import importlib
import os
from functools import lru_cache
from typing import Any

__all__: list[str] = ["get_agent"]

_AGENT_NAME_ENV = "AGENT_NAME"


@lru_cache(maxsize=1)
def get_agent() -> Any:
    name = os.environ.get(_AGENT_NAME_ENV)
    if not name:
        raise RuntimeError(f"{_AGENT_NAME_ENV} is not set")
    module = importlib.import_module(f"agents.{name}.agent")
    print(f"module {module}")
    instance = getattr(module, name, None)
    if instance is None:
        raise RuntimeError(f"agents.{name}.agent has no attribute {name!r}")
    return instance
