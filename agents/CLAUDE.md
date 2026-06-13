# `agents/` 智能体模块

LangChain 智能体集合。每个智能体一个子目录，由 `pyproject.toml` 中 `setuptools` 唯一打包进 wheel。

> 根 `CLAUDE.md` 与 `.claude/rules/python.md` 中的中文注释、绝对导入、`__all__` 等通用规范同样适用；本文只补充本模块独有约定。

## 目录结构

```
agents/
├── __init__.py             # 顶层聚合，按需导出各智能体子包
└── <name>_agent/           # 单个智能体实现
    ├── __init__.py         # 对外 API：导出 agent 实例与工具
    ├── agent.py            # create_agent(...) 组装入口
    └── tools.py            # 智能体可用工具函数
```

## 职责划分

- `agent.py`：定义 `<name>_agent = create_agent(model=..., tools=[...], system_prompt=...)` 实例，从 `tools.py` 导入工具，从 `utils.langchain_model` 取模型。
- `tools.py`：仅放可被 LLM 调用的纯函数工具，保持无状态、可独立测试。
- `__init__.py`（子包层）：用 `__all__` 显式声明对外导出，避免无关符号泄漏。
- `agents/__init__.py`（顶层）：只做"再导出"汇总，不写业务逻辑。

## 命名

- 子目录命名 `<name>_agent`（小写下划线 + `_agent` 后缀），与导出的 `<name>_agent` 实例名保持一致。
- 工具函数名直接描述能力（如 `get_weather`），便于 LangChain 自动生成工具描述。

## 导入

- 模块内、跨模块一律绝对导入：`from agents.weather_agent.tools import get_weather`。
- 禁止相对导入（`from .tools import ...`）。
- `__init__.py` 是子包间允许做"再导出"的唯一位置；`agent.py` 内部不要通过 `__init__.py` 绕一圈。

## 新增一个智能体

1. 在 `agents/` 下新建 `<name>_agent/` 子目录，包含 `__init__.py`。
2. `agent.py` 调用 `create_agent(...)`，从 `tools.py` 导入工具，从 `utils.langchain_model` 取模型。
3. `tools.py` 写工具函数（带中文 docstring、完整类型注解）。
4. 子包 `__init__.py`：`from agents.<name>_agent.agent import <name>_agent`，按需导出工具，并配套 `__all__`。
5. 顶层 `agents/__init__.py` 添加 `from agents import <name>_agent` 并同步 `__all__`。
6. 改完后跑 `uv run ruff check agents/`、`uv run mypy agents/`、相关 `uv run pytest`。

## 模型与 provider

- LLM 客户端统一通过 `utils.langchain_model.get_singleton_client(provider=...)` 获取；新增 provider 走 `.env` + 该工具函数，不在 `agent.py` 内直接 `os.getenv`。
- `system_prompt` 写在 `agent.py` 的 `create_agent` 调用里，避免分散在多处。
