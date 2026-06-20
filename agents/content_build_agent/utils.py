import os
import time
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image

# ModelScope 异步图像生成配置
BASE_URL = "https://api-inference.modelscope.cn/"
DEFAULT_MODEL = "Tongyi-MAI/Z-Image-Turbo"
POLL_INTERVAL = 5          # 任务状态轮询间隔(秒)
REQUEST_TIMEOUT = 30       # 单次 HTTP 请求超时(秒)


def generate_image(
    prompt: str,
    save_path: str | Path = "result_image.jpg",
    model: str = DEFAULT_MODEL,
    poll_interval: int = POLL_INTERVAL,
) -> Path:
    """调用 ModelScope 异步图像生成 API,轮询至完成后保存到本地。
    
    提交流程: 提交异步任务 → 轮询状态 → SUCCEED 后下载首张图。
    
    Args:
        prompt: 图片描述文本。
        save_path: 图片保存路径,默认 "result_image.jpg"。
        model: ModelScope 模型 ID,默认 Tongyi-MAI/Z-Image-Turbo。
        poll_interval: 任务状态轮询间隔(秒),默认 5。
    
    Returns:
        保存后的图片绝对路径(Path)。

    Raises:
        KeyError: 环境变量 MODELSCOPE_API_KEY 未设置。
        requests.HTTPError: 提交任务或查询状态时 HTTP 请求失败。
        RuntimeError: ModelScope 任务执行失败(状态为 FAILED)。
    """
    # 缺失时 KeyError 自动抛出,无需手动处理
    api_key = os.environ["MODELSCOPE_API_KEY"]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 1. 提交异步生成任务
    submit_resp = requests.post(
        f"{BASE_URL}v1/images/generations",
        headers={**headers, "X-ModelScope-Async-Mode": "true"},
        json={"model": model, "prompt": prompt},
        timeout=REQUEST_TIMEOUT,
    )
    submit_resp.raise_for_status()
    task_id = submit_resp.json()["task_id"]

    # 2. 轮询任务状态直到 SUCCEED 或 FAILED
    while True:
        query_resp = requests.get(
            f"{BASE_URL}v1/tasks/{task_id}",
            headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
            timeout=REQUEST_TIMEOUT,
        )
        query_resp.raise_for_status()
        payload = query_resp.json()
        status = payload["task_status"]

        if status == "SUCCEED":
            image_url = payload["output_images"][0]
            image = Image.open(
                BytesIO(requests.get(image_url, timeout=REQUEST_TIMEOUT).content)
            )
            save_path = Path(save_path).resolve()
            image.save(save_path)
            return save_path

        elif status == "FAILED":
            raise RuntimeError(f"ModelScope 任务 {task_id} 执行失败: {payload}")

        time.sleep(poll_interval)