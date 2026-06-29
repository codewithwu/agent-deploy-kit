# 语义搜索准确率优化指南

本文档整理 `semantic_search_agent.ipynb` 现状问题与可落地的优化方法，按"收益 / 实施成本"分级，便于按需取用。

---

## 一、现状梳理

| 维度 | 当前实现 | 备注 |
|------|----------|------|
| Embedding | `OllamaEmbeddings`，4096 维，模型名由 `OLLAMA_EMBEDDING_MODEL_NAME` 决定 | 通用模型，对中文短查询不专 |
| 向量库 | `InMemoryVectorStore` | 内存存储，重启即丢，不可扩展 |
| 文档抽取 | `pypdf.PdfReader` | 基础抽取，中文版式信息易丢失 |
| 分块 | `RecursiveCharacterTextSplitter`，`chunk_size=1000`、`overlap=200` | 简历/长文档易切碎语义单元 |
| 检索 | 纯 `similarity_search`，`k=1` | 无混合检索、无重排序 |
| 查询 | 用户原始问句直接做 embedding | 无改写、无扩展 |

实测 `在那几家公司工作过？` → 返回 page 2，score=**0.486**（余弦相似度偏低），内容中虽含答案关键词，但置信度与排名均不可靠。

---

## 二、问题诊断

1. **查询-文档语义鸿沟**：用户问"工作过哪些公司"（口语化抽象），文档用"项目交付 + 公司名"叙述。纯向量匹配易跑偏到"项目细节"。
2. **Embedding 中文能力不足**：`nomic-embed-text` / `mxbai-embed-large` 这类通用模型对中文短查询语义捕捉弱于 `bge-m3` / `bge-large-zh-v1.5` / `text2vec-large-chinese`。
3. **Chunk 边界破坏语义**：1000 字符一刀切，会把"教育经历 / 项目经历 / 个人优势"分散到不同 chunk，单个 chunk 缺少自包含语义。
4. **缺乏重排序**：Top-K 直接交付，下游易把"项目细节"排到"公司名"之前。
5. **无查询改写**：口语化问题缺关键词，向量召回命中不到显式公司名。
6. **无元数据辅助**：无法按"工作经历 / 教育经历"等版块过滤。
7. **Top-K 过小**：`k=1` 在简历场景过于严苛，错过跨 chunk 聚合。

---

## 三、优化方法

按"收益 / 实施成本"分高、中、低三档。

### 3.1 高收益（优先做）

#### 1) 换中文专用 Embedding

```python
# 推荐 bge-m3（多语言、8192 token 上限、中文 SOTA）
embeddings = OllamaEmbeddings(model="bge-m3", base_url=OLLAMA_BASEURL)
```

备选：`bge-large-zh-v1.5`（纯中文、1024 维）、`text2vec-large-chinese`（轻量）。

#### 2) 加 Reranker 做二次排序

召回 top-K=20，reranker 重排后取 top-3。中文场景推荐 `bge-reranker-base` / `bge-reranker-large`：

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import BgeRerank

compressor = BgeRerank(top_n=3, model="BAAI/bge-reranker-base")
retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=vector_store.as_retriever(search_kwargs={"k": 20}),
)
```

#### 3) 调小 Chunk + 元数据前缀

```python
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=300,          # 简历类长文档用 300-500 更精准
    chunk_overlap=50,
    separators=["\n\n", "●", "•", "、", "。"],
)

def enrich(doc: Document) -> Document:
    """给 chunk 拼上分节标题前缀，提升语义可识别度"""
    section = detect_section(doc.page_content)  # 简单规则即可
    return Document(
        page_content=f"【{section}】{doc.page_content}",
        metadata={**doc.metadata, "section": section},
    )

all_splits = [enrich(d) for d in text_splitter.split_documents(docs)]
```

#### 4) 混合检索（BM25 + 向量）

```python
from langchain_classic.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever

bm25 = BM25Retriever.from_documents(all_splits)
bm25.k = 10
vector = vector_store.as_retriever(search_kwargs={"k": 10})

