"""scripts/new_agent.py 单元测试。"""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path("scripts/new_agent.py")


@pytest.fixture
def new_agent():
    """以 importlib 加载 scripts/new_agent.py, 避免变成包。"""
    spec = importlib.util.spec_from_file_location("new_agent", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["new_agent"] = module
    spec.loader.exec_module(module)
    return module


def test_render_init_py_contains_name(new_agent) -> None:
    """render_init_py('foo_agent') 输出含 'foo_agent' 与 __all__。"""
    out = new_agent.render_init_py("foo_agent")
    assert "from agents.foo_agent.agent import foo_agent" in out
    assert '__all__ = ["foo_agent"]' in out


def test_render_agent_py_contains_name(new_agent) -> None:
    """render_agent_py 输出含 create_agent 调用且不含 weather_agent 字面量。"""
    out = new_agent.render_agent_py("foo_agent")
    assert "from agents.foo_agent.tools import placeholder_tool" in out
    assert "foo_agent = create_agent(" in out
    assert "tools=[placeholder_tool]" in out
    assert "weather_agent" not in out


def test_render_tools_py_contains_name(new_agent) -> None:
    """render_tools_py 输出含 PlaceholderInput + placeholder_tool。"""
    out = new_agent.render_tools_py("foo_agent")
    assert "class PlaceholderInput" in out
    assert "def placeholder_tool" in out
    assert "@tool(args_schema=PlaceholderInput)" in out
    assert "weather_agent" not in out


def test_render_test_py_contains_name(new_agent) -> None:
    """render_test_py 输出含与 test_agent_loader 一致的 fixture 与断言。"""
    out = new_agent.render_test_py("foo_agent")
    assert 'monkeypatch.setenv("AGENT_NAME", "foo_agent")' in out
    assert "from agents.foo_agent import foo_agent" in out
    assert "get_agent() is foo_agent" in out
    assert "weather_agent" not in out


def test_validate_name_accepts_weather_agent(new_agent) -> None:
    """validate_name 不对合法 name 抛错。"""
    new_agent.validate_name("weather_agent")  # 不抛


def test_validate_name_rejects_no_suffix(new_agent) -> None:
    """缺 _agent 后缀 → SystemExit。"""
    with pytest.raises(SystemExit):
        new_agent.validate_name("weather")


def test_validate_name_rejects_uppercase(new_agent) -> None:
    """大写 → SystemExit。"""
    with pytest.raises(SystemExit):
        new_agent.validate_name("Weather_agent")


def test_validate_name_rejects_empty(new_agent) -> None:
    """空串 → SystemExit。"""
    with pytest.raises(SystemExit):
        new_agent.validate_name("")


def test_ensure_unique_rejects_existing_dir(new_agent, tmp_path: Path) -> None:
    """agents/<name>/ 已存在 → SystemExit。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "foo_agent").mkdir()
    top_init = tmp_path / "agents" / "__init__.py"
    with pytest.raises(SystemExit):
        new_agent.ensure_unique("foo_agent", agents_dir, top_init)


def test_ensure_unique_rejects_already_registered(new_agent, tmp_path: Path) -> None:
    """__init__.py 已注册 name → SystemExit。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    top_init = agents_dir / "__init__.py"
    top_init.write_text(
        'from agents import foo_agent\n__all__ = ["foo_agent"]\n',
        encoding="utf-8",
    )
    with pytest.raises(SystemExit):
        new_agent.ensure_unique("foo_agent", agents_dir, top_init)


def test_ensure_unique_passes_when_clean(new_agent, tmp_path: Path) -> None:
    """无冲突 → 不抛。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    top_init = agents_dir / "__init__.py"
    top_init.write_text("__all__ = []\n", encoding="utf-8")
    new_agent.ensure_unique("foo_agent", agents_dir, top_init)  # 不抛


def test_append_to_top_init_inserts_alphabetically(new_agent, tmp_path: Path) -> None:
    """按字母序把 name 插入 __all__ 与 from 行。"""
    top_init = tmp_path / "__init__.py"
    top_init.write_text(
        'from agents import zeta_agent\n__all__ = ["zeta_agent"]\n',
        encoding="utf-8",
    )
    new_agent.append_to_top_init("alpha_agent", top_init)
    text = top_init.read_text(encoding="utf-8")
    assert "alpha_agent" in text
    assert "zeta_agent" in text
    # 字母序: alpha < zeta
    assert text.index("alpha_agent") < text.index("zeta_agent")


def test_append_to_top_init_preserves_valid_python(new_agent, tmp_path: Path) -> None:
    """修改后文本仍是合法 Python。"""
    top_init = tmp_path / "__init__.py"
    top_init.write_text("__all__ = []\n", encoding="utf-8")
    new_agent.append_to_top_init("foo_agent", top_init)
    text = top_init.read_text(encoding="utf-8")
    compile(text, str(top_init), "exec")  # 不抛


def test_append_to_top_init_handles_existing_imports(new_agent, tmp_path: Path) -> None:
    """已有 from 行 → 追加在同行; 不会创建重复 import。"""
    top_init = tmp_path / "__init__.py"
    top_init.write_text(
        'from agents import beta_agent\n__all__ = ["beta_agent"]\n',
        encoding="utf-8",
    )
    new_agent.append_to_top_init("alpha_agent", top_init)
    text = top_init.read_text(encoding="utf-8")
    assert text.count("from agents import") == 1
    assert "beta_agent, alpha_agent" in text or "alpha_agent, beta_agent" in text


def test_append_to_top_init_quotes_each_name_in_all(new_agent, tmp_path: Path) -> None:
    """__all__ 列表每项必须独立加双引号, 不得把多个 name 合并成一个字符串。"""
    top_init = tmp_path / "__init__.py"
    top_init.write_text(
        'from agents import zeta_agent\n__all__ = ["zeta_agent"]\n',
        encoding="utf-8",
    )
    new_agent.append_to_top_init("alpha_agent", top_init)
    text = top_init.read_text(encoding="utf-8")
    assert '__all__ = ["alpha_agent", "zeta_agent"]' in text


def test_main_writes_files_and_updates_top_init(
    new_agent,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """main() 创建子包 + 顶层 __init__ 接入 + tests/agents/__init__.py。"""
    # 复刻仓库根结构
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "__init__.py").write_text("__all__ = []\n", encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "agents").mkdir()

    monkeypatch.chdir(tmp_path)
    rc = new_agent.main(["foo_agent"])
    assert rc == 0

    # 子包三文件
    assert (agents_dir / "foo_agent" / "__init__.py").exists()
    assert (agents_dir / "foo_agent" / "agent.py").exists()
    assert (agents_dir / "foo_agent" / "tools.py").exists()
    # 测试样板
    assert (tmp_path / "tests" / "agents" / "__init__.py").exists()
    assert (tmp_path / "tests" / "agents" / "test_foo_agent.py").exists()
    # 顶层 __init__.py 被更新
    top_text = (agents_dir / "__init__.py").read_text(encoding="utf-8")
    assert "foo_agent" in top_text
    compile(top_text, str(agents_dir / "__init__.py"), "exec")


def test_main_rejects_duplicate_run(
    new_agent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """main() 第二次运行同名 → SystemExit, 不覆盖既有文件。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "__init__.py").write_text("__all__ = []\n", encoding="utf-8")
    (tmp_path / "tests" / "agents").mkdir(parents=True)
    (agents_dir / "foo_agent").mkdir()

    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit):
        new_agent.main(["foo_agent"])


def test_main_uses_module_constants(
    new_agent, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """不传 argv 时, main() 从 sys.argv[1:] 读取。"""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    (agents_dir / "__init__.py").write_text("__all__ = []\n", encoding="utf-8")
    (tmp_path / "tests" / "agents").mkdir(parents=True)

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("sys.argv", ["new_agent.py", "foo_agent"])
    rc = new_agent.main()
    assert rc == 0
    assert (agents_dir / "foo_agent" / "agent.py").exists()
