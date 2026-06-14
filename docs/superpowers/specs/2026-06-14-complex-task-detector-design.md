# code_agent 复杂任务检测工具 设计

- 日期：2026-06-14
- 范围：在 `agents/code_agent/` 下新增 `detect_complex_task` 工具，主 LLM 自主决定是否调用；工具内部调同款 LLM 做任务拆解并以结构化 JSON 返回。同步更新 `agent.py` 的 `tools` 列表与 `system_prompt`。

## 背景与目标

`code_agent` 当前只有 `run_bash` / `run_read` / `run_write` / `run_edit` 四个执行型工具，没有"规划型"工具；`agent.py` 中 `# middleware=[TodoListMiddleware()]` 的注释表明团队曾考虑过任务分解但未落地。

用户面对多文件、需要设计权衡、目标模糊或多步串联的请求时，主 LLM 缺少"先把任务拆开"的入口，往往直接动手写代码，越改越乱。

目标：
- 给 `code_agent` 加一个"任务规划"工具：输入用户请求，返回结构化子任务列表（`is_complex` / `reasoning` / `subtasks`）。
- 工具内部调与主 agent 同一款 LLM（`longcat`），不引入新的 provider / 模型配置。
- 主 LLM 自主决定调用时机：在 `system_prompt` 中写明指引，不通过中间件强制改写输入。
- 单文件、单工具、最小改动面。

设计原则：
- 不引入中间件，不改 `TodoListMiddleware` 注释。
- 不在 `agents/code_agent/__init__.py` 与顶层 `agents/__init__.py` 导出新工具——仅本 agent 内部消费。
- 工具错误必须可恢复：异常一律转成 `"Error: ..."` 字符串返回，不让 agent 崩溃。
- 沿用现有 `schemas.py` + `tools.py` 拆分模式 + Pydantic `args_schema`。

## 目录与文件

```
agents/code_agent/
├── schemas.py                # 修改：新增 3 个 BaseModel 并入 __all__
├── tools.py                  # 修改：新增 detect_complex_task 工具函数
└── agent.py                  # 修改：注册工具 + 更新 system_prompt

tests/agents/
└── test_code_agent.py        # 修改：追加 5 个工具单元/集成测试
```

不动：
- `agents/code_agent/__init__.py`（不导出工具）
- 顶层 `agents/__init__.py`（不重新聚合）
- `utils/langchain_model.py`（复用现有 `get_singleton_client`）
- 其它 agent、其它测试、`backend/`、`pyproject.toml`。

## 组件

### `agents/code_agent/schemas.py` 新增内容

在现有四个 `*Input` 之后追加：

```python
class DetectComplexTaskInput(BaseModel):
    """复杂任务检测输入。"""

    user_request: str = Field(description="用户的原始请求文本")


class Subtask(BaseModel):
    """单个子任务。"""

    id: int = Field(description="1 起始的子任务编号")
    title: str = Field(description="祈使句短标题")
    description: str = Field(description="1-2 句说明做什么")
    depends_on: list[int] = Field(
        default_factory=list, description="前置子任务 id 列表"
    )
    acceptance_criteria: list[str] = Field(
        default_factory=list, description="1-3 条验收点"
    )


class DecompositionResult(BaseModel):
    """任务拆解结果。"""

    is_complex: bool = Field(description="是否属于复杂任务")
    reasoning: str = Field(description="1-3 句判断理由")
    subtasks: list[Subtask] = Field(default_factory=list)
```

并把三个新类名追加进 `__all__`（保持字母序）。

要点：
- 三个新类都遵循现有 `Field(description=中文)` 风格。
- `Subtask.depends_on` / `acceptance_criteria` 用 `default_factory=list` 而非 `[]`，避免 Pydantic v2 的可变默认值告警。

### `agents/code_agent/tools.py` 新增内容

模块顶部 import 区域追加：

```python
import logging

from pydantic import ValidationError

from agents.code_agent.schemas import (
    DecompositionResult,
    DetectComplexTaskInput,
)
from utils.langchain_model import get_singleton_client
```

模块内常量（在 `WORKDIR` 之后）：