retriever = EnsembleRetriever(
    retrievers=[bm25, vector],
    weights=[0.4, 0.6],  # 偏向量，但关键词（公司名、年份）走 BM25
)
```

#### 5) 换持久化向量库

`InMemoryVectorStore` → `Chroma` / `FAISS` / `Qdrant`。好处：可缓存 embedding、支持 metadata 过滤、支持混合检索原生接口。

### 3.2 中收益

#### 6) 查询改写（Query Rewriting）

用 LLM 把口语化问题改写为结构化检索词：

```python
REWRITE_PROMPT = """请把用户问题改写为简历检索关键词，覆盖同义表达。
原问题：{query}
改写后（用空格分隔多个关键词）："""
```

例：`在那几家公司工作过？` → `工作经历 公司名称 任职单位 雇主`。

#### 7) HyDE（Hypothetical Document Embeddings）

让 LLM 先生成"假想答案"，再用假想答案去检索。对抽象问题（"哪些公司 / 哪些技能"）特别有效：

```python
HYDE_PROMPT = """请根据问题，生成一段可能的简历内容（不必真实）。
问题：{query}
假想文档："""
hyde_doc = llm.invoke(HYDE_PROMPT.format(query=query))
# 用 hyde_doc 做 similarity_search
```

#### 8) Multi-Query Retrieval

LLM 生成 3-5 个变体查询（"哪些公司 / 工作单位 / 任职公司"），分别检索后合并去重。LangChain 内置 `MultiQueryRetriever`。

#### 9) 改进 PDF 抽取

`pypdf` 对中文版式丢失严重。换 `pymupdf` / `marker-pdf` / `unstructured`：

```python
import pymupdf

def load_pdf_pages(file_path: str) -> list[Document]:
    doc = pymupdf.open(file_path)
    return [
        Document(
            page_content=page.get_text(),
            metadata={"source": file_path, "page": i},
        )
        for i, page in enumerate(doc)
    ]
```

#### 10) 调大 Top-K

`k=1` 改 `k=5` ~ `k=10`，配合 reranker 截断。简历类文档"工作经历"通常跨多 chunk，必须聚合。

### 3.3 基础修复

#### 11) Embedding 缓存

同一文档不重复 embed，节省时间与 Ollama 资源。

#### 12) Metadata 过滤

切分时记录 `section` / `page` / `source`，检索时按需过滤：

```python
retriever = vector_store.as_retriever(
    search_kwargs={"k": 5, "filter": {"section": "工作经历"}}
)
```

#### 13) 评估数据集

准备 20-50 条 `query → 期望 chunk` 评估集，每次改动跑一遍指标（Recall@K / MRR），避免"感觉好但其实没变"。

---

## 四、推荐实施路径

### 最小改动（MVP，1 小时）

1. 换 `bge-m3` embedding
2. `chunk_size` 调到 300，加分隔符优先级
3. `k` 调到 5

预期：单点检索准确率明显提升，成本几乎为零。

### 推荐路径（2-3 小时）

在 MVP 基础上加：

1. 元数据前缀（`【工作经历】xxx`）
2. 切到持久化向量库（Chroma）
3. 加 `bge-reranker-base` 重排序
4. 换 `pymupdf` 抽 PDF

预期：覆盖 80% 场景，简历问答类问题稳定。

### 完整改造（1 天）

在推荐路径上再加：

1. 混合检索（BM25 + 向量）
2. 查询改写
3. HyDE / Multi-Query
4. 评估数据集 + 自动化评测脚本

预期：生产级准确率，可作为模板复用。

---

## 五、评估方法

```python
# 评估集示例
EVAL_SET = [
    {"query": "在那几家公司工作过？", "expect_section": "工作经历", "expect_keywords": ["济南新能源", "比亚迪"]},
    {"query": "会哪些编程语言？", "expect_section": "技术栈", "expect_keywords": ["Python"]},
    # ...
]

def recall_at_k(retriever, eval_set, k=5) -> float:
    hits = 0
    for case in eval_set:
        docs = retriever.invoke(case["query"])[:k]
        if any(case["expect_section"] in d.metadata.get("section", "") for d in docs):
            hits += 1
    return hits / len(eval_set)
```

每次优化后跑一遍，对比 Recall@5 / MRR 数值变化。

---

## 六、注意事项

- **冷启动**：bge-m3 / bge-reranker 模型需先 `ollama pull`（如使用 ollama）或自建推理服务。
- **维度一致**：切换 embedding 模型时必须重建索引（不同模型维度不同，4096 → 1024 等）。
- **reranker 延迟**：bge-reranker-large 推理较慢，生产环境建议异步批处理或换轻量版。
- **混合检索权重**：BM25 与向量权重需在评估集上调优，不要拍脑袋定。
