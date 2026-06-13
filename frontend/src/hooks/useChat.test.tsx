import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ChatProvider } from "@/context/ChatContext";
import { useChat } from "./useChat";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatProvider>{children}</ChatProvider>;
}

// 构造一个一次性格式化的 SSE Response(streamChat 的下游)
function sseResponse(
  frames: Array<{ event?: string; data: object }>,
): Response {
  const encoder = new TextEncoder();
  const body = frames
    .map((f) => {
      const parts: string[] = [];
      if (f.event) parts.push(`event: ${f.event}`);
      parts.push(`data: ${JSON.stringify(f.data)}`);
      return parts.join("\n") + "\n\n";
    })
    .join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function errorResponse(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useChat.send (streaming)", () => {
  it("streams 3 step events then done, producing 3 assistant messages with step labels", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [
              {
                type: "tool_call",
                name: "get_weather",
                args: { city: "San Francisco" },
              },
            ],
          },
        },
        {
          event: "step",
          data: {
            step: "tools",
            blocks: [
              { type: "text", text: "It's always sunny in San Francisco!" },
            ],
          },
        },
        {
          event: "step",
          data: {
            step: "model",
            blocks: [
              { type: "text", text: "It's always sunny in San Francisco!" },
            ],
          },
        },
        { event: "done", data: {} },
      ]),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("What's the weather in San Francisco?");
    });

    const messages = result.current.context.conversations[0].messages;
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("What's the weather in San Francisco?");
    expect(messages[0].pending).toBe(false);

    expect(messages[1].role).toBe("assistant");
    expect(messages[1].step).toBe("model");

    expect(messages[2].role).toBe("assistant");
    expect(messages[2].step).toBe("tools");

    expect(messages[3].role).toBe("assistant");
    expect(messages[3].step).toBe("model");
  });

  it("renders tool_call step as 占位文字 in content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [
              {
                type: "tool_call",
                name: "get_weather",
                args: { city: "San Francisco" },
              },
            ],
          },
        },
        { event: "done", data: {} },
      ]),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("weather?");
    });

    const assistant = result.current.context.conversations[0].messages[1];
    expect(assistant.content).toBe('调用工具: get_weather({"city":"San Francisco"})');
  });

  it("concatenates text blocks for text step", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "It's always sunny in " }],
          },
        },
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "San Francisco!" }],
          },
        },
        { event: "done", data: {} },
      ]),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("weather?");
    });

    const msgs = result.current.context.conversations[0].messages;
    expect(msgs[1].content).toBe("It's always sunny in ");
    expect(msgs[2].content).toBe("San Francisco!");
  });

  it("marks user message as error on HTTP 400", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      errorResponse(400, "messages must not be empty"),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hi");
    });

    const userMsg = result.current.context.conversations[0].messages[0];
    expect(userMsg.error).toBe(true);
    expect(userMsg.pending).toBe(false);
  });

  it("marks last step message as error on event: error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "thinking..." }],
          },
        },
        { event: "error", data: { detail: "rate limit" } },
      ]),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hi");
    });

    const msgs = result.current.context.conversations[0].messages;
    expect(msgs[0].pending).toBe(false);
    expect(msgs[1].error).toBe(true);
    expect(msgs[1].role).toBe("assistant");
  });

  it("aborts the prior in-flight stream when a new send starts", async () => {
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

  it("ignores empty input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("   ");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.context.conversations).toHaveLength(0);
  });
});
