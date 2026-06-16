"""用户认证子包。"""

# 先 import 子模块，让 sys.modules 在 routes 加载前填充完毕
# （routes.py / deps.py 等会在内部用 `from backend.auth import X` 形式，
# 必须确保这些 X 已在 sys.modules，否则会触发半初始化包重入 __init__.py）
from backend.auth import config  # noqa: F401
from backend.auth import redis_client  # noqa: F401
from backend.auth import security  # noqa: F401
from backend.auth import schemas  # noqa: F401
from backend.auth import service  # noqa: F401
from backend.auth import deps  # noqa: F401
from backend.auth.routes import router, validation_exception_handler

__all__ = ["router", "validation_exception_handler"]
