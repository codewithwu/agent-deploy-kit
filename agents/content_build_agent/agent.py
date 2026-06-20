from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from utils.langchain_model import get_singleton_client

from agents.content_build_agent.tools import generate_cover, generate_social_image, load_subagents, EXAMPLE_DIR

def create_content_writer():
    """Create a content writer agent configured by filesystem files."""
    return create_deep_agent(
        model=get_singleton_client(llm_provider="longcat"),
        memory=["./docs/AGENTS.md"],
        skills=["./docs/skills/"],
        tools=[generate_cover, generate_social_image],
        subagents=load_subagents(EXAMPLE_DIR / "docs/subagents.yaml"),
        backend=FilesystemBackend(root_dir=EXAMPLE_DIR, virtual_mode=True),
    )

agent = create_deep_agent()