```python
_DECOMPOSE_PROMPT = """你是任务拆解器。判断用户请求是否属于"复杂任务"——涉及多文件 / 设计权衡 / 目标模糊 / 多步串联。

严格按以下 JSON schema 返回，不要包含其他内容：
{{
  "is_complex": bool,
  "reasoning": "1-3 句判断理由",
  "subtasks": [
    {{
      "id": 1,
      "title": "祈使句短标题",
      "description": "1-2 句做什么",
      "depends_on": [前置 id 列表],
      "acceptance_criteria": ["1-3 条验收点"]
    }}
  ]
}}

若不复杂，返回：
{{"is_complex": false, "reasoning": "...", "subtasks": []}}

用户请求：
{user_request}
"""

logger = logging.getLogger(__name__)
```

工具函数（追加在 `run_edit` 之后）：

```python
@tool(args_schema=DetectComplexTaskInput)
def detect_complex_task(user_request: str) -> str:
    """判断用户请求是否属于复杂任务，若是则拆解为子任务列表.

    Args:
        user_request: 用户的原始请求文本

    Returns:
        包含 is_complex / reasoning / subtasks 字段的 JSON 字符串，
        或错误描述
    """
    try:
        client = get_singleton_client(llm_provider="longcat")
        prompt = _DECOMPOSE_PROMPT.format(user_request=user_request)
        response = client.invoke(prompt)
        result = DecompositionResult.model_validate_json(response.content)
    except (ValidationError, ValueError) as e:
        return f"Error: 内部 LLM 输出无法解析: {e}"
    except Exception as e:
        logger.exception("detect_complex_task 内部 LLM 调用失败")
        return f"Error: 任务拆解失败: {e}"
    return result.model_dump_json()
```

要点：
- 内部 LLM 与主 agent 同款：`get_singleton_client(llm_provider="longcat")` 与 `agent.py` 中保持一致。
- 用 Pydantic 强约束输出：LLM 返非 JSON / 字段缺失会被 `ValidationError` 捕获，转成 `Error: ...` 字符串。
- `Exception` 兜底 + `logger.exception`：工具边界必须容错，agent 不应因拆解失败而崩溃；具体异常类型难以穷举（不同 provider 的网络/鉴权错误差异大），这是工具函数的合理特例。
- 提示词常量 `_DECOMPOSE_PROMPT` 在模块级，便于测试断言 / 后续调优。

### `agents/code_agent/agent.py` 修改

```python
"""code_agent 智能体。"""

from langchain.agents import create_agent

from agents.code_agent.tools import (
    detect_complex_task,
    run_bash,
    run_read,
    run_write,
)
from utils.langchain_model import get_singleton_client

# 现有注释保留不动
from langchain.agents.middleware import TodoListMiddleware  # noqa: F401

code_agent = create_agent(
    model=get_singleton_client(llm_provider="longcat"),
    tools=[run_bash, run_read, run_write, detect_complex_task],
    # middleware=[TodoListMiddleware()],
    system_prompt=(
        "You are a code agent.\n"
        "\n"
        "When the user request is non-trivial (multi-file, design "
        "decisions, ambiguous goals, or many sequential steps), call "
        "`detect_complex_task` first to get a structured plan, then "
        "execute subtasks one at a time.\n"
        "\n"
        "For simple, single-step requests, act directly."
    ),
)
```

要点：
- `detect_complex_task` 加进 `tools` 列表，**不**替换 `run_edit`（`run_edit` 已在 `tools.py` 中实现但未注册，本设计不动它的注册状态以保持 surgical changes）。
- `system_prompt` 替换原本的 `"You are a helpful assistant"`。
- `TodoListMiddleware` 的 import 与注释保留，与本设计正交。

### 不动的文件

- `agents/code_agent/__init__.py`：不导出 `detect_complex_task`（工具仅本 agent 内部消费，按需导出的"需"为零）。
- 顶层 `agents/__init__.py`：不引入新符号。
- `utils/langchain_model.py`：复用现有 `get_singleton_client`。
- 其它 agent（`weather_agent` / `test_agent` 等）：零改动。

## 数据流

