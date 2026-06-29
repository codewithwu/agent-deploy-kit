from utils.langchain_model import get_singleton_client

from dotenv import load_dotenv
from langchain_ollama.embeddings import OllamaEmbeddings
import os
from langchain_community.vectorstores import FAISS  
from langchain_community.tools.tavily_search import TavilySearchResults  
from langchain_community.graphs import Neo4jGraph  

load_dotenv()


OLLAMA_BASEURL = os.getenv("OLLAMA_BASEURL")
OLLAMA_MODEL_NAME = os.getenv("OLLAMA_MODEL_NAME")
OLLAMA_EMBEDDING_MODEL_NAME = (
    "bge-m3:latest"  # os.getenv("OLLAMA_EMBEDDING_MODEL_NAME")
)

tavily_api_key = os.getenv("TAVILY_API_KEY")

embeddings = OllamaEmbeddings(
    model=OLLAMA_EMBEDDING_MODEL_NAME, base_url=OLLAMA_BASEURL
)


model=get_singleton_client(llm_provider="bailing")  # bailing  longcat

vector_store = FAISS.load_local("/home/cooper/githubProjects/agent-deploy-kit/agents/hyper_rag_agent/faiss_index", 
                                embeddings,  
                                allow_dangerous_deserialization=True,  # 反序列化 pickle 需要显式确认
                                )  
vector_retriever = vector_store.as_retriever(search_kwargs={"k": 4})  

neo4j_graph = Neo4jGraph(url="bolt://localhost:7687",  
                          username="neo4j", password="your_secure_password")  
web_search = TavilySearchResults(max_results=3, tavily_api_key=tavily_api_key)
