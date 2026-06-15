# RAG 分块策略实战：一个项目负责人的避坑指南与五种方案的完整实现

> 别再背概念了。我用真实上线的项目经验，带你搞懂分块到底怎么选、怎么写、怎么落地。

## 写在前面

我踩过一个坑：第一版 RAG 上线时，我选了固定大小分块（512 token，重叠 64）。用户问：“公司年假政策里，入职满 3 年的人怎么算？”答案被切成两块：一块说“入职满 3 年”，另一块说“可享受 12 天年假”。检索只命中前者，模型回答：“找不到完整信息”。

那一刻我才真正理解：**分块策略不是预处理，而是检索精度的天花板**。

这篇文章，我会从一个项目负责人的视角，带你完整过一遍五种主流分块策略——不是背概念，而是看代码、踩坑、做决策。

---

## 一、先搞懂核心矛盾

在深入代码之前，必须理解一个贯穿所有策略的矛盾：

| 策略倾向 | 优点 | 缺点 |
|---------|------|------|
| 块越大 | 语义完整 | 检索不精准，像问明天天气却拿到整周预报 |
| 块越小 | 命中率高 | 上下文断裂，计算爆炸 |

这个矛盾理解透了，再看五种策略，你就能抓住本质。

---

## 二、环境准备

```bash
pip install tiktoken langchain nltk sentence-transformers numpy openai
```

```python
import tiktoken
import numpy as np
import re
from sentence_transformers import SentenceTransformer

# 初始化
model = SentenceTransformer('all-MiniLM-L6-v2')
enc = tiktoken.get_encoding("cl100k_base")
```

---

## 三、测试文档（故意设计来暴露问题）

```python
doc = """
第一章：年假政策概述

公司实行弹性年假制度，正式员工每年享有12天年假。

第二章：年假计算规则

入职满1年但不足3年的员工，年假为10天。
入职满3年及以上的员工，年假为15天。

特殊情况说明：
- 当年离职员工，按比例折算。
- 新入职员工，试用期后开始计算年假。
"""
```

---

## 四、五种策略的完整实现

### 1️⃣ 固定大小分块

**适用场景**：快速原型验证、基线对比、压力测试  
**不推荐用于生产**

```python
def fixed_size_chunk(text, chunk_size=100, overlap=20):
    tokens = enc.encode(text)
    chunks = []
    for i in range(0, len(tokens), chunk_size - overlap):
        chunk_tokens = tokens[i:i + chunk_size]
        chunks.append(enc.decode(chunk_tokens))
    return chunks

# 执行
chunks_fixed = fixed_size_chunk(doc)
for i, c in enumerate(chunks_fixed):
    print(f"\n--- 固定块 {i} ---\n{c}")
```

**你会看到的问题**：信息在句子中间被切断，“入职满1年但不足3”和“年的员工”被分到不同块中。

---

### 2️⃣ 语义分块

**适用场景**：文档结构混乱但语义边界清晰  
**难点**：阈值调参痛苦

```python
def semantic_chunk(text, sim_threshold=0.7, min_chunk_size=3):
    sentences = text.replace('\n', ' ').split('。')
    sentences = [s.strip() for s in sentences if len(s) > 5]
    
    if len(sentences) < 2:
        return sentences
    
    emb = model.encode(sentences)
    
    chunks = []
    current_chunk = [sentences[0]]
    
    for i in range(1, len(sentences)):
        sim = np.dot(emb[i-1], emb[i]) / (np.linalg.norm(emb[i-1]) * np.linalg.norm(emb[i]))
        
        if sim < sim_threshold or len(current_chunk) >= min_chunk_size:
            chunks.append('。'.join(current_chunk) + '。')
            current_chunk = [sentences[i]]
        else:
            current_chunk.append(sentences[i])
    
    if current_chunk:
        chunks.append('。'.join(current_chunk) + '。')
    
    return chunks

# 执行
chunks_semantic = semantic_chunk(doc)
```

**经验之谈**：不要只靠余弦相似度，建议加最小块长度限制，避免过碎。

---

### 3️⃣ 递归分块（生产环境首选）

**适用场景**：默认首选，适合大多数文档  
**优势**：兼顾语义完整与长度控制

```python
def recursive_chunk(text, max_size=150):
    separators = ["\n\n", "\n", "。", "；", "，", " ", ""]
    
    def _split(text, level=0):
        if len(enc.encode(text)) <= max_size or level >= len(separators):
            return [text]
        
        sep = separators[level]
        if sep == "":
            parts = list(text)
        else:
            parts = text.split(sep)
        
        chunks = []
        current = []
        current_len = 0
        
        for part in parts:
            part_len = len(enc.encode(part))
            if current_len + part_len > max_size and current:
                chunks.append(sep.join(current))
                current = [part]
                current_len = part_len
            else:
                current.append(part)
                current_len += part_len
        
        if current:
            chunks.append(sep.join(current))
        
        result = []
        for c in chunks:
            if len(enc.encode(c)) > max_size:
                result.extend(_split(c, level+1))
            else:
                result.append(c)
        return result
    
    return _split(text)

# 执行
chunks_recursive = recursive_chunk(doc)
```

