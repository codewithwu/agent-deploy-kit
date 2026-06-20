"""code_agent 智能体。"""

from langchain.agents import create_agent

from agents.code_agent.tools import (
    run_bash,
    run_read,
    run_write,
)
from utils.langchain_model import get_singleton_client

code_agent = create_agent(
    model=get_singleton_client(llm_provider="longcat"),
    tools=[run_bash, run_read, run_write],
    system_prompt="You are a code agent.",
)
