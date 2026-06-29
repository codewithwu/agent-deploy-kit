from agents.hyper_rag_agent.schemas import AgentState, RouteDecision, GradeDoc, HallucinationCheck
from langchain_core.documents import Document  
from agents.hyper_rag_agent.instance import model, vector_retriever, web_search, neo4j_graph

ROUTER_PROMPT = """You are a query router for a hybrid RAG system.  
Classify the query into ONE category:  

- vector: factual questions answerable from internal documents  
  (policies, reports, product info, static knowledge)  
- graph: questions about relationships between entities  
  (how X connects to Y, who knows whom, supplier chains)    
- web: requires real-time or current information  
  (news, stock prices, today's events, recent releases)  
- direct: simple calculations or general knowledge the LLM already knows  

Query: {question}"""  

def router_node(state: AgentState) -> AgentState:  
    router_llm = model.with_structured_output(RouteDecision)  

    decision = router_llm.invoke(  
        ROUTER_PROMPT.format(question=state["question"])  
    )  
    print(f"→ Router: {decision.route} | {decision.reasoning}")  
    return {**state, "route": decision.route}  

# 条件边——路由到对应的检索节点  
def route_edge(state: AgentState) -> str:  
     return state["route"]   # "vector" | "graph" | "web" | "direct"


# ── Vector Retriever 节点 ────────────────────────────────
def vector_node(state: AgentState) -> AgentState:
    """从FAISS向量库检索相关文档"""
    docs = vector_retriever.invoke(state["question"])
    print(f"→ Vector检索到 {len(docs)} 个文档")
    return {**state, "documents": docs}

# ── Graph Retriever 节点 ────────────────────────────────
def graph_node(state: AgentState) -> AgentState:
    """从Neo4j图数据库检索关系信息"""
    # 使用LLM将自然语言转为Cypher查询
    cypher_query = model.invoke(
        f"Convert this question to a Cypher query: {state['question']}"
    ).content
    
    # 执行查询
    results = neo4j_graph.query(cypher_query)
    
    # 将结果转为Document对象
    docs = [Document(page_content=str(result)) for result in results]
    print(f"→ Graph检索到 {len(docs)} 个文档")
    return {**state, "documents": docs}

# ── Web Retriever 节点 ──────────────────────────────────
def web_node(state: AgentState) -> AgentState:
    """从Tavily进行网络搜索"""
    results = web_search.invoke(state["question"])
    docs = [
        Document(
            page_content=f"{r['content']}\nSource: {r.get('url', '')}",
            metadata={"url": r.get("url", "")}
        )
        for r in results
    ]
    print(f"→ Web检索到 {len(docs)} 个文档")
    return {**state, "documents": docs}

# ── Direct 节点（不需要检索）─────────────────────────────
def direct_node(state: AgentState) -> AgentState:
    """直接调用LLM回答，不需要检索"""
    answer = model.invoke(state["question"]).content
    return {**state, "generation": answer, "documents": []}





# ── Grader ───────────────────────────────────────────────  




def grader_node(state: AgentState) -> AgentState:  
    grader_llm = model.with_structured_output(GradeDoc)  
    grades = []  
    for doc in state["documents"]:  
        result = grader_llm.invoke(  
            f"Question: {state['question']}\nDocument: {doc.page_content[:400]}\n"  
            "Is this document relevant to answering the question? Score: relevant/irrelevant"  
        )  
        grades.append(result.score)  
    return {**state, "grade_results": grades}  

def grade_edge(state: AgentState) -> str:  
    relevant = sum(1 for g in state["grade_results"] if g == "relevant")  
    if relevant > 0:  
        return "generate"  
    elif state["rewrite_count"] < 3:  
        return "rewrite"  
    else:  
        return "web_fallback"   # 三次失败后的最终兜底  

# ── Rewriter ─────────────────────────────────────────────  
def rewriter_node(state: AgentState) -> AgentState:  
    rewritten = model.invoke(  
        f"The query '{state['question']}' returned no relevant results. "  
        "Rewrite it to be more specific and searchable. Return only the rewritten query."  
    ).content  
    print(f"→ Rewriter: '{state['question']}' → '{rewritten}'")  
    return {**state, "question": rewritten,  
            "rewrite_count": state["rewrite_count"] + 1}  

# ── Generator ────────────────────────────────────────────  
def generator_node(state: AgentState) -> AgentState:  
    context = "\n\n".join(d.page_content for d in state["documents"]  
                          if "relevant" in state.get("grade_results",[]))  
    answer = model.invoke(  
        f"Answer using only the context below.\n\nContext:\n{context}\n\nQuestion: {state['question']}"  
    ).content  
    return {**state, "generation": answer}  

# ── Hallucination Checker ────────────────────────────────  




def hallucination_node(state: AgentState) -> AgentState:  
    halluc_llm = model.with_structured_output(HallucinationCheck)  
    context = "\n\n".join(d.page_content for d in state["documents"])  
    result = halluc_llm.invoke(  
        f"Context:\n{context}\n\nAnswer:\n{state['generation']}\n\n"  
        "Is the answer fully supported by the context? grounded: yes/no"  
    )  
    return {**state, "hallucination_check": result.grounded}  

def halluc_edge(state: AgentState) -> str:  
     return "end" if state.get("hallucination_check") == "yes" else "regenerate"

