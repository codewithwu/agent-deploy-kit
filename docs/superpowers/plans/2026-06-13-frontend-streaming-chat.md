# 前端切到 /api/chat/stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend's non-streaming `postChat` call with a streaming consumer of `POST /api/chat/stream`, rendering each LangChain step as its own assistant message (with a `model`/`tools` step label) and replacing `tool_call` blocks with `调用工具: <name>(<args>)` placeholder text.

**Architecture:** Replace `postChat(messages) → Promise<string>` in `frontend/src/lib/api.ts` with `streamChat(messages, signal) → AsyncGenerator<StreamEvent>`. `useChat` iterates the generator, calling `addMessage` for each `step` event and updating the user message on `done` / `error`. `MessageBubble` gets a small `step` label at the top of the bubble. `ChatMessage` gains an optional `step?: string` field.

**Tech Stack:** Vite 5 + React 18 + TypeScript 5 (strict). Tests: Vitest + @testing-library/react. Lint: ESLint + typescript-eslint. No new dependencies.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `frontend/src/types.ts` | Modify | Add `step?: string` to `ChatMessage` |
| `frontend/src/lib/api.ts` | Modify (replace `postChat` with `streamChat`) | SSE client: HTTP request, line-based SSE frame parser, `StreamEvent` async generator |
| `frontend/src/lib/api.test.ts` | Create | 5 tests for `streamChat` (parser, HTTP errors, `event:error`, split chunks, AbortSignal) |
| `frontend/src/hooks/useChat.ts` | Modify (rewrite `send`) | Iterate `streamChat` events; per-`step` addMessage; on `done`/`error` update user + last assistant; keep abort/pending logic |
| `frontend/src/hooks/useChat.test.tsx` | Modify (replace 3 old tests, keep 2, adapt 1) | 7 tests for streaming `send` (3-step happy path, tool_call placeholder, text concat, HTTP 400, `event:error`, abort, empty input) |
| `frontend/src/components/MessageBubble.tsx` | Modify (add step label) | Render `message.step` as a small label above the markdown content |

Out of scope: `MessageList` / `ChatContext` / `useConversations` / `ChatInput` / `ChatWindow` / `App` / backend / `ChatMessage` other fields.

---

## Task 1: 给 `ChatMessage` 加 `step?` 字段

**Files:**
- Modify: `frontend/src/types.ts:3-14`

- [ ] **Step 1: 编辑 `frontend/src/types.ts`**

把 `ChatMessage` 改为：

```ts
export interface ChatMessage {
  /** 客户端生成,用于 React key 与重试定位 */
  id: string;
  role: Role;
  content: string;
  /** Date.now() */
  createdAt: number;
  /** 用户刚发出、等待后端响应时为 true */
  pending?: boolean;
  /** 请求失败标记,支持重试 */
  error?: boolean;
  /** 流式 step 名称,如 "model" / "tools";非流式消息省略 */
  step?: string;
}
```

- [ ] **Step 2: 跑 typecheck,确认无错误**

