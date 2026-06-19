import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, apiFetch } from "./apiClient";
import { tokenStorage } from "./tokenStorage";
import { authEvents } from "./authEvents";

const API_BASE = "http://localhost:8000";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  tokenStorage.setTokens("access-1", "refresh-1");
});

describe("apiFetch", () => {
  it("adds Authorization header for access auth and stringifies body", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiFetch("/api/auth/me");

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(`${API_BASE}/api/auth/me`);
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer access-1",
    });
    expect((init as RequestInit).method).toBe("GET");
  });

  it("does not add Authorization when auth=none", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiFetch("/api/auth/login", {
      method: "POST",
      auth: "none",
      body: { username: "u", password: "p" },
    });

    const [, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).headers).not.toHaveProperty("Authorization");
    expect((init as RequestInit).body).toBe(
      JSON.stringify({ username: "u", password: "p" }),
    );
  });

  it("uses refresh token for auth=refresh", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiFetch("/api/auth/refresh", { auth: "refresh" });

    const [, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer refresh-1",
    });
  });

  it("throws ApiError on non-2xx with detail and fieldErrors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, {
        detail: "参数错误",
        errors: [{ loc: ["body", "username"], msg: "too short" }],
      }),
    );

    await expect(apiFetch("/api/auth/register", { body: {} })).rejects.toThrow(
      ApiError,
    );
    try {
      await apiFetch("/api/auth/register", { body: {} });
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(400);
      expect(err.detail).toBe("参数错误");
      expect(err.fieldErrors).toEqual([
        { loc: ["body", "username"], msg: "too short" },
      ]);
    }
  });

  it("returns Response unchanged on 204 without reading body", async () => {
    const resp = new Response(null, { status: 204 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resp);
    const out = await apiFetch("/api/auth/logout", { method: "POST" });
    expect(out.status).toBe(204);
  });

  describe("401 + refresh + retry", () => {
    it("on 401 calls /api/auth/refresh, stores new tokens, retries original once", async () => {
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
            expires_in: 900,
          }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { id: 1 }));

      const out = await apiFetch("/api/auth/me");
      expect(out.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(3);

      // refresh 请求带 refresh token
      const refreshInit = spy.mock.calls[1]?.[1] as RequestInit;
      expect(refreshInit.headers).toMatchObject({
        Authorization: "Bearer refresh-1",
      });

      // 重试用新 access
      const retryInit = spy.mock.calls[2]?.[1] as RequestInit;
      expect(retryInit.headers).toMatchObject({
        Authorization: "Bearer access-2",
      });

      // 存储已更新
      expect(tokenStorage.getAccess()).toBe("access-2");
      expect(tokenStorage.getRefresh()).toBe("refresh-2");
    });

    it("on second 401 (after retry) throws ApiError(401)", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
            expires_in: 900,
          }),
        )
        .mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }));

      await expect(apiFetch("/api/auth/me")).rejects.toMatchObject({
        status: 401,
      });
    });

    it("on refresh failure: clears tokens, emits logout, throws ApiError", async () => {
      const onLogout = vi.fn();
      authEvents.on("logout", onLogout);
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }))
        .mockResolvedValueOnce(jsonResponse(401, { detail: "refresh 失败" }));

      await expect(apiFetch("/api/auth/me")).rejects.toThrow(ApiError);
      expect(tokenStorage.getAccess()).toBeNull();
      expect(tokenStorage.getRefresh()).toBeNull();
      expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it("concurrent 401s share a single refresh call", async () => {
      let refreshCalls = 0;
      const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/api/auth/refresh")) {
          refreshCalls++;
          // 模拟慢响应,确保两个请求都进来
          await new Promise((r) => setTimeout(r, 5));
          return jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
            expires_in: 900,
          });
        }
        return jsonResponse(401, { detail: "认证失败" });
      });

      // 重试时也返回 401,这是已知的边界(refresh 完成后客户端只重试一次)
      // 本测试只验证 refresh 共享,不验证最终结果(那是上一个测试覆盖的)
      const results = await Promise.allSettled([
        apiFetch("/api/auth/me"),
        apiFetch("/api/auth/me"),
      ]);

      // 两次都至少走到 refresh 阶段(refresh 共享)
      expect(refreshCalls).toBe(1);
      // 总调用:me×2 + refresh×1 + me(重试)×2 = 5
      expect(spy).toHaveBeenCalledTimes(5);
      // 两个 Promise 都 settle(rejected 因为重试也 401)
      expect(results.every((r) => r.status === "rejected")).toBe(true);
    });

    it("refreshed singleton resets after refresh resolves (next 401 starts new refresh)", async () => {
      const spy = vi.spyOn(globalThis, "fetch");
      spy.mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }));
      spy.mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-2",
          refresh_token: "refresh-2",
          token_type: "bearer",
          expires_in: 900,
        }),
      );
      spy.mockResolvedValueOnce(jsonResponse(200, { id: 1 }));
      spy.mockResolvedValueOnce(jsonResponse(401, { detail: "认证失败" }));
      spy.mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-3",
          refresh_token: "refresh-3",
          token_type: "bearer",
          expires_in: 900,
        }),
      );
      spy.mockResolvedValueOnce(jsonResponse(200, { id: 2 }));

      await apiFetch("/api/auth/me");
      await apiFetch("/api/auth/me");

      const refreshCount = spy.mock.calls.filter(([u]) =>
        String(u).endsWith("/api/auth/refresh"),
      ).length;
      expect(refreshCount).toBe(2);
    });
  });
});
