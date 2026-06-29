"""语义检索子包的检索工具。

模块顶层会读入 PDF、切分、并构建混合检索器（BM25 + 向量），由 `retrieve_context` 暴露给 LangChain 工具系统。
"""
from langchain.tools import tool
from langchain_classic.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document

from agents.semantic_search_agent.instances import text_splitter, vector_store
from agents.semantic_search_agent.reranker import rerank
from agents.semantic_search_agent.util import enrich, load_pdf_pages

# 模块顶层：构造阶段 —— 读 PDF → 切分 → 灌 BM25 + 向量两路 → 组合成 hybrid
docs = load_pdf_pages(
    file_path="/home/cooper/githubProjects/agent-deploy-kit/agents/semantic_search_agent/docs/test.pdf"
)
all_splits = [enrich(d) for d in text_splitter.split_documents(docs)]

bm25 = BM25Retriever.from_documents(all_splits, k=4)
vector_store.add_documents(documents=all_splits)
vector = vector_store.as_retriever(search_kwargs={"k": 4})

hybrid = EnsembleRetriever(
    retrievers=[bm25, vector],
    weights=[0.4, 0.6],
)


@tool(response_format="content_and_artifact")
def retrieve_context(query: str) -> tuple[str, list[Document]]:
    """Retrieve information to help answer a query."""
    retrieved_docs = hybrid.invoke("工作过哪些公司？")
    model_dir = "/home/cooper/githubProjects/agent-deploy-kit/agents/semantic_search_agent/my_models/qwen/Qwen3-Reranker-0.6B"
    result = rerank(query=query, documents=retrieved_docs, model_dir=model_dir, top_k=3)
    serialized = "\n\n".join((f"Content: {doc[0]}") for doc in result)
    return serialized, retrieved_docs