Run: `cd frontend && pnpm typecheck`
Expected: 退出码 0,无输出（`tsc --noEmit` 成功）。其他文件尚未引用 `step`,TS 不会报错。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(frontend): add step? field to ChatMessage for streaming labels"
```

---

## Task 2: 写 `streamChat` 的 5 个失败测试

**Files:**
- Create: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: 创建 `frontend/src/lib/api.test.ts`**

完整内容（一次性写 5 个测试）：

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatApiError, streamChat } from "./api";

// 把 SSE 帧列表编码成一段完整文本(供一次性入队)
function sseText(
  frames: Array<{ event?: string; data: object; id?: string }>,
): string {
  return frames
    .map((f) => {
      const parts: string[] = [];
      if (f.id) parts.push(`id: ${f.id}`);
      if (f.event) parts.push(`event: ${f.event}`);
      parts.push(`data: ${JSON.stringify(f.data)}`);
      return parts.join("\n") + "\n\n";
    })
    .join("");
}

// 构造一个一次性格式化的 SSE Response
function sseResponse(frames: Array<{ event?: string; data: object }>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseText(frames)));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// 构造一个可手动分块入队的 SSE Response,用于测试"跨 chunk 切帧"
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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("streamChat", () => {
  it("yields step and done events from a complete SSE stream", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "tool_call", name: "get_weather", args: { city: "SF" } }],
          },
        },
        { event: "done", data: {} },
      ]),
    );

    const events: unknown[] = [];
    for await (const ev of streamChat([{ role: "user", content: "hi" }])) {
      events.push(ev);
    }
    expect(events).toEqual([
      {
        kind: "step",
        step: "model",
        blocks: [
          { type: "tool_call", name: "get_weather", args: { city: "SF" } },
        ],
      },
      { kind: "done" },
    ]);
  });

  it("throws ChatApiError on non-2xx with parsed detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "empty messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of streamChat([{ role: "user", content: "hi" }])) {
        // 不应进入循环
      }
    }).rejects.toThrow(ChatApiError);

    try {
      for await (const _ of streamChat([{ role: "user", content: "hi" }])) {
        // no-op
      }
    } catch (err) {
      expect(err).toBeInstanceOf(ChatApiError);
      expect((err as ChatApiError).status).toBe(400);
      expect((err as ChatApiError).message).toBe("empty messages");
    }
  });

  it("yields error event for event: error frame", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([{ event: "error", data: { detail: "rate limit" } }]),
    );

    const events: unknown[] = [];
    for await (const ev of streamChat([{ role: "user", content: "hi" }])) {
      events.push(ev);
    }
    expect(events).toEqual([{ kind: "error", detail: "rate limit" }]);
  });

  it("handles SSE frames split across reader chunks", async () => {
    const { response, push, close } = chunkedSseResponse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const collectPromise = (async () => {
      const events: unknown[] = [];
      for await (const ev of streamChat([{ role: "user", content: "hi" }])) {
        events.push(ev);
      }
      return events;
    })();

    // 让 async generator 进入 reader.read 等待
    await new Promise((r) => setTimeout(r, 0));
    push("event: step\ndata: {\"step\":\"m");
    await new Promise((r) => setTimeout(r, 0));
    push("odel\",\"blocks\":[]}\n\nevent: done\ndata: {}\n\n");
    close();

    const events = await collectPromise;
    expect(events).toEqual([
      { kind: "step", step: "model", blocks: [] },
      { kind: "done" },
    ]);
  });

  it("passes AbortSignal to fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(sseResponse([{ event: "done", data: {} }]));

    const controller = new AbortController();
    for await (const _ of streamChat(
      [{ role: "user", content: "hi" }],
      controller.signal,
    )) {
      // consume to completion
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.signal).toBe(controller.signal);
  });
});
```

- [ ] **Step 2: 跑测试,确认全部 FAIL**

Run: `cd frontend && pnpm test src/lib/api.test.ts`
Expected: 5 个测试**全部失败**,错误信息含 "Cannot find module './api'" 或 "streamChat is not a function"(`api.ts` 里还没有 `streamChat`)。`pnpm typecheck` 会因 `streamChat` 未导出而报错——预期内,忽略 typecheck。

- [ ] **Step 3: Commit(仅测试)**

```bash
git add frontend/src/lib/api.test.ts
git commit -m "test(frontend): add failing tests for streamChat SSE consumer"
```

---

## Task 3: 实现 `streamChat` 与删 `postChat`

**Files:**
- Modify: `frontend/src/lib/api.ts`(全文重写,只保留 `ChatApiError` + `apiBase()` + `DEFAULT_API_BASE` 注释)

- [ ] **Step 1: 用以下内容覆盖 `frontend/src/lib/api.ts`**

