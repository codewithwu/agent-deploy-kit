from langchain.messages import HumanMessage
from agents.research_agent.agent import agent

messages = [HumanMessage(content="What are the main differences between RAG and fine-tuning for LLM applications?")]


if __name__ == "__main__":
    for chunk in agent.stream({"messages": messages}):
        print(chunk)