import { describe, it, expect, vi, beforeEach } from "vitest";
import { authApi } from "./authApi";
import { apiFetch } from "./apiClient";

vi.mock("./apiClient", () => ({ apiFetch: vi.fn() }));
const mockedApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockedApiFetch.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("authApi", () => {
  it("register POSTs to /api/auth/register with body", async () => {
    await authApi.register({
      username: "u",
      email: "e@x",
      password: "Pw123456",
    });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      auth: "none",
      body: { username: "u", email: "e@x", password: "Pw123456" },
    });
  });

  it("login POSTs to /api/auth/login with auth=none", async () => {
    await authApi.login({ username: "u", password: "p" });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      auth: "none",
      body: { username: "u", password: "p" },
    });
  });

  it("logout POSTs to /api/auth/logout with auth=access", async () => {
    await authApi.logout();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      auth: "access",
    });
  });

  it("refresh POSTs to /api/auth/refresh with auth=refresh", async () => {
    await authApi.refresh();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/refresh", {
      method: "POST",
      auth: "refresh",
    });
  });

  it("verify GETs /api/auth/verify with auth=access", async () => {
    await authApi.verify();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/verify", {
      method: "GET",
      auth: "access",
    });
  });

  it("me GETs /api/auth/me with auth=access", async () => {
    await authApi.me();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me", {
      method: "GET",
      auth: "access",
    });
  });

  it("changePassword PATCHes /api/auth/me/password with auth=access", async () => {
    await authApi.changePassword({ old_password: "o", new_password: "n" });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me/password", {
      method: "PATCH",
      auth: "access",
      body: { old_password: "o", new_password: "n" },
    });
  });

  it("deleteMe DELETEs /api/auth/me with auth=access and body", async () => {
    await authApi.deleteMe({ password: "p" });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me", {
      method: "DELETE",
      auth: "access",
      body: { password: "p" },
    });
  });
});
