from langchain.tools import tool

from agents.data_agent.backend import backend


@tool(parse_docstring=True)
def send_message(text: str, file_path: str | None = None) -> str:
    """Send message, optionally including attachments such as images.

    Args:
        text: (str) text content of the message
        file_path: (str) file path of attachment in the filesystem.
    """
    if not file_path:
        print(f"file_path: {text}")
    else:
        fp = backend.download_files([file_path])
        print(f"fp: {fp[0].content}")

    return "Message sent."