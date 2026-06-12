import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postChat, ChatApiError } from "./api";

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("postChat", () => {
  it("returns reply on 200", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "hi there" }), { status: 200 }),
    );
    const reply = await postChat([{ role: "user", content: "hi" }]);
    expect(reply).toBe("hi there");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses VITE_API_BASE when set", async () => {
    vi.stubEnv("VITE_API_BASE", "https://api.example.com");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "ok" }), { status: 200 }),
    );
    await postChat([{ role: "user", content: "x" }]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/chat",
      expect.any(Object),
    );
    vi.unstubAllEnvs();
  });

  it("throws ChatApiError on non-2xx with detail from body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "messages must not be empty" }), {
        status: 400,
      }),
    );
    await expect(
      postChat([{ role: "user", content: "" }]),
    ).rejects.toMatchObject({
      status: 400,
      message: "messages must not be empty",
    });
  });

  it("throws ChatApiError on non-2xx without JSON body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("plain text error", { status: 500 }),
    );
    await expect(
      postChat([{ role: "user", content: "x" }]),
    ).rejects.toBeInstanceOf(ChatApiError);
  });

  it("passes AbortSignal through to fetch", async () => {
    const controller = new AbortController();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "ok" }), { status: 200 }),
    );
    await postChat([{ role: "user", content: "x" }], controller.signal);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
