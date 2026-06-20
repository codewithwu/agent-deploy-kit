from utils.langchain_model import get_singleton_client

from langgraph.checkpoint.memory import InMemorySaver
from deepagents import create_deep_agent
from agents.data_agent.tools import send_message


from agents.data_agent.backend import backend

checkpointer = InMemorySaver()

agent = create_deep_agent(
    model=get_singleton_client(llm_provider="longcat"),
    tools=[send_message],
    backend=backend,
    checkpointer=checkpointer,
)


