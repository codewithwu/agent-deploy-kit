"""code_agent 智能体。"""

from langchain.agents import create_agent

from agents.code_agent.tools import (
    detect_complex_task,
    run_bash,
    run_read,
    run_write,
)
from utils.langchain_model import get_singleton_client

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
