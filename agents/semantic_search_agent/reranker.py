"""Qwen3-Reranker 重排序工具.

封装 Qwen3-Reranker-0.6B 模型，提供懒加载 + 单例缓存的文档重排序接口。
"""

import logging
import os
from functools import lru_cache

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

logger = logging.getLogger(__name__)

# 默认模型路径。可通过环境变量 RERANKER_MODEL_DIR 覆盖。
_DEFAULT_MODEL_DIR = "./my_models/qwen/Qwen3-Reranker-0.6B"

# Qwen3-Reranker 用末位 token 预测 "Yes" 的 logit 作为相关性分数
_YES_TOKEN = "Yes"
_MAX_INPUT_LENGTH = 2048


@lru_cache(maxsize=1)
def _load_model(model_dir: str) -> tuple[AutoTokenizer, AutoModelForCausalLM]:
    """懒加载 reranker 模型与分词器，按 ``model_dir`` 单例缓存.

    首次调用触发加载，后续调用直接返回缓存对象，避免每次重排序都重新读取权重。
    """
    logger.info("正在加载 Qwen3-Reranker 模型: %s", model_dir)
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForCausalLM.from_pretrained(
        model_dir,
        dtype=torch.bfloat16,
        device_map="auto",
    )
    logger.info("Qwen3-Reranker 模型加载完成: %s", model_dir)
    return tokenizer, model


def _score_one(
    tokenizer: AutoTokenizer,
    model: AutoModelForCausalLM,
    query: str,
    document: str,
) -> float:
    """对单条 ``(query, document)`` 计算 Qwen3-Reranker 相关性分数."""
    prompt = f"Query: {query}\nDocument: {document}"
    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=_MAX_INPUT_LENGTH,
    ).to(model.device)

    with torch.no_grad():
        logits = model(**inputs).logits[:, -1, :]

    yes_token_id = tokenizer.convert_tokens_to_ids(_YES_TOKEN)
    return logits[0][yes_token_id].item()


def rerank(
    query: str,
    documents: list[str],
    top_k: int | None = None,
    model_dir: str | None = None,
) -> list[str]:
    """用 Qwen3-Reranker 对文档按相关性打分并按分数降序返回.

    Args:
        query: 查询文本
        documents: 待重排序的文档列表（纯文本）
        top_k: 返回前 k 条；``None`` 表示返回全部（按分数降序）
        model_dir: 模型目录；``None`` 时按优先级：
            1. ``model_dir`` 显式参数
            2. 环境变量 ``RERANKER_MODEL_DIR``
            3. 默认值 ``./my_models/qwen/Qwen3-Reranker-0.6B``

    Returns:
        按相关性分数降序排列的文档列表，最多 ``top_k`` 条

    Raises:
        ValueError: ``query`` 为空，或 ``top_k`` 为负数
    """
    if not query or not query.strip():
        raise ValueError("query 不能为空")
    if top_k is not None and top_k < 0:
        raise ValueError(f"top_k 必须为非负整数或 None，当前: {top_k}")
    if not documents:
        return []

    target_dir = model_dir or os.getenv("RERANKER_MODEL_DIR") or _DEFAULT_MODEL_DIR
    tokenizer, model = _load_model(target_dir)

    # 评分并按分数降序排序
    scored: list[tuple[float, str]] = [
        (_score_one(tokenizer, model, query, doc), doc) for doc in documents
    ]
    scored.sort(key=lambda item: item[0], reverse=True)

    if top_k is not None:
        scored = scored[:top_k]

    return [(doc, score) for score, doc in scored]
