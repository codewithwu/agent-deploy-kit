import { describe, it, expect, beforeEach } from "vitest";
import { tokenStorage } from "./tokenStorage";

beforeEach(() => {
  localStorage.clear();
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
