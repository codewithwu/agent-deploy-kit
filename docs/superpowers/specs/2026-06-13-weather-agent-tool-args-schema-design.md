# Weather Agent 工具 args_schema 化 设计

- 日期：2026-06-13
- 范围：将 `agents/weather_agent/tools.py` 中的 `get_weather` 迁移到 LangChain 推荐的 Pydantic `args_schema` 模式，仅改这一个文件。

## 背景与目标

参考 LangChain 工具的 Pydantic `args_schema` 设计方式，把 `get_weather` 从"裸函数"显式声明为带结构化 schema 的 `@tool`。目的是与 LangChain 1.x 推荐的显式 schema 风格保持一致，方便后续给 LLM 传更精确的参数描述、默认值与字段约束。

设计原则：
- 最小变更：函数体、参数名、返回值、对外行为全部不变（用户明确选择"只迁移模式，保持单一 city 参数"）。
- 不动 `agent.py` 与 `__init__.py`：`create_agent(tools=[get_weather])` 接受 `@tool` 装饰后的对象，导出符号名也不变。
- 不引入新参数（不照搬示例里的 `units` / `include_forecast`）。
- 质量门：ruff format / ruff check / mypy / pytest 全过。

## 目录与文件

仅修改一个文件：

```
agents/weather_agent/
└── tools.py                # 改写：增加 WeatherInput + @tool 装饰器
```

不改动：`agent.py`、`__init__.py`、仓库其他位置。

## 组件

### `agents/weather_agent/tools.py` 重写后

```python
"""天气智能体可用工具集合。"""

from langchain_core.tools import tool
from pydantic import BaseModel, Field


class WeatherInput(BaseModel):
    """天气查询输入参数。"""

    city: str = Field(description="城市名称")


@tool(args_schema=WeatherInput)
def get_weather(city: str) -> str:
    """获取指定城市的天气信息（占位实现）.

    Args:
        city: 城市名称

    Returns:
        天气描述字符串
    """
    return f"It's always sunny in {city}!"
```

变更要点：
- 新增 `WeatherInput(BaseModel)`，仅一个字段 `city: str`，`Field` 描述用中文。
- 用 `@tool(args_schema=WeatherInput)` 装饰原函数；导入用规范的 `langchain_core.tools.tool`（项目已安装 `langchain>=1.3.7`）。
- 函数体一行不变：`return f"It's always sunny in {city}!"`。
- 模块顶部的中文 docstring 保留。

### 兼容性

- `agent.py` 现状 `tools=[get_weather]`：`@tool` 装饰后的对象仍是合法的 LangChain 工具，`create_agent` 接受，无需改。
- `agents/weather_agent/__init__.py` 导出 `get_weather`：符号名未变，无需改。
- `agents/__init__.py` 顶层聚合：未直接引用此函数，无需改。
- 现有 `tests/` 不引用 `get_weather` 内部结构，行为不变，无需改。

## 验证标准

1. `uv run ruff format .` 无变更（或仅 `tools.py` 内部格式微调）。
2. `uv run ruff check --fix .` 全过。
3. `uv run mypy .` 全过（`pydantic.BaseModel` 字段已显式带类型注解）。
4. `uv run pytest` 全部测试通过（验证 `weather_agent` 装配未被打断）。
5. 手工烟测（可选，与既有 `tests/test_backend.py::test_chat_weather` 等价）：POST `/api/chat` 问 "What's the weather in Tokyo?" → 200 且 `reply` 包含 "Tokyo"。

## 范围外（明确不做）

- 不引入 `units` / `include_forecast` 等新参数。
- 不把 `Field` 描述挪到函数 docstring（保持 Pydantic schema 显式声明）。
- 不改 `agent.py` 的 `system_prompt`、模型选择或工具列表。
- 不改 `pyproject.toml`、不引入新依赖（`pydantic` 已由 `langchain` 间接依赖）。
- 不写新的单元测试：函数行为未变，依赖既有 `test_backend.py` 端到端覆盖。

## 后续可考虑

- 若未来要支持"单位切换 / 多日预报"，按本文件的 schema 模式扩展字段。
- 把 `get_weather` 的占位实现替换为真实天气 API 调用（届时引入 `httpx` 等新依赖）。
