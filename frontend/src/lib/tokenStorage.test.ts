import { describe, it, expect, beforeEach, vi } from "vitest";
import { tokenStorage } from "./tokenStorage";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("tokenStorage", () => {
  it("returns null when no tokens are stored", () => {
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });

  it("stores and retrieves both tokens", () => {
    tokenStorage.setTokens("access-123", "refresh-456");
    expect(tokenStorage.getAccess()).toBe("access-123");
    expect(tokenStorage.getRefresh()).toBe("refresh-456");
  });

  it("clear() removes both tokens", () => {
    tokenStorage.setTokens("a", "r");
    tokenStorage.clear();
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });

  it("tolerates a corrupted localStorage value", () => {
    localStorage.setItem("adk:access_token:v1", "");
    expect(tokenStorage.getAccess()).toBeNull();
  });
});

describe("expires_in persistence", () => {
  it("returns null when no expires_at stored", () => {
    expect(tokenStorage.getExpiresAt()).toBeNull();
  });

  it("setExpiresIn stores an absolute timestamp ~now+seconds*1000", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T10:00:00Z"));
    tokenStorage.setExpiresIn(900);
    expect(tokenStorage.getExpiresAt()).toBe(
      new Date("2026-06-19T10:15:00Z").getTime(),
    );
  });

  it("clearExpiresIn removes the stored value", () => {
    tokenStorage.setExpiresIn(900);
    tokenStorage.clearExpiresIn();
    expect(tokenStorage.getExpiresAt()).toBeNull();
  });

  it("clear() also clears expires_at", () => {
    tokenStorage.setExpiresIn(900);
    tokenStorage.clear();
    expect(tokenStorage.getExpiresAt()).toBeNull();
  });
});
