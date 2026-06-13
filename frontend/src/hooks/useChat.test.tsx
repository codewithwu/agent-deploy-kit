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
  it("aggregates 3 step events into 1 assistant message with steps.length === 3", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "tool_call", name: "get_weather", args: { city: "San Francisco" } }],
          },
        },
        {
          event: "step",
          data: {
            step: "tools",
            blocks: [{ type: "text", text: "It's always sunny in San Francisco!" }],
          },
        },
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "It's always sunny in San Francisco!" }],
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
    expect(messages).toHaveLength(2);  // user + 1 assistant
    expect(messages[0].role).toBe("user");
    expect(messages[0].pending).toBe(false);

    expect(messages[1].role).toBe("assistant");
    expect(messages[1].steps).toHaveLength(3);
    expect(messages[1].steps?.[0].name).toBe("model");
    expect(messages[1].steps?.[1].name).toBe("tools");
    expect(messages[1].steps?.[2].name).toBe("model");
  });

  it("first tool_call step stores summary in content, blocks in steps[0]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "tool_call", name: "get_weather", args: { city: "San Francisco" } }],
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
    expect(assistant.steps?.[0].blocks).toEqual([
      { type: "tool_call", name: "get_weather", args: { city: "San Francisco" } },
    ]);
  });

  it("later text step overrides content with its own text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "thinking..." }],
          },
        },
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "final answer" }],
          },
        },
        { event: "done", data: {} },
      ]),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hi");
    });

    const msgs = result.current.context.conversations[0].messages;
    expect(msgs[1].content).toBe("final answer");
    expect(msgs[1].steps).toHaveLength(2);
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

  it("first step with text sets content immediately and keeps pending true", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "hello" }],
          },
        },
        { event: "done", data: {} },
      ]),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.context.conversations[0].messages[1];
    expect(assistant.content).toBe("hello");
    expect(assistant.pending).toBe(false);  // done 之后
    expect(assistant.steps).toHaveLength(1);
  });

  it("done flips assistant pending to false but keeps content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "first" }],
          },
        },
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "second" }],
          },
        },
        { event: "done", data: {} },
      ]),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hi");
    });

    const assistant = result.current.context.conversations[0].messages[1];
    expect(assistant.pending).toBe(false);
    expect(assistant.content).toBe("second");
  });

  it("event: error marks assistant pending=false + error=true", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "text", text: "partial" }],
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
    expect(msgs[1].pending).toBe(false);
    expect(msgs[1].error).toBe(true);
    expect(msgs[1].content).toBe("partial");
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

  it("sends only the current user message, no history (stateless agent)", async () => {
    // 第一轮:返回完整三步 SSE,确认前端"看到"了上海天气(仅用于 UI 展示)
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        sseResponse([
          {
            event: "step",
            data: {
              step: "model",
              blocks: [{ type: "tool_call", name: "get_weather", args: { city: "上海" } }],
            },
          },
          {
            event: "step",
            data: {
              step: "tools",
              blocks: [{ type: "text", text: "It's always sunny in 上海!" }],
            },
          },
          { event: "done", data: {} },
        ]),
      )
      // 第二轮:用户问北京,载荷里不应再含"上海"
      .mockResolvedValueOnce(
        sseResponse([
          {
            event: "step",
            data: {
              step: "model",
              blocks: [{ type: "tool_call", name: "get_weather", args: { city: "北京" } }],
            },
          },
          { event: "done", data: {} },
        ]),
      );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("上海的天气如何");
    });
    await act(async () => {
      await result.current.send("北京的天气如何");
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
    expect(firstBody.messages).toEqual([
      { role: "user", content: "上海的天气如何" },
    ]);

    const secondBody = JSON.parse(fetchSpy.mock.calls[1]?.[1]?.body as string);
    // 关键断言:第二轮载荷里只有新的 user 消息,不能含上一轮的 user / assistant 历史
    expect(secondBody.messages).toEqual([
      { role: "user", content: "北京的天气如何" },
    ]);
  });
});
