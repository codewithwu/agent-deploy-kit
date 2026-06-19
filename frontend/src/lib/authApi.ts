import { apiFetch } from "./apiClient";
import type {
  RegisterIn,
  RegisterOut,
  LoginIn,
  UserOut,
  LoginOut,
  TokenPairOut,
  VerifyOut,
  ChangePasswordIn,
  DeleteMeIn,
} from "../types/api";

async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const authApi = {
  async register(body: RegisterIn): Promise<RegisterOut> {
    return unwrap<RegisterOut>(
      await apiFetch("/api/auth/register", {
        method: "POST",
        auth: "none",
        body,
      }),
    );
  },
  async login(body: LoginIn): Promise<LoginOut> {
    return unwrap<LoginOut>(
      await apiFetch("/api/auth/login", {
        method: "POST",
        auth: "none",
        body,
      }),
    );
  },
  async logout(): Promise<void> {
    await apiFetch("/api/auth/logout", { method: "POST", auth: "access" });
  },
  async refresh(): Promise<TokenPairOut> {
    return unwrap<TokenPairOut>(
      await apiFetch("/api/auth/refresh", {
        method: "POST",
        auth: "refresh",
      }),
    );
  },
  async verify(): Promise<VerifyOut> {
    return unwrap<VerifyOut>(
      await apiFetch("/api/auth/verify", { method: "GET", auth: "access" }),
    );
  },
  async me(): Promise<UserOut> {
    return unwrap<UserOut>(
      await apiFetch("/api/auth/me", { method: "GET", auth: "access" }),
    );
  },
  async changePassword(body: ChangePasswordIn): Promise<void> {
    await apiFetch("/api/auth/me/password", {
      method: "PATCH",
      auth: "access",
      body,
    });
  },
  async deleteMe(body: DeleteMeIn): Promise<void> {
    await apiFetch("/api/auth/me", {
      method: "DELETE",
      auth: "access",
      body,
    });
  },
};