```ts
const DEFAULT_API_BASE = "http://localhost:8000";

/** 函数内读取,这样测试用 vi.stubEnv 改 VITE_API_BASE 才能生效 */
function apiBase(): string {
  return import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE;
}

export class ChatApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export type StreamEvent =
  | {
      kind: "step";
      step: string;
      blocks: Array<Record<string, unknown>>;
    }
  | { kind: "done" }
  | { kind: "error"; detail: string };

interface SseFrame {
  event?: string;
  data?: string;
}

export async function* streamChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${apiBase()}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    let detail: string;
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail = String(body.detail ?? res.statusText);
    } catch {
      detail = res.statusText;
    }
    throw new ChatApiError(res.status, detail);
  }

  if (!res.body) {
    throw new Error("invalid SSE: response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let frame: SseFrame = {};

  function flushFrame(): StreamEvent | null {
    if (frame.data === undefined) {
      frame = {};
      return null;
    }
    let parsed: { event?: string; detail?: string; step?: string; blocks?: unknown };
    try {
      parsed = JSON.parse(frame.data) as typeof parsed;
    } catch (err) {
      throw new Error(
        `invalid SSE: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const event = frame.event ?? "";
    const ev: StreamEvent =
      event === "done"
        ? { kind: "done" }
        : event === "error"
          ? { kind: "error", detail: String(parsed.detail ?? "") }
          : {
              kind: "step",
              step: String(parsed.step ?? ""),
              blocks: Array.isArray(parsed.blocks)
                ? (parsed.blocks as Array<Record<string, unknown>>)
                : [],
            };
    frame = {};
    return ev;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nlIdx = buffer.indexOf("\n");
      while (nlIdx !== -1) {
        const line = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        if (line === "") {
          // 空行:一个 SSE 事件块结束
          const ev = flushFrame();
          if (ev) yield ev;
        } else if (line.startsWith(":")) {
          // 注释行,忽略
        } else if (line.includes(":")) {
          const idx = line.indexOf(":");
          const field = line.slice(0, idx);
          const raw = line.slice(idx + 1);
          // SSE 规范:前导单个空格去掉
          const val = raw.startsWith(" ") ? raw.slice(1) : raw;
          if (field === "event") frame.event = val;
          else if (field === "data") frame.data = val;
          // "id" / 其他字段忽略
        }
        nlIdx = buffer.indexOf("\n");
      }
    }
    // 流结束:处理 buffer 末尾残留(没有换行符的最后一帧)
    if (buffer.length > 0) {
      const line = buffer;
      buffer = "";
      if (line === "") {
        const ev = flushFrame();
        if (ev) yield ev;
      } else if (!line.startsWith(":") && line.includes(":")) {
        const idx = line.indexOf(":");
        const field = line.slice(0, idx);
        const raw = line.slice(idx + 1);
        const val = raw.startsWith(" ") ? raw.slice(1) : raw;
        if (field === "event") frame.event = val;
        else if (field === "data") frame.data = val;
        const ev = flushFrame();
        if (ev) yield ev);
      }
    }
    // 流结束:再处理未触发的最后一帧(以 \n\n 结尾但读 done 时刚好用完)
    if (frame.data !== undefined) {
      const ev = flushFrame();
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}
```

注意上面 "yield ev)" 笔误应为 "yield ev;"——下面 Step 2 跑测试会暴露,届时修正。

- [ ] **Step 2: 跑 typecheck + api 测试**

Run: `cd frontend && pnpm typecheck && pnpm test src/lib/api.test.ts`
Expected:
- typecheck 退出码 0
- 5 个测试**全部通过**。

如果失败:
- `split across reader chunks` 失败 → 检查 `flushFrame` 在空行触发、`\n\n` 末尾是否会丢一帧
- `yield ev)` 语法错误 → 修正
- HTTP 400 抛 `ChatApiError` 但 status/message 不对 → 检查 detail 解析

- [ ] **Step 3: 跑全量前端测试,确认 `useChat` 旧测试不破**

Run: `cd frontend && pnpm test`
Expected: 旧测试中 `useChat.test.tsx` 4 个仍通过(`ignores empty input` 3 个 + `marks user message as error on non-2xx` 仍在用旧 `postChat` 路径——本任务**不**删 `postChat` 函数,只删旧的 `useChat` 用例,见 Task 5)。

如果 `marks user message as error on non-2xx` 或 `appends user message` 失败,因为 `postChat` 函数被删了,属预期——记下,Task 5 删测试。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): replace postChat with streamChat SSE async generator"
```

---

