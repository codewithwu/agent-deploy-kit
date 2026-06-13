"""天气查询智能体：最小可运行示例。"""

from langchain.agents import create_agent

from agents.weather_agent.tools import get_weather
from utils.langchain_model import get_singleton_client

weather_agent = create_agent(
    model=get_singleton_client(llm_provider="longcat"),
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
)
