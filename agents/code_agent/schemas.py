"""code_agent 工具的 Pydantic 输入 schema 集合。"""

from pydantic import BaseModel, Field


class BashInput(BaseModel):
    """bash 命令执行输入。"""

    command: str = Field(description="待执行的 bash 命令")


class ReadInput(BaseModel):
    """文件读取输入参数。"""

    path: str = Field(description="待读取的文件路径（相对工作区根目录）")
    limit: int | None = Field(
        default=None, description="最多返回的行数；超出时附加省略提示"
    )


class WriteInput(BaseModel):
    """文件写入输入参数。"""

    path: str = Field(description="待写入的文件路径（相对工作区根目录）")
    content: str = Field(description="待写入的完整文件内容")


class EditInput(BaseModel):
    """文件编辑输入参数。"""

    path: str = Field(description="待编辑的文件路径（相对工作区根目录）")
    old_text: str = Field(description="待替换的原文片段")
    new_text: str = Field(description="替换后的新片段")


class DetectComplexTaskInput(BaseModel):
    """复杂任务检测输入。"""

    user_request: str = Field(description="用户的原始请求文本")


class Subtask(BaseModel):
    """单个子任务。"""

    id: int = Field(description="1 起始的子任务编号")
    title: str = Field(description="祈使句短标题")
    description: str = Field(description="1-2 句说明做什么")
    depends_on: list[int] = Field(
        default_factory=list, description="前置子任务 id 列表"
    )
    acceptance_criteria: list[str] = Field(
        default_factory=list, description="1-3 条验收点"
    )


class DecompositionResult(BaseModel):
    """任务拆解结果。"""

    is_complex: bool = Field(description="是否属于复杂任务")
    reasoning: str = Field(description="1-3 句判断理由")
    subtasks: list[Subtask] = Field(default_factory=list)


__all__ = [
    "BashInput",
    "DecompositionResult",
    "DetectComplexTaskInput",
    "EditInput",
    "ReadInput",
    "Subtask",
    "WriteInput",
]
