import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ChatProvider } from "@/context/ChatContext";
import { useChat } from "./useChat";

// 构造一个可手动分块入队的 SSE Response（复用自 api.test 的思路）。
// 用 Promise resolve 把 controller 暴露给测试,让 push/close 异步生效。
function chunkedSseResponse(): {
  response: Response;
  push: (text: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controllerRef = c;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    push: (text: string) => controllerRef?.enqueue(encoder.encode(text)),
    close: () => controllerRef?.close(),
  };
}

function sseFrame(payload: object): string {
  return `event: step\ndata: ${JSON.stringify(payload)}\n\n`;
}

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

    const messages = result.current.context.conversations[0].messages;
    expect(messages).toHaveLength(1);
    const userMsg = messages[0];
    expect(userMsg.role).toBe("user");
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

  it("removes placeholder assistant message when error arrives before any step", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([{ event: "error", data: { detail: "rate limit" } }]),
    );

    const { result } = renderHook(() => useChat(), { wrapper });
    await act(async () => {
      await result.current.send("hi");
    });

    const msgs = result.current.context.conversations[0].messages;
    // 没有 step,占位 assistant 消息被直接移除,只剩 user 消息
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].pending).toBe(false);
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

  it("keeps the task list visible for at least 500ms (so user sees running steps, not just the final answer)", async () => {
    // 真实场景:本机 LLM 一次完整多步调用在数十毫秒内就完成,React 把所有 setState
    // 合并成一次渲染,用户看到 FinalAnswerView 时任务列表一闪而过甚至完全没出现。
    // 修复点:send 内部需要保证 assistant.pending 在首个 step 到达后,至少保持 500ms
    // 才被 done 翻为 false,这样浏览器才有时间画出 TaskListView。
    const { response, push, close } = chunkedSseResponse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const { result } = renderHook(() => useChat(), { wrapper });
    const sendStart = Date.now();
    act(() => {
      void result.current.send("hi");
    });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    // 推一个 step + done,模拟本地 LLM 极快返回的场景
    push(
      sseFrame({
        step: "model",
        blocks: [{ type: "text", text: "hello" }],
      }),
    );
    push(`event: done\ndata: {}\n\n`);
    close();

    // 等 step 已被处理(消息应当挂上 steps)
    await waitFor(() => {
      const msgs = result.current.context.conversations[0]?.messages ?? [];
      expect(msgs[1]?.steps).toBeDefined();
    });

    // 关键断言:step 到达后,助手消息应当保持 pending=true(steps 已被记录)、
    // 且不能立即被 done 翻为 false——否则浏览器会直接落进 FinalAnswerView 分支,
    // 用户根本看不到 TaskListView。
    const assistant = result.current.context.conversations[0].messages[1];
    expect(assistant.pending).toBe(true);
    expect(assistant.steps).toHaveLength(1);

    // 等到总耗时超过 500ms 再检查,此时 done 才应被处理、pending 才翻为 false
    await waitFor(
      () => {
        const msgs = result.current.context.conversations[0]?.messages ?? [];
        expect(msgs[1]?.pending).toBe(false);
      },
      { timeout: 1500 },
    );
    const totalElapsed = Date.now() - sendStart;
    expect(totalElapsed).toBeGreaterThanOrEqual(500);
  });
});