**为什么我推荐它作为默认方案**：不会切断句子，自动降级切分，实现可控。

---

### 4️⃣ 基于结构的分块

**适用场景**：技术手册、论文、官方文档  
**前提**：文档结构清晰且一致

```python
def structural_chunk(text):
    lines = text.split('\n')
    chunks = []
    current = []
    
    for line in lines:
        if re.match(r'^(第[一二三四五六七八九十]+章|##+ )', line.strip()):
            if current:
                chunks.append('\n'.join(current))
            current = [line]
        else:
            current.append(line)
    
    if current:
        chunks.append('\n'.join(current))
    
    return chunks

# 执行
chunks_struct = structural_chunk(doc)
```

**血的教训**：我接手过一个技术手册，`##` 和 `###` 混用，还有手动加粗的“标题”，结构分块直接崩了。**务必先做结构清洗**。

---

### 5️⃣ 大模型分块

**适用场景**：种子文档、质量验收、小规模核心知识库  
**原则**：效果好，但别滥用

```python
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def llm_chunk(text, model="gpt-3.5-turbo"):
    prompt = f"""
你是一个文档分块专家。请将以下文档切分成语义完整、大小适中的块（每块 100~300 token）。
用 <chunk> 和 </chunk> 标记每个块。

文档：
{text}
"""
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )
    
    content = response.choices[0].message.content
    chunks = re.findall(r'<chunk>(.*?)</chunk>', content, re.DOTALL)
    return chunks if chunks else [content]
```

**一个真实的成本数据**：我用 GPT-4 切 1000 篇文档，耗时 2 小时，费用 120 美元，效果提升相比递归分块并不显著。现在我只在种子文档上用它。

---

## 五、生产环境的三套组合拳

文档里说“可以组合”，但没告诉你具体怎么组合。以下三套方案我都已经上线验证过：

### 组合一：粗粒度 + 细粒度（最推荐）
```text
1. 先按段落/小节切（粗）
2. 超出上限的，用递归再切（细）
```
**效果**：保主题完整 + 保检索精度

### 组合二：小块检索 + 上下文扩窗
```text
- 小块（256 token）做检索
- 命中后，把前后各2块一起给LLM
```
**解决**：切碎了也不怕，上下文能找回来

### 组合三：元数据挂载
```python
# 每个块存储
{
    "content": "块内容",
    "doc_title": "文档标题",
    "chapter": "所属章节",
    "prev_chunk_id": "前一块ID",
    "next_chunk_id": "后一块ID"
}
```
**效果**：检索时即使命中半个答案，也能找回完整信息

---

## 六、决策框架：别开会争论，直接对号入座

### 先回答3个问题
1. 文档结构是否清晰？
2. 是否允许1-2秒的延迟增加？
3. 文档量是否 > 1万篇？

### 直接选型

| 场景 | 推荐策略 | 备选 |
|------|---------|------|
| 技术手册 / 论文 | 结构分块 | 递归兜底 |
| 企业 Wiki（乱） | 递归分块 | 语义分块 |
| 聊天记录 / 评论 | 语义分块 + 最小块长度 | 固定大小 |
| 快速原型验证 | 固定大小 | 不用于生产 |
| 核心知识库（<500篇） | 大模型分块 | 人工抽检 |

---

## 七、最后一个负责人的忠告

> “先跑通再迭代”是对的，但很多人理解错了。

❌ **错误理解**：先用固定大小跑通，后面再优化。  
✅ **正确理解**：
- 固定大小用来做**链路测试**
- 在**第一个版本上线前**，必须切换到合理策略（如递归分块）
- 分块策略不是“后期优化项”，而是**上线前必选项**

---

## 八、各策略横向对比

| 策略 | 输出质量 | 可控性 | 成本 | 生产推荐度 |
|------|----------|--------|------|------------|
| 固定大小 | ⭐⭐ | ⭐⭐⭐⭐⭐ | 极低 | ❌ 不推荐 |
| 语义分块 | ⭐⭐⭐⭐ | ⭐⭐ | 中 | ⚠️ 场景受限 |
| 递归分块 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 低 | ✅ 默认首选 |
| 结构分块 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 低 | ✅ 文档规范时 |
| 大模型分块 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 极高 | ⚠️ 仅小规模 |

---

## 写在最后

如果你只想记住一件事：

> **递归分块是生产环境的默认首选，结构清洗是大规模应用的前置条件，大模型分块是验收工具而非日常手段。**

现在，找一篇你工作中的真实文档，把这五种策略各跑一遍，问一个真实问题，看哪种切法能让答案完整出现在一个块里。

做一次，比看十篇文章都有用。
