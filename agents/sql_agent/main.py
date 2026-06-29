from langchain.messages import HumanMessage
from langchain_core.utils.uuid import uuid7
from agents.sql_agent.agent import agent
from langgraph.types import Command 

thread_id = str(uuid7())
config={"configurable": {"thread_id": thread_id}}


if __name__ == "__main__":
    question = "Which genre on average has the longest tracks?"
    input_message = HumanMessage(question)

    for chunk in agent.stream(
        {"messages": [input_message]},
        config,
    ):
        print(chunk)
    
    print('中断后继续')

    for chunk in agent.stream(
        Command(resume={"decisions": [{"type": "approve"}]}),
        config,
    ):
        print(chunk)