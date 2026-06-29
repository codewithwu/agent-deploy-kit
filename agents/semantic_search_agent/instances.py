from langchain_core.embeddings import Embeddings
from langchain_core.vectorstores import InMemoryVectorStore, VectorStore
from langchain_ollama.embeddings import OllamaEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter, TextSplitter

from agents.semantic_search_agent.config import settings

__all__ = ["text_splitter", "embeddings", "vector_store"]

# 简历类长文档用 300-500 更精准
text_splitter: TextSplitter = RecursiveCharacterTextSplitter(
    chunk_size=300,
    chunk_overlap=50,
    separators=["\n\n", "●", "•", "、", "。"],
)

embeddings: Embeddings = OllamaEmbeddings(
    model=settings.ollama_embedding_model_name,
    base_url=settings.ollama_baseurl,
)

vector_store: VectorStore = InMemoryVectorStore(embeddings)
