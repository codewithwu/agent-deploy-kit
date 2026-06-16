import { describe, it, expect, vi } from "vitest";
import { authEvents } from "./authEvents";

describe("authEvents", () => {
  it("calls subscribed handler on emit", () => {
    const handler = vi.fn();
    authEvents.on("logout", handler);
    authEvents.emit("logout");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns unsubscribe function that detaches handler", () => {
    const handler = vi.fn();
    const off = authEvents.on("logout", handler);
    off();
    authEvents.emit("logout");
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    authEvents.on("logout", a);
    authEvents.on("logout", b);
    authEvents.emit("logout");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
