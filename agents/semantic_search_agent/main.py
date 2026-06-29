from langchain.messages import HumanMessage
from agents.semantic_search_agent.agent import agent


if __name__ == "__main__":
    messages = [HumanMessage(content="在那几家公司工作过？")]

    stream = agent.stream_events(
        {"messages": messages},
        version="v3",
    )
    for kind, item in stream.interleave("messages", "tool_calls"):
        if kind == "messages":
            for token in item.text:
                print(token, end="", flush=True)
        elif kind == "tool_calls":
            print(f"\nTool call: {item.tool_name}({item.input})")
            print(f"Tool result: {item.output}")

    final_state = stream.output
    print(f"final_state {final_state}")
