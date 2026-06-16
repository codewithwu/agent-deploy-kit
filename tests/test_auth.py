"""auth 端到端 HTTP 测试（httpx AsyncClient + lifespan）。"""

from httpx import AsyncClient

REGISTER_OK = {"username": "alice", "email": "a@b.com", "password": "Hello12345"}


async def test_register_success(client: AsyncClient) -> None:
    r = await client.post("/api/auth/register", json=REGISTER_OK)
    assert r.status_code == 201
    body = r.json()
    assert body["username"] == "alice"
    assert body["role"] == "user"


async def test_register_weak_password_400(client: AsyncClient) -> None:
    r = await client.post(
        "/api/auth/register",
        json={"username": "x", "email": "a@b.com", "password": "weak"},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "参数错误"


async def test_register_duplicate_username_409(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    r = await client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "other@b.com", "password": "Hello12345"},
    )
    assert r.status_code == 409
    assert "用户名" in r.json()["detail"]


async def test_register_duplicate_email_409(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    r = await client.post(
        "/api/auth/register",
        json={"username": "bob", "email": "a@b.com", "password": "Hello12345"},
    )
    assert r.status_code == 409
    assert "邮箱" in r.json()["detail"]


async def test_login_success(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    r = await client.post(
        "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
    )
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["user"]["username"] == "alice"


async def test_login_wrong_password_401(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    r = await client.post(
        "/api/auth/login", json={"username": "alice", "password": "WrongPass1"}
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "用户名或密码错误"


async def test_login_unknown_user_same_message(client: AsyncClient) -> None:
    r = await client.post(
        "/api/auth/login", json={"username": "nobody", "password": "Hello12345"}
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "用户名或密码错误"


async def test_verify_token(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    login = (
        await client.post(
            "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
        )
    ).json()
    r = await client.get(
        "/api/auth/verify",
        headers={"Authorization": f"Bearer {login['access_token']}"},
    )
    assert r.status_code == 200
    assert r.json()["valid"] is True


async def test_verify_without_token_401(client: AsyncClient) -> None:
    r = await client.get("/api/auth/verify")
    assert r.status_code == 401


async def test_me_returns_user(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    login = (
        await client.post(
            "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
        )
    ).json()
    r = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {login['access_token']}"}
    )
    assert r.status_code == 200
    assert r.json()["username"] == "alice"
    assert "password" not in r.json()


async def test_refresh_rotates(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    login = (
        await client.post(
            "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
        )
    ).json()
    r = await client.post(
        "/api/auth/refresh",
        headers={"Authorization": f"Bearer {login['refresh_token']}"},
    )
    assert r.status_code == 200
    new_pair = r.json()
    assert new_pair["refresh_token"] != login["refresh_token"]

    # 旧 refresh 不可再换
    r2 = await client.post(
        "/api/auth/refresh",
        headers={"Authorization": f"Bearer {login['refresh_token']}"},
    )
    assert r2.status_code == 401


async def test_logout_returns_204(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    login = (
        await client.post(
            "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
        )
    ).json()
    r = await client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {login['access_token']}"},
    )
    assert r.status_code == 204


async def test_change_password_success(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    login = (
        await client.post(
            "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
        )
    ).json()
    r = await client.patch(
        "/api/auth/me/password",
        json={"old_password": "Hello12345", "new_password": "NewPass1234"},
        headers={"Authorization": f"Bearer {login['access_token']}"},
    )
    assert r.status_code == 204

    # 旧密码不能登录
    r2 = await client.post(
        "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
    )
    assert r2.status_code == 401

    # 新密码能登录
    r3 = await client.post(
        "/api/auth/login", json={"username": "alice", "password": "NewPass1234"}
    )
    assert r3.status_code == 200


async def test_change_password_wrong_old_401(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    login = (
        await client.post(
            "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
        )
    ).json()
    r = await client.patch(
        "/api/auth/me/password",
        json={"old_password": "WrongPass1", "new_password": "NewPass1234"},
        headers={"Authorization": f"Bearer {login['access_token']}"},
    )
    assert r.status_code == 401


async def test_delete_me_soft_deletes(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    login = (
        await client.post(
            "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
        )
    ).json()
    r = await client.request(
        "DELETE",
        "/api/auth/me",
        json={"password": "Hello12345"},
        headers={"Authorization": f"Bearer {login['access_token']}"},
    )
    assert r.status_code == 204

    # 注销后不能再登录
    r2 = await client.post(
        "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
    )
    assert r2.status_code == 401


async def test_deleted_user_cannot_register_same_username(client: AsyncClient) -> None:
    await client.post("/api/auth/register", json=REGISTER_OK)
    login = (
        await client.post(
            "/api/auth/login", json={"username": "alice", "password": "Hello12345"}
        )
    ).json()
    await client.request(
        "DELETE",
        "/api/auth/me",
        json={"password": "Hello12345"},
        headers={"Authorization": f"Bearer {login['access_token']}"},
    )
    # 已注销 username 不可重注册
    r = await client.post("/api/auth/register", json=REGISTER_OK)
    assert r.status_code == 409
