"""code_agent 智能体可用工具集合。"""

import os
import subprocess
from pathlib import Path

from langchain_core.tools import tool

from agents.code_agent.schemas import (
    BashInput,
    EditInput,
    ReadInput,
    WriteInput,
)


WORKDIR = Path.cwd()
print(f"WORKDIR {WORKDIR}")


def safe_path(p: str) -> Path:
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")
    return path


@tool(args_schema=BashInput)
def run_bash(command: str) -> str:
    """执行 bash 命令, 带危险命令拦截/超时控制/输出截断.

    Args:
        command: 待执行的 bash 命令

    Returns:
        命令的 stdout+stderr (截断到 50000 字符), 或错误信息
    """
    # 危险命令黑名单, 命中任一关键字直接拒绝
    dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
    if any(item in command for item in dangerous):
        return "Error: Dangerous command blocked"
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return "Error: Timeout (120s)"
    except (FileNotFoundError, OSError) as e:
        return f"Error: {e}"
    output = (result.stdout + result.stderr).strip()
    return output[:50000] if output else "(no output)"


@tool(args_schema=ReadInput)
def run_read(path: str, limit: int | None = None) -> str:
    """读取文本文件内容，支持按行数截断.

    Args:
        path: 待读取的文件路径（相对工作区根目录）
        limit: 最多返回的行数；超出时附加省略提示

    Returns:
        文件内容字符串（截断到 50000 字符），或错误信息
    """
    try:
        print(f"www {safe_path(path)}")
        text = safe_path(path).read_text()
        lines = text.splitlines()
        if limit and limit < len(lines):
            lines = lines[:limit] + [f"... ({len(lines) - limit} more lines)"]
        return "\n".join(lines)[:50000]
    except Exception as e:
        return f"Error: {e}"


@tool(args_schema=WriteInput)
def run_write(path: str, content: str) -> str:
    """将内容写入文件，必要时自动创建父目录.

    Args:
        path: 待写入的文件路径（相对工作区根目录）
        content: 待写入的完整文件内容

    Returns:
        写入结果描述，或错误信息
    """
    try:
        fp = safe_path(path)
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content)
        return f"Wrote {len(content)} bytes to {path}"
    except Exception as e:
        return f"Error: {e}"


@tool(args_schema=EditInput)
def run_edit(path: str, old_text: str, new_text: str) -> str:
    """在文件中查找并替换指定片段（仅替换首次出现）.

    Args:
        path: 待编辑的文件路径（相对工作区根目录）
        old_text: 待替换的原文片段
        new_text: 替换后的新片段

    Returns:
        编辑结果描述，或错误信息
    """
    try:
        fp = safe_path(path)
        content = fp.read_text()
        if old_text not in content:
            return f"Error: Text not found in {path}"
        fp.write_text(content.replace(old_text, new_text, 1))
        return f"Edited {path}"
    except Exception as e:
        return f"Error: {e}"
