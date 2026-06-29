from langchain.messages import HumanMessage
from agents.hyper_rag_agent.graph import agent

# messages = [HumanMessage(content="What are the main differences between RAG and fine-tuning for LLM applications?")]


if __name__ == "__main__":
    # from langchain.messages import HumanMessage

    # for chunk in  agent.stream(
    #     {"messages": [HumanMessage(content="Write a blog post about how AI agents are transforming software development")]},
    #     # config={"configurable": {"thread_id": "content-builder-demo"}},
    # ):
    #     print(chunk)

    result = agent.invoke({  
    "question":      "什么是向量检索?",  
    "rewrite_count": 0,  
    "documents":     [],  
    "grade_results": [],  
    "generation":    "",  
    "route":         "",  
            })  
    print(result["generation"])