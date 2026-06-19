const ACCESS_KEY = "adk:access_token:v1";
const REFRESH_KEY = "adk:refresh_token:v1";
const EXPIRES_KEY = "adk:expires_at:v1";

function read(key: string): string | null {
  const v = localStorage.getItem(key);
  return v && v.length > 0 ? v : null;
}

export const tokenStorage = {
  getAccess(): string | null {
    return read(ACCESS_KEY);
  },
  getRefresh(): string | null {
    return read(REFRESH_KEY);
  },
  setTokens(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  setExpiresIn(seconds: number): void {
    localStorage.setItem(EXPIRES_KEY, String(Date.now() + seconds * 1000));
  },
  getExpiresAt(): number | null {
    const v = localStorage.getItem(EXPIRES_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  },
  clearExpiresIn(): void {
    localStorage.removeItem(EXPIRES_KEY);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  },
};
