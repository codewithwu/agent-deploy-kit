const ACCESS_KEY = "adk:access_token:v1";
const REFRESH_KEY = "adk:refresh_token:v1";

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
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
