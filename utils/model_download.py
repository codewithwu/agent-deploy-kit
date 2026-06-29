"""ModelScope 模型下载工具.

封装 modelscope SDK 的 snapshot_download，提供参数校验、日志、错误包装，
并通过环境变量 MODEL_DOWNLOAD_DIR 允许全局覆盖默认下载根目录。
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from modelscope import snapshot_download

load_dotenv()

logger = logging.getLogger(__name__)

# 默认下载根目录。可通过环境变量 MODEL_DOWNLOAD_DIR 覆盖。
_DEFAULT_DOWNLOAD_DIR = "./my_models"


def download_model_from_modelscope(
    model_id: str,
    cache_dir: str | os.PathLike[str] | None = None,
    revision: str = "master",
) -> str:
    """从 ModelScope 下载模型到本地.

    Args:
        model_id: ModelScope 上的模型 ID，如 ``"qwen/Qwen3-Reranker-0.6B"``
        cache_dir: 模型下载目录。``None`` 时依次读取：
            1. ``cache_dir`` 显式参数
            2. 环境变量 ``MODEL_DOWNLOAD_DIR``
            3. 默认值 ``./my_models``
        revision: 模型分支或版本号，默认为 ``"master"``

    Returns:
        模型下载到本地的绝对路径

    Raises:
        ValueError: ``model_id`` 为空时
        OSError: 创建目录或写入文件失败时
    """
    if not model_id or not model_id.strip():
        raise ValueError("model_id 不能为空")

    target_dir = Path(
        cache_dir or os.getenv("MODEL_DOWNLOAD_DIR") or _DEFAULT_DOWNLOAD_DIR
    ).expanduser()
    target_dir.mkdir(parents=True, exist_ok=True)

    logger.info(
        "开始下载模型 %s (revision=%s) 到 %s", model_id, revision, target_dir
    )

    try:
        model_path = snapshot_download(
            model_id,
            revision=revision,
            cache_dir=str(target_dir),
        )
    except OSError:
        logger.exception("模型 %s 下载时发生文件系统错误", model_id)
        raise

    logger.info("模型 %s 已下载到: %s", model_id, model_path)
    return model_path
