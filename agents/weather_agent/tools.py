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
