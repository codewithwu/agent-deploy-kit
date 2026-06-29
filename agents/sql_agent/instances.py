from utils.langchain_model import get_singleton_client

import sqlite3
from threading import local

# Below are minimal tools for demonstration purposes.
# They are not intended to be secure or for production use.

class SQLiteConnectionManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._local = local()
    
    def get_connection(self):
        if not hasattr(self._local, 'connection'):
            self._local.connection = sqlite3.connect(self.db_path)
        return self._local.connection

# 创建连接管理器
db_manager = SQLiteConnectionManager("/home/cooper/githubProjects/agent-deploy-kit/agents/sql_agent/data/Chinook.db")



model=get_singleton_client(llm_provider="longcat")