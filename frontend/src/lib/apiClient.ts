import { tokenStorage } from "./tokenStorage";
import { authEvents } from "./authEvents";
import { ApiError } from "../types/api";

export { ApiError };

const DEFAULT_API_BASE = "http://localhost:8000";

function apiBase(): string {
  const v = import.meta.env.VITE_API_BASE;
  return v && v.length > 0 ? v : DEFAULT_API_BASE;
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: "access" | "refresh" | "none";
}

// refresh 单例:并发 401 共享同一 Promise
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = tokenStorage.getRefresh();
  if (!refresh) return null;
  try {
    const res = await fetch(`${apiBase()}/api/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refresh}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
    };
    tokenStorage.setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

function pickToken(auth: "access" | "refresh" | "none"): string | null {
  if (auth === "none") return null;
  return auth === "access"
    ? tokenStorage.getAccess()
    : tokenStorage.getRefresh();
}

async function parseError(res: Response): Promise<ApiError> {
  // clone 以便 body 可被后续读取(204 跳过)
  let body: { detail?: string; errors?: Array<{ loc: string[]; msg: string }> } = {};
  try {
    body = (await res.clone().json()) as typeof body;
  } catch {
    // 忽略,fallback 到 statusText
  }
  return new ApiError(res.status, body.detail ?? res.statusText, body.errors);
}

export async function apiFetch(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<Response> {
  const { body, auth = "access", headers, ...rest } = opts;
  const url = `${apiBase()}${path}`;

  const buildInit = (token: string | null): RequestInit => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return {
      ...rest,
      method: rest.method ?? "GET",
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
  };

  let res = await fetch(url, buildInit(pickToken(auth)));

  if (res.status !== 401 || auth !== "access") {
    if (!res.ok && res.status !== 204) {
      throw await parseError(res);
    }
    return res;
  }

  // 401 + access: 走 refresh 流程
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  const newAccess = await refreshing;
  if (!newAccess) {
    tokenStorage.clear();
    authEvents.emit("logout");
    throw new ApiError(401, "会话已过期,请重新登录");
  }

  res = await fetch(url, buildInit(newAccess));
  if (!res.ok && res.status !== 204) {
    throw await parseError(res);
  }
  return res;
}
