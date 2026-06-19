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

export interface User {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  isActive: boolean;
  createdAt: string;
}

function toUser(u: UserOut): User {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    isActive: u.is_active,
    createdAt: u.created_at,
  };
}

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: User | null;
}

type Action =
  | { type: "set"; user: User }
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
  user: User | null;
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
  useEffect(() => {
    fromRef.current = location.state as { from?: { pathname?: string } } | null;
  }, [location.state]);

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
        if (!cancelled) dispatch({ type: "set", user: toUser(user) });
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
  }, []);

  // 监听 apiClient 触发的 logout(refresh 失败)
  useEffect(() => {
    const off = authEvents.on("logout", () => {
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
      dispatch({ type: "set", user: toUser(out.user) });
      const target = fromRef.current?.from?.pathname ?? "/";
      navigate(target, { replace: true });
    },
    [navigate],
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
