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


__all__ = [
    "BashInput",
    "EditInput",
    "ReadInput",
    "WriteInput",
]