```
用户输入 → 主 LLM (longcat)
              │
              ├─ 判断"简单任务" → 直接调 run_bash / run_read / run_write
              │
              └─ 判断"复杂任务" → 调 detect_complex_task(user_request)
                                        │
                                        ▼
                                   _DECOMPOSE_PROMPT + user_request
                                        │
                                        ▼
                                   client.invoke(prompt)  (同款 longcat)
                                        │
                                        ▼
                                   DecompositionResult.model_validate_json
                                        │
                                        ▼
                                   model_dump_json()  ← 工具返回
                                        │
                                        ▼
                                   主 LLM 解析 subtasks
                                        │
                                        ▼
                                   按 id / depends_on 逐个执行
                                   （调 run_bash / run_read / run_write / run_edit）
```

## 错误处理

| 场景 | 工具返回 | 备注 |
|------|----------|------|
| 内部 LLM 返回非 JSON | `"Error: 内部 LLM 输出无法解析: <pydantic 报错>"` | `ValidationError` / `ValueError` 路径 |
| 内部 LLM 抛网络/鉴权错误 | `"Error: 任务拆解失败: <异常>"` | 兜底 `Exception` + `logger.exception` |
| 内部 LLM 返回 `is_complex=false` | `{"is_complex": false, "reasoning": "...", "subtasks": []}` | 正常路径 |
| 内部 LLM 返回合法 `is_complex=true` + 多个子任务 | 完整 JSON | 正常路径 |
| `user_request` 为空字符串 | 内部 LLM 自行判断（可能返 `is_complex=false`） | 不在工具层做校验，由 LLM 决定 |

工具**不**抛异常向上传播；agent 拿到 `Error: ...` 字符串后可自行决定下一步（重试、跳过、告知用户）。

## 验证标准

1. `uv run ruff format .` 无变更（或仅新行格式微调）。
2. `uv run ruff check --fix .` 全过。
3. `uv run mypy .` 全过（schemas 与工具函数均带完整类型注解）。
4. `uv run pytest` 全部测试通过，新增以下用例（位于 `tests/agents/test_code_agent.py`）：
   - `test_detect_complex_task_returns_parsed_json`：mock `get_singleton_client` 返合法 JSON → 工具返相同结构。
   - `test_detect_complex_task_simple_request`：mock 返 `{"is_complex": false, ...}` → 工具返 `subtasks: []`。
   - `test_detect_complex_task_handles_invalid_json`：mock 返 `"not json"` → 工具返 `"Error: 内部 LLM 输出无法解析: ..."`。
   - `test_detect_complex_task_handles_llm_failure`：mock client.invoke 抛 `RuntimeError` → 工具返 `"Error: 任务拆解失败: ..."`。
   - `test_agent_includes_detect_complex_task`：构造 `code_agent` 后断言 `detect_complex_task.name` 出现在其工具列表里。
5. 既有 `test_loads_agent` 用例不破。
6. 手工烟测（可选）：用 LangChain `code_agent.invoke({"messages": [...]})` 给一句"重写 agents 加载逻辑"，观察主 LLM 是否先调 `detect_complex_task` 再动手——属于人工判断，不在 CI 必跑。

## 范围外（明确不做）

- 不引入 `langchain.agents.middleware.TodoListMiddleware` 启用。
- 不在 `agents/code_agent/__init__.py` 或顶层 `agents/__init__.py` 导出 `detect_complex_task`。
- 不为工具加 retry / cache / token 计数。
- 不替换主 agent 的 LLM provider / 模型名。
- 不动 `run_edit` 的"未注册"状态（保持 surgical changes）。
- 不动其它 agent / 后端 / 前端 / `pyproject.toml` / `utils/`。

## 后续可考虑

- 若工具被频繁误判为"非复杂"，可在 `system_prompt` 中加几条"宁可判为复杂、也不要漏判"的方向性指引。
- 若需要把任务分解结果持久化（写到 `todo.json` 等），可加第二个工具 `record_subtasks(path, subtasks_json)`，本设计不预判。
- 启用 `TodoListMiddleware` 作为兜底：本设计完全不启用它，但保留 import 与注释，方便后续切换。
