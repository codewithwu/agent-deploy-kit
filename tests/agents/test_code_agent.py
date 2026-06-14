"""code_agent 加载与工具测试。"""

import json

import pytest


@pytest.fixture(autouse=True)
def _reset_agent_cache() -> None:
    """lru_cache 是模块级, 跨测试泄漏; 每个用例前后清空。"""
    from backend.agent_loader import get_agent

    get_agent.cache_clear()
    yield
    get_agent.cache_clear()


def test_loads_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """AGENT_NAME=code_agent 时返回 code_agent 实例。"""
    monkeypatch.setenv("AGENT_NAME", "code_agent")

    from agents.code_agent import code_agent
    from backend.agent_loader import get_agent

    assert get_agent() is code_agent


# ---------------------------------------------------------------------------
# detect_complex_task 工具测试
# ---------------------------------------------------------------------------


class _FakeMessage:
    """模拟 langchain_core.messages.AIMessage 的 .content 接口。"""

    def __init__(self, content: str) -> None:
        self.content = content


class _FakeClient:
    """模拟 LangChain chat model 客户端；按需返回内容或抛异常。"""

    def __init__(self, fake: "_FakeLLM") -> None:
        self._fake = fake

    def invoke(self, prompt: str) -> _FakeMessage:
        self._fake.captured_prompts.append(prompt)
        response = self._fake.response
        if isinstance(response, Exception):
            raise response
        return _FakeMessage(response)


class _FakeLLM:
    """测试用可控 LLM：通过属性切换返回值/异常。"""

    def __init__(self) -> None:
        self.captured_prompts: list[str] = []
        self.response: str | Exception = json.dumps(
            {
                "is_complex": True,
                "reasoning": "需要改 3 个文件",
                "subtasks": [
                    {
                        "id": 1,
                        "title": "读 agent_loader",
                        "description": "理解现状",
                        "depends_on": [],
                        "acceptance_criteria": ["输出问题清单"],
                    }
                ],
            },
            ensure_ascii=False,
        )

    @property
    def client(self) -> _FakeClient:
        return _FakeClient(self)

    def set_response(self, response: str | Exception) -> None:
        self.response = response


@pytest.fixture
def fake_llm(monkeypatch: pytest.MonkeyPatch) -> _FakeLLM:
    """注入假 LLM 客户端到 agents.code_agent.tools 模块。"""
    import agents.code_agent.tools as tools_module

    fake = _FakeLLM()
    monkeypatch.setattr(
        tools_module, "get_singleton_client", lambda llm_provider: fake.client
    )
    return fake


def test_detect_complex_task_returns_parsed_json(fake_llm: _FakeLLM) -> None:
    """合法 JSON 输入时, 工具返回结构化 JSON 字符串."""
    from agents.code_agent.tools import detect_complex_task

    result = detect_complex_task.invoke({"user_request": "重写 agents 加载逻辑"})

    parsed = json.loads(result)
    assert parsed["is_complex"] is True
    assert len(parsed["subtasks"]) == 1
    assert parsed["subtasks"][0]["title"] == "读 agent_loader"
    assert parsed["subtasks"][0]["depends_on"] == []


def test_detect_complex_task_simple_request(fake_llm: _FakeLLM) -> None:
    """is_complex=false 时 subtasks 为空列表."""
    from agents.code_agent.tools import detect_complex_task

    fake_llm.set_response(
        json.dumps(
            {"is_complex": False, "reasoning": "单一动作", "subtasks": []},
            ensure_ascii=False,
        )
    )

    result = detect_complex_task.invoke({"user_request": "看看 README"})

    parsed = json.loads(result)
    assert parsed["is_complex"] is False
    assert parsed["subtasks"] == []


def test_detect_complex_task_handles_invalid_json(fake_llm: _FakeLLM) -> None:
    """内部 LLM 返回非 JSON 时, 工具返 'Error: 内部 LLM 输出无法解析: ...'."""
    from agents.code_agent.tools import detect_complex_task

    fake_llm.set_response("not json at all")

    result = detect_complex_task.invoke({"user_request": "x"})

    assert result.startswith("Error: 内部 LLM 输出无法解析")


def test_detect_complex_task_handles_llm_failure(fake_llm: _FakeLLM) -> None:
    """内部 LLM 抛异常时, 工具返 'Error: 任务拆解失败: ...'."""
    from agents.code_agent.tools import detect_complex_task

    fake_llm.set_response(RuntimeError("网络断开"))

    result = detect_complex_task.invoke({"user_request": "x"})

    assert result.startswith("Error: 任务拆解失败")
    assert "网络断开" in result


def test_agent_registers_detect_complex_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """agent.py 构造的 code_agent 应注册 detect_complex_task 工具."""
    monkeypatch.setenv("AGENT_NAME", "code_agent")

    from agents.code_agent.agent import code_agent
    from agents.code_agent.tools import detect_complex_task

    found = False
    for node in code_agent.nodes.values():
        runnable = (
            getattr(node, "runnable", None)
            or getattr(node, "data", None)
            or getattr(node, "bound", None)
            or node
        )
        tools_by_name = getattr(runnable, "tools_by_name", None)
        if tools_by_name and "detect_complex_task" in tools_by_name:
            assert tools_by_name["detect_complex_task"] is detect_complex_task
            found = True
            break
    assert found, "detect_complex_task 未注册到 code_agent 的 ToolNode"