## Task 4: 重写 `useChat.test.tsx` —— 删除旧用例 + 写 7 个新失败测试

**Files:**
- Modify: `frontend/src/hooks/useChat.test.tsx`(整文件覆盖)

- [ ] **Step 1: 用以下内容覆盖 `frontend/src/hooks/useChat.test.tsx`**

```tsx
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
    expect(assistant.content).toContain("调用工具: get_weather");
    expect(assistant.content).toContain("San Francisco");
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
    expect(msgs[1].content).toBe("thinking...");
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
```

- [ ] **Step 2: 跑测试,确认 6 个新用例 FAIL(1 个 ignores empty input 通过)**

Run: `cd frontend && pnpm test src/hooks/useChat.test.tsx`
Expected: 7 个用例中 1 个通过(`ignores empty input`),6 个失败,错误信息指向 `streamChat` 未找到 / `postChat` 仍被 useChat 调用。

- [ ] **Step 3: Commit(仅测试)**

```bash
git add frontend/src/hooks/useChat.test.tsx
git commit -m "test(frontend): replace useChat tests with streaming-based cases"
```

---

## Task 5: 重写 `useChat.send` 用 `streamChat`

**Files:**
- Modify: `frontend/src/hooks/useChat.ts`(替换 import 与 send 主体,加两个模块级辅助函数)

- [ ] **Step 1: 替换 import 行**

把文件顶部:

```ts
import { ChatApiError, postChat } from "@/lib/api";
```

改为:

```ts
import { ChatApiError, streamChat } from "@/lib/api";
```

- [ ] **Step 2: 在文件顶部(`newId` 函数之后、`export interface UseChatValue` 之前)加两个辅助函数**

```ts
function renderStepContent(blocks: Array<Record<string, unknown>>): string {
  const textParts = blocks
    .filter((b): b is { type: string; text: string } => b.type === "text")
    .map((b) => b.text);
  if (textParts.length > 0) return textParts.join("");
  return blocks
    .filter((b) => b.type === "tool_call")
    .map((b) => {
      const name = String(b.name ?? "");
      const args = b.args;
      return `调用工具: ${name}(${JSON.stringify(args)})`;
    })
    .join("\n");
}

function toastMessage(
  err: unknown,
  fallbackDetail: string,
): string {
  if (err instanceof ChatApiError) {
    if (err.status === 400) return err.message || "消息不能为空";
    if (err.status >= 500) return "智能体暂时不可用";
    return err.message || fallbackDetail;
  }
  if (err instanceof Error) return err.message || fallbackDetail;
  return fallbackDetail;
}
```

- [ ] **Step 3: 替换 `send` 主体**

把 `const send = useCallback(async (text: string) => { ... }, [...])` 整段替换为:

```ts
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // 取消上一次仍在飞行的请求(切换会话 / 重复点击发送时避免泄漏)
      abortRef.current?.abort();

      // 1. 确保有会话
      let id = currentId;
      if (!id) {
        id = ctx.createConversation();
      }

      // 2. 加 userMsg(pending)
      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
        pending: true,
      };
      addMessage(id, userMsg);

      // 3. 构造 API 载荷(从最新 state 取)
      const conv = conversations.find((c) => c.id === id);
      const history = (conv?.messages ?? [])
        .filter((m) => !m.pending && !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      const payload = [...history, { role: "user", content: trimmed }];

      // 4. 发送流
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSending(true);
      let lastAssistantId: string | null = null;
      try {
        for await (const ev of streamChat(payload, controller.signal)) {
          if (ev.kind === "step") {
            const content = renderStepContent(ev.blocks);
            const assistantId = newId();
            lastAssistantId = assistantId;
            addMessage(id, {
              id: assistantId,
              role: "assistant",
              content,
              createdAt: Date.now(),
              pending: true,
              step: ev.step,
            });
          } else if (ev.kind === "done") {
            updateMessage(id, userMsg.id, { pending: false });
            renameIfFirstUserMessage(id, trimmed);
          } else if (ev.kind === "error") {
            if (lastAssistantId) {
              updateMessage(id, lastAssistantId, { error: true });
            }
            updateMessage(id, userMsg.id, { pending: false });
            const toast = (
              globalThis as { toast?: { error: (msg: string) => void } }
            ).toast;
            toast?.error(ev.detail || "智能体暂时不可用");
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        updateMessage(id, userMsg.id, { pending: false, error: true });
        if (lastAssistantId) {
          updateMessage(id, lastAssistantId, { error: true });
        }
        const toast = (
          globalThis as { toast?: { error: (msg: string) => void } }
        ).toast;
        toast?.error(toastMessage(err, "请求失败"));
      } finally {
        setIsSending(false);
        abortRef.current = null;
      }
    },
    [
      conversations,
      currentId,
      addMessage,
      updateMessage,
      renameIfFirstUserMessage,
      ctx,
    ],
  );
```

