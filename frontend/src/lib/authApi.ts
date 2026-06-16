import { apiFetch } from "./apiClient";

// 类型与后端 backend/auth/schemas.py 对齐
export interface RegisterIn {
  username: string;
  email: string;
  password: string;
}
export interface RegisterOut {
  user_id: number;
  username: string;
  email: string;
  role: "user" | "admin";
}

export interface LoginIn {
  username: string;
  password: string;
}
export interface UserOut {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
}
export interface LoginOut {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: UserOut;
}

export interface TokenPairOut {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface VerifyOut {
  valid: true;
  user: UserOut;
}

export interface ChangePasswordIn {
  old_password: string;
  new_password: string;
}

export interface DeleteMeIn {
  password: string;
}

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
