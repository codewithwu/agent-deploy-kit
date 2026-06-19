import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authApi } from "@/lib/authApi";
import { tokenStorage } from "@/lib/tokenStorage";
import { authEvents } from "@/lib/authEvents";
import { ApiError } from "@/lib/apiClient";
import type { UserOut } from "@/types/api";
import { toast } from "sonner";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: UserOut | null;
}

type Action =
  | { type: "set"; user: UserOut }
  | { type: "clear" };

function reducer(_state: AuthState, action: Action): AuthState {
  switch (action.type) {
    case "set":
      return { status: "authenticated", user: action.user };
    case "clear":
      return { status: "anonymous", user: null };
  }
}

export interface AuthContextValue {
  status: AuthStatus;
  user: UserOut | null;
  isAuthenticated: boolean;
  login(usernameOrEmail: string, password: string): Promise<void>;
  register(username: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  deleteAccount(password: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: "loading", user: null });
  const navigate = useNavigate();
  const location = useLocation();
  const fromRef = useRef<{ from?: { pathname?: string } } | null>(
    location.state as { from?: { pathname?: string } } | null,
  );
  // 提前 60s 主动 refresh 的 timer 句柄
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fromRef.current = location.state as { from?: { pathname?: string } } | null;
  }, [location.state]);

  // 调度下一次主动 refresh。expiresIn 是 access token 的有效秒数,提前 60s 触发。
  const scheduleNextRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
    }
    const ttl = Math.max(0, (expiresInSeconds - 60) * 1000);
    refreshTimerRef.current = setTimeout(() => {
      void doProactiveRefresh();
    }, ttl);
  }, []);

  // 执行主动 refresh。失败时由 apiClient 内部 emit('logout'),由下方 effect 统一清理。
  const doProactiveRefresh = useCallback(async () => {
    refreshTimerRef.current = null;
    try {
      const pair = await authApi.refresh();
      tokenStorage.setTokens(pair.access_token, pair.refresh_token);
      tokenStorage.setExpiresIn(pair.expires_in);
      scheduleNextRefresh(pair.expires_in);
    } catch {
      // 静默:apiClient 已在 refresh 失败时 tokenStorage.clear() + emit('logout'),
      // AuthContext 监听 logout 事件的 effect 负责 dispatch + navigate
    }
  }, [scheduleNextRefresh]);

  // 组件卸载时清理 timer
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  // 启动:有 token 就 verify,恢复登录态
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStorage.getAccess() || !tokenStorage.getRefresh()) {
        if (!cancelled) dispatch({ type: "clear" });
        return;
      }
      try {
        const { user } = await authApi.verify();
        if (cancelled) return;
        dispatch({ type: "set", user });
        // 从持久化的 expires_at 恢复 timer(verify 响应本身不返回 expires_in)
        const expiresAt = tokenStorage.getExpiresAt();
        if (expiresAt && expiresAt > Date.now()) {
          const remainingSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
          scheduleNextRefresh(remainingSeconds);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          tokenStorage.clear();
        }
        dispatch({ type: "clear" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduleNextRefresh]);

  // 监听 apiClient 触发的 logout(refresh 失败)
  useEffect(() => {
    const off = authEvents.on("logout", () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      tokenStorage.clear();
      dispatch({ type: "clear" });
      navigate("/login", { replace: true });
    });
    return off;
  }, [navigate]);

  const login = useCallback<AuthContextValue["login"]>(
    async (usernameOrEmail, password) => {
      const out = await authApi.login({ username: usernameOrEmail, password });
      tokenStorage.setTokens(out.access_token, out.refresh_token);
      tokenStorage.setExpiresIn(out.expires_in);
      dispatch({ type: "set", user: out.user });
      scheduleNextRefresh(out.expires_in);
      const target = fromRef.current?.from?.pathname ?? "/";
      navigate(target, { replace: true });
    },
    [navigate, scheduleNextRefresh],
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (username, email, password) => {
      await authApi.register({ username, email, password });
      toast.success("注册成功,请登录");
      navigate("/login", { replace: true });
    },
    [navigate],
  );

  const logout = useCallback<AuthContextValue["logout"]>(async () => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    try {
      await authApi.logout();
    } catch {
      // 忽略:本地状态必须清
    }
    tokenStorage.clear();
    dispatch({ type: "clear" });
    navigate("/login", { replace: true });
  }, [navigate]);

  const changePassword = useCallback<AuthContextValue["changePassword"]>(
    async (oldPassword, newPassword) => {
      await authApi.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
    },
    [],
  );

  const deleteAccount = useCallback<AuthContextValue["deleteAccount"]>(
    async (password) => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      await authApi.deleteMe({ password });
      tokenStorage.clear();
      dispatch({ type: "clear" });
      toast.success("账户已注销");
      navigate("/login?deleted=1", { replace: true });
    },
    [navigate],
  );

  const value: AuthContextValue = {
    status: state.status,
    user: state.user,
    isAuthenticated: state.status === "authenticated",
    login,
    register,
    logout,
    changePassword,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { AuthContext };