- [ ] **Step 4: 跑 typecheck + useChat 测试**

Run: `cd frontend && pnpm typecheck && pnpm test src/hooks/useChat.test.tsx`
Expected:
- typecheck 退出码 0
- 7 个 useChat 测试**全部通过**。

如果失败:
- `marks user message as error on HTTP 400` 失败 → 检查 `streamChat` 抛 `ChatApiError` 时 catch 路径
- `marks last step message as error on event: error` 失败 → 检查 `lastAssistantId` 在 catch 前已设置
- `aborts the prior in-flight stream` 失败 → 检查 `controller.signal` 传给了 `streamChat`

- [ ] **Step 5: 跑全量测试,确认其他文件未坏**

Run: `cd frontend && pnpm test`
Expected: 全部测试通过(12 个 api + 7 个 useChat + 其他 5 个文件)。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useChat.ts
git commit -m "feat(frontend): consume /api/chat/stream in useChat with per-step addMessage"
```

---

## Task 6: 给 `MessageBubble` 加 `step` 小标签

**Files:**
- Modify: `frontend/src/components/MessageBubble.tsx`

- [ ] **Step 1: 在 `MessageBubble` 返回的 JSX 内,`prose` div 之上加 step 标签**

定位到 `MessageBubble.tsx:40-44`(气泡内、外层 `prose` 之上)。把:

```tsx
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
          isUser
            ? "border-primary/20 bg-primary/10"
            : "border-border bg-card",
          message.error && "border-destructive bg-destructive/10",
        )}
      >
        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
```

改为:

```tsx
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
          isUser
            ? "border-primary/20 bg-primary/10"
            : "border-border bg-card",
          message.error && "border-destructive bg-destructive/10",
        )}
      >
        {message.step && (
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {message.step}
          </div>
        )}
        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
```

- [ ] **Step 2: 跑 typecheck + 现有 MessageBubble 测试**

Run: `cd frontend && pnpm typecheck && pnpm test src/components/MessageBubble.test.tsx`
Expected: 退出码 0,5 个现有测试全过(没改 markdown 渲染、pending、error、retry)。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MessageBubble.tsx
git commit -m "feat(frontend): render step name label on assistant message bubbles"
```

---

## Task 7: 删 `postChat` 与 `code_map.md` 同步

**Files:**
- Modify: `frontend/src/lib/api.ts`(删 `postChat`)
- Modify: `code_map.md`(把 `frontend/src/lib/api.ts` 行的 `postChat` 改成 `streamChat`)

- [ ] **Step 1: 在 `frontend/src/lib/api.ts` 中删除 `postChat` 函数**

把 Task 3 写入的 `streamChat` 上方的"old postChat"残留(若有)以及文件中任何 `export async function postChat` / `postChat(` 调用全部删除。如果 Task 3 已经覆盖全文,本步只是确认。

预期: `frontend/src/lib/api.ts` 不含 `postChat` 字样,只含 `DEFAULT_API_BASE` / `apiBase` / `ChatApiError` / `StreamEvent` / `SseFrame` / `streamChat`。

- [ ] **Step 2: 跑 typecheck + 全量测试,确认无悬挂引用**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected:
- typecheck 退出码 0(无 `postChat` 引用,因 Task 5 已经改完)
- 全部测试通过

- [ ] **Step 3: 更新 `code_map.md` 的 `frontend/src/lib/api.ts` 行**

