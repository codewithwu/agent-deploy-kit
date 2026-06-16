"""init_admin 脚手架：幂等创建 admin 账号。

用法：
    uv run python scripts/init_admin.py <username> <email> <password>

无 --force 时若目标 username 已存在则报错退出。
"""

# 把项目根加入 sys.path，使 `python scripts/init_admin.py` 也能 import backend
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
from getpass import getpass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.security import hash_password
from backend.db.async_session import AsyncSessionLocal
from backend.models import User, UserRole


async def _upsert_admin(
    db: AsyncSession, username: str, email: str, password: str, force: bool
) -> None:
    existing = (
        await db.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if existing is not None:
        if not force:
            print(f"username {username!r} 已存在；用 --force 覆盖为 admin", file=sys.stderr)
            sys.exit(2)
        existing.role = "admin"
        existing.is_active = True
        existing.hashed_password = hash_password(password)
        existing.email = email
        await db.commit()
        print(f"updated: {username} → admin (force)")
        return

    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(password),
        role="admin",
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, role="admin"))
    await db.commit()
    print(f"created: {username} (admin)")


async def _amain(args: argparse.Namespace) -> None:
    async with AsyncSessionLocal() as db:
        await _upsert_admin(db, args.username, args.email, args.password, args.force)


def main() -> None:
    parser = argparse.ArgumentParser(description="init admin user")
    parser.add_argument("username")
    parser.add_argument("email")
    parser.add_argument(
        "password",
        nargs="?",
        help="明文密码；省略则交互输入（不入 history）",
    )
    parser.add_argument("--force", action="store_true", help="username 已存在时覆盖")
    args = parser.parse_args()
    if args.password is None:
        args.password = getpass("password: ")
    asyncio.run(_amain(args))


if __name__ == "__main__":
    main()
