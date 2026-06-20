from langchain.messages import HumanMessage
from agents.content_build_agent.agent import agent

messages = [HumanMessage(content="What are the main differences between RAG and fine-tuning for LLM applications?")]


if __name__ == "__main__":
    from langchain.messages import HumanMessage

    for chunk in  agent.stream(
        {"messages": [HumanMessage(content="Write a blog post about how AI agents are transforming software development")]},
        # config={"configurable": {"thread_id": "content-builder-demo"}},
    ):
        print(chunk)