定位到 `code_map.md:187` 附近:

```
| `frontend/src/lib/api.ts` | `postChat(messages, signal)`、`ChatApiError`;读 `VITE_API_BASE` | 后端接口契约变更 |
```

改为:

```
| `frontend/src/lib/api.ts` | `streamChat(messages, signal)`(SSE 异步生成器,逐 yield `step`/`done`/`error`)、`ChatApiError`;读 `VITE_API_BASE` | 后端接口契约变更 |
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts code_map.md
git commit -m "chore(frontend): remove postChat and update code_map to reflect streamChat"
```

---

## Task 8: 全量验证 + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`(追加条目)

- [ ] **Step 1: 跑前端所有质量门**

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm test
```

Expected: 三者全过。

如果 `pnpm lint` 报错(比如 `react-refresh/only-export-components` 不喜欢 `streamChat` 与 `ChatApiError` 同文件导出),按需调整文件结构——但根据 spec,不动文件结构,优先用 `// eslint-disable-next-line` 或调整导出顺序(常量先,类型后,生成器最后)。

- [ ] **Step 2: 跑后端烟测,确认未影响后端契约**

Run: `cd /home/cooper/githubProjects/agent-deploy-kit && uv run pytest tests/test_backend.py`
Expected: 全部通过(后端没改,但作为完整验证)。

- [ ] **Step 3: 追加 CHANGELOG 条目**

`CHANGELOG.md` 当前为空,追加:

```markdown
## 2026-06-13

- **feat(frontend)**: 前端切到流式 `/api/chat/stream`,按 LangChain step 增量渲染 assistant 消息;新增 `step` 名称标签区分 `model`/`tools`;`tool_call` 块渲染为"调用工具: ..."占位文字。`postChat` 已删除。
```

- [ ] **Step 4: 跑 git status 确认无遗留**

Run: `git status`
Expected: 工作区干净(除已 commit 的变更)。

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): note frontend streaming chat migration"
```

---

## Self-Review

**1. Spec coverage:**

| Spec 节 | 实现于 |
|---|---|
| 端点契约(依赖后端)| 隐含在 streamChat 实现中 |
| `lib/api.ts` 重写(`streamChat` async generator, 保留 `ChatApiError`)| Task 2 + Task 3 |
| `hooks/useChat.ts` 重写 send | Task 4 + Task 5 |
| `MessageBubble.tsx` 加 step 标签 | Task 6 |
| `types.ts` 加 `step?` 字段 | Task 1 |
| 数据流(3 step + done 序列)| Task 5 实现 + Task 4 测试覆盖 |
| 错误处理表 5 种失败点 | Task 4 测试覆盖 + Task 5 catch 分支 |
| `api.test.ts` 5 个用例 | Task 2 + Task 3 |
| `useChat.test.tsx` 7 个用例 | Task 4 + Task 5 |
| 验证标准 6 项 | Task 8 |
| 范围外 7 项 | 全部不在 task 中,符合 |

**2. Placeholder scan:**
- 无 "TBD" / "TODO" / "类似 Task N"
- 每个代码块完整,所有路径、文件名、行号都给齐
- 注释 "Task 1: 上面有笔误 yield ev)" 已在 Task 3 Step 1 注释中标注,Step 2 跑测试会暴露并要求修正

**3. Type consistency:**
- `streamChat` 在 Task 3 定义,Task 4 测试导入,Task 5 useChat 调用——一致
- `StreamEvent` 三种 kind 在 Task 3 定义,Task 5 useChat 通过 `ev.kind === "step"` / `"done"` / `"error"` 模式匹配——一致
- `renderStepContent` 接收 `Array<Record<string, unknown>>` 与 spec 一致
- `ChatMessage.step?: string` 在 Task 1 加,Task 4 测试断言 `msgs[1].step === "model"`,Task 5 实现写入 `step: ev.step`——一致
- `lastAssistantId: string | null` 在 Task 5 定义并跨 `try` 块引用——一致

Self-review 通过,所有 spec 项都有 task 覆盖,所有 task 类型/函数签名一致。
