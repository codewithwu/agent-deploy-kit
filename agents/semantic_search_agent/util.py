"""语义检索子包的 PDF 解析与简历分节辅助函数。

- `load_pdf_pages`：把 PDF 按页转成 LangChain `Document` 列表。
- `detect_section`：根据标题模式 / 关键词 / 内容特征，识别一段简历文本属于哪个分节。
- `enrich`：给 chunk 拼上分节标题前缀，提升语义可识别度。
"""
import re

from langchain_core.documents import Document
import pypdf


def load_pdf_pages(file_path: str) -> list[Document]:
    reader = pypdf.PdfReader(file_path)
    return [
        Document(
            page_content=page.extract_text() or "",
            metadata={"source": file_path, "page": i},
        )
        for i, page in enumerate(reader.pages)
    ]


def detect_section(text: str) -> str:
    """综合关键词和格式检测"""
    # 1. 先检查是否有明确的标题模式（如：一、教育背景）
    title_pattern = r"^[\s]*[一二三四五六七八九十、]+[\s]*([^\s]+)"
    match = re.search(title_pattern, text, re.MULTILINE)
    if match:
        return match.group(1)

    # 2. 关键词匹配（权重更高）
    section_keywords = {
        "教育背景": ["教育背景", "学历", "学校", "专业"],
        "工作经历": ["工作经历", "工作经验", "职责", "任职"],
        "项目经验": ["项目经验", "项目经历", "参与项目"],
        "技能": ["专业技能", "技能特长", "技术栈", "掌握"],
        "个人信息": ["基本信息", "个人信息"],
    }

    # 检查前100个字符
    preview = text[:100]
    for section, keywords in section_keywords.items():
        for keyword in keywords:
            if keyword in preview:
                return section

    # 3. 基于内容特征推断
    if any(word in text for word in ["负责", "参与", "开发", "完成"]):
        if "项目" in text or len(text) > 100:
            return "项目经验"

    return "其他"


def enrich(doc: Document) -> Document:
    """给 chunk 拼上分节标题前缀，提升语义可识别度"""
    section = detect_section(doc.page_content)
    return Document(
        page_content=f"【{section}】{doc.page_content}",
        metadata={**doc.metadata, "section": section},
    )
