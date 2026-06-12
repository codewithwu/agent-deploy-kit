import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ChatProvider } from "@/context/ChatContext";
import { useChat } from "./useChat";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatProvider>{children}</ChatProvider>;
}

describe("useChat.send", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns isSending flag that flips true->false across a call", async () => {
    let resolveReply!: (v: string) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveReply = (text: string) =>
            resolve(
              new Response(JSON.stringify({ reply: text }), { status: 200 }),
            );
        }),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.isSending).toBe(false);

    let sendPromise: Promise<void> = Promise.resolve();
    act(() => {
      sendPromise = result.current.send("hello");
    });
    await waitFor(() => expect(result.current.isSending).toBe(true));

    await act(async () => {
      resolveReply("hi back");
      await sendPromise;
    });
    expect(result.current.isSending).toBe(false);
  });

  it("appends user message (pending) and then assistant reply on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: "hi there" }), { status: 200 }),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hello");
    });

    const ctx = result.current.context;
    expect(ctx.conversations).toHaveLength(1);
    const messages = ctx.conversations[0].messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("hello");
    expect(messages[0].pending).toBe(false);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("hi there");
  });

  it("marks user message as error on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "boom" }), { status: 500 }),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hello");
    });

    const msg = result.current.context.conversations[0].messages[0];
    expect(msg.error).toBe(true);
    expect(msg.pending).toBe(false);
  });

  it("ignores empty input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("   ");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.context.conversations).toHaveLength(0);
  });

  it("aborts the prior in-flight request when a new send starts", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        () => new Promise<Response>(() => {}),
      );

    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      void result.current.send("a");
    });
    await waitFor(() => expect(result.current.isSending).toBe(true));
    const firstSignal = fetchSpy.mock.calls[0]?.[1]?.signal as AbortSignal;

    act(() => {
      void result.current.send("b");
    });

    expect(firstSignal.aborted).toBe(true);
  });
});
