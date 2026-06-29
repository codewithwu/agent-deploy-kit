
from agents.hyper_rag_agent.schemas import AgentState
from langgraph.graph import StateGraph, END  

from agents.hyper_rag_agent.nodes import *

# ── 构建 LangGraph 状态机 ────────────────────────────────  
workflow = StateGraph(AgentState)  

# 添加节点  
workflow.add_node("router",       router_node)  
workflow.add_node("vector",       vector_node)  
workflow.add_node("graph",        graph_node)  
workflow.add_node("web",          web_node)  
workflow.add_node("direct",       direct_node)  
workflow.add_node("grader",       grader_node)  
workflow.add_node("rewriter",     rewriter_node)  
workflow.add_node("generator",    generator_node)  
workflow.add_node("hallucination",hallucination_node)  

# 入口节点  
workflow.set_entry_point("router")  

# router → 检索器（条件边）  
workflow.add_conditional_edges("router", route_edge, {  
    "vector": "vector",  
    "graph":  "graph",  
    "web":    "web",  
    "direct": "direct",  
})  

# 检索器 → grader  
for node in ["vector", "graph", "web"]:  
    workflow.add_edge(node, "grader")  

# grader → 生成 / 改写 / web 兜底  
workflow.add_conditional_edges("grader", grade_edge, {  
    "generate":     "generator",  
    "rewrite":      "rewriter",  
    "web_fallback": "web",  
})  

# rewriter → 回到 router  
workflow.add_edge("rewriter", "router")  

# generator → hallucination 检测  
workflow.add_edge("generator", "hallucination")  

# hallucination 检测 → 结束或重新生成  
workflow.add_conditional_edges("hallucination", halluc_edge, {  
    "end":        END,  
    "regenerate": "generator",  
})  
workflow.add_edge("direct", END)  

# 编译并运行  
agent = workflow.compile()  
