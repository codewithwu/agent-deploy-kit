import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { authApi } from "@/lib/authApi";
import { tokenStorage } from "@/lib/tokenStorage";
import { authEvents } from "@/lib/authEvents";

vi.mock("@/lib/authApi", () => ({
  authApi: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    verify: vi.fn(),
    me: vi.fn(),
    changePassword: vi.fn(),
    deleteMe: vi.fn(),
  },
}));

const mockedAuthApi = vi.mocked(authApi);

const userStub = {
  id: 1,
  username: "alice",
  email: "alice@x.com",
  role: "user" as const,
  is_active: true,
  created_at: "2026-06-16T00:00:00Z",
};

const loginStub = {
  access_token: "a",
  refresh_token: "r",
  token_type: "bearer" as const,
  expires_in: 900,
  user: userStub,
};

function Probe() {
  const { status, user, isAuthenticated, login, logout, deleteAccount } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.username ?? "none"}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <button
        onClick={async () => {
          try {
            await login("alice", "pw");
          } catch {
            /* ignore */
          }
        }}
      >
        do-login
      </button>
      <button
        onClick={async () => {
          try {
            await logout();
          } catch {
            /* ignore */
          }
        }}
      >
        do-logout
      </button>
      <button
        onClick={async () => {
          try {
            await deleteAccount("pw");
          } catch {
            /* ignore */
          }
        }}
      >
        do-delete
      </button>
    </div>
  );
}

function renderWithRouter(initial: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initial}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useRealTimers();
  mockedAuthApi.verify.mockResolvedValue({ valid: true, user: userStub });
  mockedAuthApi.login.mockResolvedValue(loginStub);
  mockedAuthApi.logout.mockResolvedValue(undefined);
  mockedAuthApi.deleteMe.mockResolvedValue(undefined);
  mockedAuthApi.refresh.mockResolvedValue({
    access_token: "a2",
    refresh_token: "r2",
    token_type: "bearer",
    expires_in: 900,
  });
});

describe("AuthProvider", () => {
  it("throws when useAuth is used outside provider", () => {
    expect(() => render(<Probe />)).toThrow(/AuthProvider/);
  });

  it("starts in loading state and ends anonymous when no tokens", async () => {
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mockedAuthApi.verify).not.toHaveBeenCalled();
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("calls verify on mount when tokens exist; on success → authenticated", async () => {
    tokenStorage.setTokens("a", "r");
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(mockedAuthApi.verify).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user")).toHaveTextContent("alice");
  });

  it("clears tokens and goes anonymous on verify 401", async () => {
    tokenStorage.setTokens("a", "r");
    const { ApiError } = await import("@/lib/apiClient");
    mockedAuthApi.verify.mockRejectedValueOnce(new ApiError(401, "认证失败"));

    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it("login(): stores tokens, sets user, returns", async () => {
    renderWithRouter();
    await waitFor(() => screen.getByTestId("status"));

    await act(async () => {
      screen.getByText("do-login").click();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(tokenStorage.getAccess()).toBe("a");
    expect(tokenStorage.getRefresh()).toBe("r");
    expect(screen.getByTestId("user")).toHaveTextContent("alice");
  });

  it("logout(): calls api, clears tokens, goes anonymous even if api throws", async () => {
    tokenStorage.setTokens("a", "r");
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    mockedAuthApi.logout.mockRejectedValueOnce(new Error("network"));

    await act(async () => {
      screen.getByText("do-logout").click();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it("deleteAccount(): calls api, clears tokens, goes anonymous, returns", async () => {
    tokenStorage.setTokens("a", "r");
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await act(async () => {
      screen.getByText("do-delete").click();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mockedAuthApi.deleteMe).toHaveBeenCalledWith({ password: "pw" });
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it("responds to authEvents 'logout' by clearing state", async () => {
    tokenStorage.setTokens("a", "r");
    renderWithRouter();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    act(() => {
      authEvents.emit("logout");
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(tokenStorage.getAccess()).toBeNull();
  });
});

describe("proactive refresh", () => {
  beforeEach(() => {
    // 全程 fake timers;用 act 推进 React 状态,而不是 waitFor (后者依赖真实 setTimeout)
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // 辅助:登录并等待 status 切到 authenticated
  async function loginAndAuthenticate() {
    renderWithRouter();
    // 让 verify 副作用清空
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("status").textContent).toBe("anonymous");

    await act(async () => {
      screen.getByText("do-login").click();
      // flush login async chain
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
  }

  it("schedules a refresh (expires_in - 60)s after login", async () => {
    await loginAndAuthenticate();
    expect(mockedAuthApi.refresh).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(840 * 1000);
    });
    expect(mockedAuthApi.refresh).toHaveBeenCalledTimes(1);
  });

  it("clears the refresh timer on logout", async () => {
    tokenStorage.setTokens("a", "r");
    tokenStorage.setExpiresIn(900);
    renderWithRouter();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("status").textContent).toBe("authenticated");

    await act(async () => {
      screen.getByText("do-logout").click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("status").textContent).toBe("anonymous");

    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(mockedAuthApi.refresh).not.toHaveBeenCalled();
  });

  it("reschedules the timer after a successful refresh", async () => {
    await loginAndAuthenticate();

    // 第一次 timer 触发 → refresh 成功 → 重新调度
    await act(async () => {
      vi.advanceTimersByTime(840 * 1000);
    });
    expect(mockedAuthApi.refresh).toHaveBeenCalledTimes(1);

    // 再推进 840s,第二次 refresh 应被触发
    await act(async () => {
      vi.advanceTimersByTime(840 * 1000);
    });
    expect(mockedAuthApi.refresh).toHaveBeenCalledTimes(2);
  });

  it("does not throw if scheduled refresh fails (authEvents handles logout)", async () => {
    mockedAuthApi.refresh.mockRejectedValueOnce(new Error("network"));
    await loginAndAuthenticate();

    // 主要断言:advanceTimersByTime 不应抛错(refresh 失败时 catch 静默)
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(840 * 1000);
      }),
    ).not.toThrow();
  });
});
