from langchain.messages import HumanMessage
from langchain_core.utils.uuid import uuid7
from agents.data_agent.agent import agent

thread_id = str(uuid7())
config={"configurable": {"thread_id": thread_id}}


input_message = HumanMessage("Call send_message with text='analysis report' and file_path='./data/sales_data.csv'.")


if __name__ == "__main__":
    for chunk in agent.stream(
            {'messages': [input_message]},
            config=config,
            stream_mode='updates'):
        print(chunk)