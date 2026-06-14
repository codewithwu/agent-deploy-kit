"""测试套件全局配置：默认 AGENT_NAME=weather_agent。

backend.main 启动时调用 get_agent() 读取 AGENT_NAME；本兜底确保 pytest
收集阶段该 env 存在，import chain 不爆。
"""

import os

os.environ.setdefault("AGENT_NAME", "weather_agent")
