from deepagents.backends import LocalShellBackend
from agents.data_agent.config import root_dir

backend = LocalShellBackend(root_dir=root_dir, env={"PATH": "/usr/bin:/bin"})