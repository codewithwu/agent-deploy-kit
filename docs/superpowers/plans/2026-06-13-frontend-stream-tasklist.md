# 前端流式交互：运行中任务列表 + 完成态单气泡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse each agent turn into a single assistant message that carries its full step list. While the stream is open, render a timeline-style task list (参照 `done.png`); on `done`, swap to a single final-answer bubble (参照 `running.png`). Step descriptions come from a front-end static map. No backend changes.

**Architecture:** Replace `ChatMessage.step?: string` (single step name) with `ChatMessage.steps?: AssistantStep[]` (full step list per turn). Split `useChat`'s private `renderStepContent` into two named pure functions in `lib/stepContent.ts` (`extractText`, `toolSummary`); add `lib/stepDescription.ts` with a static step→description mapper. Rewrite `useChat.send` to create ONE assistant message on the first `step` event and append subsequent steps to it (tracked via a local ref to avoid stale-closure bugs). Rewrite `MessageBubble` with three branches: error (existing), running-task-list (new), and final-answer (existing markdown).

**Tech Stack:** Vite 5 + React 18 + TypeScript 5 (strict). Tests: Vitest + @testing-library/react. Lint: ESLint + typescript-eslint. Tailwind 3.4 (built-in `animate-pulse` — no CSS additions). No new dependencies.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `frontend/src/types.ts` | Modify | Add `AssistantStep`; replace `ChatMessage.step?` with `steps?: AssistantStep[]` |
| `frontend/src/lib/stepContent.ts` | Create | `extractText(blocks)` + `toolSummary(blocks)` — pure helpers, lifted from useChat |
| `frontend/src/lib/stepContent.test.ts` | Create | 6 tests for the two helpers |
| `frontend/src/lib/stepDescription.ts` | Create | `describeStep(step)` — static step→中文 mapper |
| `frontend/src/lib/stepDescription.test.ts` | Create | 6 tests for the mapper |
| `frontend/src/hooks/useChat.ts` | Modify (rewrite `send`) | Track in-flight assistant via `assistantRef`; first step creates msg, later steps append |
| `frontend/src/hooks/useChat.test.tsx` | Modify (replace 3 tests, keep 4, add 3) | 10 tests for aggregation + error paths + abort |
| `frontend/src/components/MessageBubble.tsx` | Modify (3-way branch) | Render task list (pending+steps) / final answer (steps+!pending) / error (error) |
| `frontend/src/components/MessageBubble.test.tsx` | Modify (add 3 tests) | Tests for task list rendering, final answer markdown, error state |

Out of scope: `MessageList` / `ChatContext` / `useConversations` / `ChatInput` / `ChatWindow` / `App` / `Sidebar` / `EmptyState` / `api.ts` / `storage.ts` / `utils.ts` / `index.css` / backend / `package.json`.

Reused utilities (no changes): `cn()` from `lib/utils.ts`, `Button` from `components/ui/button.tsx`, the `sseResponse()` / `errorResponse()` helpers in `useChat.test.tsx`.

---

## Task 1: 更新 `types.ts` — 加 `AssistantStep`，替换 `step?` 为 `steps?: AssistantStep[]`

**Files:**
- Modify: `frontend/src/types.ts:1-16`

- [ ] **Step 1: 编辑 `frontend/src/types.ts`**

完整替换现有文件内容为：

```ts
export type Role = "user" | "assistant";

/** 单个 SSE step 的原始数据(从前端视角聚合)。 */
export interface AssistantStep {
  /** LangChain step 名,如 "model" / "tools" */
  name: string;
  /** 该 step 的原始 content blocks */
  blocks: Array<Record<string, unknown>>;
}

export interface ChatMessage {
  /** 客户端生成,用于 React key 与重试定位 */
  id: string;
  role: Role;
  /** Markdown 文本。assistant 上等于"最后一个含 text 的 step"的拼接文本;无 text 时为该 step 的 tool_call 摘要。 */
  content: string;
  /** Date.now() */
  createdAt: number;
  /** 用户刚发出、等待后端响应时为 true */
  pending?: boolean;
  /** 请求失败标记,支持重试 */
  error?: boolean;
  /** assistant 专用:本轮所有 step。第一次 step 事件后即存在,旧消息无此字段视为非流式。 */
  steps?: AssistantStep[];
}

export interface Conversation {
  /** uuid */
  id: string;
  /** 首条用户消息前 30 字;可在侧边栏重命名 */
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: 跑 typecheck 确认无错误**

Run: `cd frontend && pnpm typecheck`
Expected: 退出码 0,无输出。其他文件尚未引用 `AssistantStep` 或 `steps`,旧 `step?` 引用现在会变 `error TS2339: Property 'step' does not exist` —— 这是预期的,后续任务一起修。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(frontend): replace ChatMessage.step with steps[] for aggregation"
```

---

## Task 2: 新增 `lib/stepContent.ts` —— `extractText` + `toolSummary`（TDD）

**Files:**
- Create: `frontend/src/lib/stepContent.test.ts`
- Create: `frontend/src/lib/stepContent.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/stepContent.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { extractText, toolSummary } from "./stepContent";

describe("extractText", () => {
  it("concatenates multiple text blocks", () => {
    expect(
      extractText([
        { type: "text", text: "hello " },
        { type: "text", text: "world" },
      ]),
    ).toBe("hello world");
  });

  it("ignores tool_call blocks", () => {
    expect(
      extractText([
        { type: "text", text: "answer" },
        { type: "tool_call", name: "x", args: {} },
      ]),
    ).toBe("answer");
  });

  it("returns empty string when no text blocks", () => {
    expect(extractText([{ type: "tool_call", name: "x", args: {} }])).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(extractText([])).toBe("");
  });
});

describe("toolSummary", () => {
  it("formats single tool_call", () => {
    expect(
      toolSummary([
        { type: "tool_call", name: "get_weather", args: { city: "SF" } },
      ]),
    ).toBe('调用工具: get_weather({"city":"SF"})');
  });

  it("joins multiple tool_calls with newline", () => {
    expect(
      toolSummary([
        { type: "tool_call", name: "a", args: {} },
        { type: "tool_call", name: "b", args: { x: 1 } },
      ]),
    ).toBe('调用工具: a({})\n调用工具: b({"x":1})');
  });

  it("returns empty string when no tool_call", () => {
    expect(toolSummary([{ type: "text", text: "x" }])).toBe("");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && pnpm test src/lib/stepContent.test.ts`
Expected: FAIL — `Failed to resolve import "./stepContent"`。

- [ ] **Step 3: 实现**

创建 `frontend/src/lib/stepContent.ts`：

```ts
/** 拼接 blocks 里所有 type==="text" 的 text 字段;无 text 返回 ""。 */
export function extractText(blocks: Array<Record<string, unknown>>): string {
  return blocks
    .filter((b): b is { type: string; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** 把 tool_call 块渲染为占位字符串,多块用 "\n" 分隔;无 tool_call 返回 ""。 */
export function toolSummary(blocks: Array<Record<string, unknown>>): string {
  return blocks
    .filter((b) => b.type === "tool_call")
    .map((b) => {
      const name = String(b.name ?? "");
      const args = b.args;
      return `调用工具: ${name}(${JSON.stringify(args)})`;
    })
    .join("\n");
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && pnpm test src/lib/stepContent.test.ts`
Expected: 6 个用例全部通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/stepContent.ts frontend/src/lib/stepContent.test.ts
git commit -m "feat(frontend): add stepContent helpers extractText and toolSummary"
```

---

## Task 3: 新增 `lib/stepDescription.ts` —— `describeStep`（TDD）

**Files:**
- Create: `frontend/src/lib/stepDescription.test.ts`
- Create: `frontend/src/lib/stepDescription.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/stepDescription.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { describeStep } from "./stepDescription";
import type { AssistantStep } from "@/types";

function step(
  name: string,
  blocks: Array<Record<string, unknown>>,
): AssistantStep {
  return { name, blocks };
}

describe("describeStep", () => {
  it("tools step with tool_call shows tool name", () => {
    expect(
      describeStep(step("tools", [{ type: "tool_call", name: "get_weather", args: {} }])),
    ).toBe("正在调用 get_weather…");
  });

  it("tools step without tool_call shows generic text", () => {
    expect(describeStep(step("tools", []))).toBe("正在执行工具…");
  });

  it("model step with text shows generating reply", () => {
    expect(
      describeStep(step("model", [{ type: "text", text: "hi" }])),
    ).toBe("正在生成回复…");
  });

  it("model step with only tool_call shows preparing tool", () => {
    expect(
      describeStep(step("model", [{ type: "tool_call", name: "get_weather", args: {} }])),
    ).toBe("正在准备调用 get_weather…");
  });

  it("model step with no blocks shows thinking", () => {
    expect(describeStep(step("model", []))).toBe("正在思考…");
  });

  it("unknown step name shows generic execution", () => {
    expect(describeStep(step("custom", []))).toBe("执行 custom…");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && pnpm test src/lib/stepDescription.test.ts`
Expected: FAIL — `Failed to resolve import "./stepDescription"`。

- [ ] **Step 3: 实现**

创建 `frontend/src/lib/stepDescription.ts`：

```ts
import type { AssistantStep } from "@/types";

function findToolCall(step: AssistantStep): { name: string } | null {
  for (const b of step.blocks) {
    if (b.type === "tool_call") {
      return { name: String(b.name ?? "") };
    }
  }
  return null;
}

function hasText(step: AssistantStep): boolean {
  return step.blocks.some((b) => b.type === "text");
}

/** 把 LangChain step + blocks 翻译成给用户看的中文描述。 */
export function describeStep(step: AssistantStep): string {
  if (step.name === "tools") {
    const tc = findToolCall(step);
    return tc ? `正在调用 ${tc.name}…` : "正在执行工具…";
  }
  if (step.name === "model") {
    if (hasText(step)) return "正在生成回复…";
    const tc = findToolCall(step);
    return tc ? `正在准备调用 ${tc.name}…` : "正在思考…";
  }
  return `执行 ${step.name}…`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && pnpm test src/lib/stepDescription.test.ts`
Expected: 6 个用例全部通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/stepDescription.ts frontend/src/lib/stepDescription.test.ts
git commit -m "feat(frontend): add describeStep for static step-to-Chinese mapping"
```

---

## Task 4: 重写 `useChat.send` —— 聚合 step 到一条 assistant 消息（TDD）

**Files:**
- Modify: `frontend/src/hooks/useChat.ts:1-148` (full rewrite of the file's send logic)
- Modify: `frontend/src/hooks/useChat.test.tsx` (replace 3 streaming tests, keep 4, add 3)

**注**：`useChat.ts` 当前导出的是函数 + 几个私有 helper。本任务整体重写文件内容；保留 `newId()` / `toastError()` / `toastMessage()` 三个 helper,移除 `renderStepContent()`。

- [ ] **Step 1: 替换 `useChat.test.tsx` 的 3 个流式用例 + 新增 3 个**

打开 `frontend/src/hooks/useChat.test.tsx`,定位到 `describe("useChat.send (streaming)", ...)` 块。把其中的三个用例替换为：

```tsx
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
```

在这三个用例**之后**追加 3 个新用例（保留所有原有非流式用例）：

```tsx
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && pnpm test src/hooks/useChat.test.tsx`
Expected: 失败信息指向 useChat 的当前 send 实现 — `expect(messages).toHaveLength(2)` 拿到 4,或 `expect(assistant.steps).toHaveLength(3)` 拿到 undefined。

- [ ] **Step 3: 重写 `frontend/src/hooks/useChat.ts`**

完整替换文件内容为：

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatApiError, streamChat } from "@/lib/api";
import { useChatContext } from "@/context/ChatContext";
import { extractText, toolSummary } from "@/lib/stepContent";
import type { AssistantStep, ChatMessage } from "@/types";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toastError(msg: string): void {
  const toast = (
    globalThis as { toast?: { error: (m: string) => void } }
  ).toast;
  toast?.error(msg);
}

// 把任意异常翻译成展示给用户的 toast 文案
function toastMessage(err: unknown, fallbackDetail: string): string {
  if (err instanceof ChatApiError) {
    if (err.status === 400) return err.message || "消息不能为空";
    if (err.status >= 500) return "智能体暂时不可用";
    return err.message || fallbackDetail;
  }
  if (err instanceof Error) return err.message || fallbackDetail;
  return fallbackDetail;
}

export interface UseChatValue {
  send: (text: string) => Promise<void>;
  isSending: boolean;
  /** 把 context 一并暴露,方便测试断言 */
  context: ReturnType<typeof useChatContext>;
}

export function useChat(): UseChatValue {
  const ctx = useChatContext();
  const { currentId, addMessage, updateMessage, renameIfFirstUserMessage } =
    ctx;
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // 流循环内不能依赖 useCallback 闭包里的 ctx.conversations(可能读到旧值),
  // 用 ref 跟踪当前 assistant 消息的 steps,避免后续 step 追加时丢上下文。
  // 必须在组件顶层声明(useRef 是 hook,不能在 useCallback 里调用)。
  const assistantRef = useRef<{ steps: AssistantStep[]; content: string } | null>(null);

  // 组件卸载时取消尚未完成的请求
  useEffect(() => () => abortRef.current?.abort(), []);

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

      // 3. 构造 API 载荷。智能体本身无状态、无记忆,本地上下文仅用于 UI 展示,
      //    发往后端的载荷每轮只含当前 user 消息,避免历史干扰 LLM 决策。
      const payload = [{ role: "user", content: trimmed }];

      // 4. 发送流
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSending(true);
      let assistantId: string | null = null;
      // 重置 ref,避免上一轮 send 残留影响本轮
      assistantRef.current = null;
      try {
        for await (const ev of streamChat(payload, controller.signal)) {
          if (ev.kind === "step") {
            if (assistantId === null) {
              assistantId = newId();
              const initContent = extractText(ev.blocks) || toolSummary(ev.blocks);
              assistantRef.current = {
                steps: [{ name: ev.step, blocks: ev.blocks }],
                content: initContent,
              };
              addMessage(id, {
                id: assistantId,
                role: "assistant",
                content: initContent,
                createdAt: Date.now(),
                pending: true,
                steps: assistantRef.current.steps,
              });
            } else {
              const newContent =
                extractText(ev.blocks) || assistantRef.current?.content || "";
              const newSteps = [
                ...(assistantRef.current?.steps ?? []),
                { name: ev.step, blocks: ev.blocks },
              ];
              assistantRef.current = { steps: newSteps, content: newContent };
              updateMessage(id, assistantId, {
                content: newContent,
                steps: newSteps,
              });
            }
          } else if (ev.kind === "done") {
            if (assistantId) {
              updateMessage(id, assistantId, { pending: false });
            }
            updateMessage(id, userMsg.id, { pending: false });
            renameIfFirstUserMessage(id, trimmed);
          } else if (ev.kind === "error") {
            if (assistantId) {
              updateMessage(id, assistantId, { pending: false, error: true });
            }
            updateMessage(id, userMsg.id, { pending: false });
            toastError(ev.detail || "智能体暂时不可用");
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        updateMessage(id, userMsg.id, { pending: false, error: true });
        if (assistantId) {
          updateMessage(id, assistantId, { pending: false, error: true });
        }
        toastError(toastMessage(err, "请求失败"));
      } finally {
        setIsSending(false);
        abortRef.current = null;
      }
    },
    [
      currentId,
      addMessage,
      updateMessage,
      renameIfFirstUserMessage,
      ctx,
    ],
  );

  return { send, isSending, context: ctx };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && pnpm test src/hooks/useChat.test.tsx`
Expected: 全部 10 个用例通过(7 新流式 + abort + empty + historyless)。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useChat.ts frontend/src/hooks/useChat.test.tsx
git commit -m "feat(frontend): aggregate streamed steps into one assistant message"
```

---

## Task 5: 重写 `MessageBubble.tsx` —— 任务列表视图 + 最终答案视图（TDD）

**Files:**
- Modify: `frontend/src/components/MessageBubble.test.tsx`
- Modify: `frontend/src/components/MessageBubble.tsx`

- [ ] **Step 1: 在 `MessageBubble.test.tsx` 顶部新增 fixture,在 describe 块尾部新增 3 个用例**

在 `MessageBubble.test.tsx` 顶部 import 区域**之后**,现有 fixture 之前,新增 fixture：

```tsx
import type { AssistantStep, ChatMessage } from "@/types";

// 在 userMsg / assistantMsg / errorMsg / pendingMsg 之后新增:

const runningAssistantMsg: ChatMessage = {
  id: "r1",
  role: "assistant",
  content: "调用工具: get_weather({})",
  createdAt: 1,
  pending: true,
  steps: [
    { name: "model", blocks: [{ type: "tool_call", name: "get_weather", args: {} }] },
    { name: "tools", blocks: [{ type: "text", text: "sunny" }] },
  ],
};

const doneAssistantMsg: ChatMessage = {
  id: "d1",
  role: "assistant",
  content: "It's **sunny** today.",
  createdAt: 1,
  pending: false,
  steps: [
    { name: "model", blocks: [{ type: "tool_call", name: "get_weather", args: {} }] },
    { name: "tools", blocks: [{ type: "text", text: "sunny" }] },
    { name: "model", blocks: [{ type: "text", text: "It's sunny today." }] },
  ],
};

const errorAssistantMsg: ChatMessage = {
  id: "ea1",
  role: "assistant",
  content: "partial answer",
  createdAt: 1,
  error: true,
  pending: false,
  steps: [{ name: "model", blocks: [{ type: "text", text: "partial answer" }] }],
};
```

在 `describe("MessageBubble", () => { ... })` 块**内部**,最后一个 `it(...)` **之后**,新增 3 个用例：

```tsx
  it("renders task list when assistant message has steps and is pending", () => {
    const { container } = render(<MessageBubble message={runningAssistantMsg} />);
    expect(container.querySelector('[data-testid="task-list"]')).not.toBeNull();
    expect(screen.getByText("正在准备调用 get_weather…")).toBeInTheDocument();
    expect(screen.getByText("正在生成回复…")).toBeInTheDocument();
    expect(screen.getByText(/智能体 正在回复/)).toBeInTheDocument();
  });

  it("renders final answer markdown when assistant message is not pending", () => {
    render(<MessageBubble message={doneAssistantMsg} />);
    const strong = screen.getByText("sunny");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByTestId("task-list")).toBeNull();
  });

  it("renders error state with retry button when assistant message has error flag", () => {
    const onRetry = vi.fn();
    render(<MessageBubble message={errorAssistantMsg} onRetry={onRetry} />);
    expect(screen.getByRole("button", { name: /重试/i })).toBeInTheDocument();
    expect(screen.queryByTestId("task-list")).toBeNull();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && pnpm test src/components/MessageBubble.test.tsx`
Expected: 3 个新用例失败 — `Unable to find an element with the testid "task-list"`(因为 MessageBubble 还没实现分支逻辑)。

- [ ] **Step 3: 重写 `MessageBubble.tsx`**

完整替换文件内容为：

```tsx
import { RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeStep } from "@/lib/stepDescription";
import type { AssistantStep, ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
}

/** 仅放行 http(s) 与 mailto,挡住 javascript: */
function safeUrl(url: string): string | null {
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return null;
}

/** 任务列表视图:运行中的 assistant 消息。 */
function TaskListView({ steps }: { steps: AssistantStep[] }) {
  return (
    <div
      className="flex items-start gap-2"
      data-testid="task-list"
    >
      <div
        className="mt-1 h-7 w-7 shrink-0 rounded-full bg-muted"
        aria-hidden
      />
      <div className="flex flex-col">
        <div className="mb-2 text-xs text-muted-foreground">
          智能体 正在回复…
        </div>
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <li
                key={i}
                className="relative pl-5 text-sm leading-relaxed"
              >
                <span
                  className={cn(
                    "absolute left-0 top-1.5 inline-block h-2 w-2 rounded-full",
                    isLast
                      ? "border border-muted-foreground bg-background animate-pulse"
                      : "bg-foreground",
                  )}
                />
                {i < steps.length - 1 && (
                  <span className="absolute left-[3.5px] top-4 h-[calc(100%+0.5rem)] w-px bg-border" />
                )}
                {describeStep(s)}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** 最终答案视图:已完成 assistant 消息的 markdown 气泡。 */
function FinalAnswerView({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const safe = href && safeUrl(href);
            if (!safe) return <span>{children}</span>;
            return (
              <a href={safe} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          code(props) {
            const { className, children } = props;
            const match = /language-(\w+)/.exec(className ?? "");
            const code = String(children).replace(/\n$/, "");
            if (match) {
              return (
                <SyntaxHighlighter
                  language={match[1]}
                  style={oneDark}
                  PreTag="div"
                  customStyle={{
                    fontSize: "0.8rem",
                    borderRadius: "0.375rem",
                    margin: "0.5rem 0",
                  }}
                >
                  {code}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // Assistant 错误态:即使有 steps 也优先显示错误气泡
  if (!isUser && message.error) {
    return (
      <div
        className={cn("flex w-full", "justify-start")}
        data-testid={`message-${message.role}`}
      >
        <div
          className={cn(
            "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
            "border-destructive bg-destructive/10",
          )}
        >
          <FinalAnswerView content={message.content} />
          <div className="mt-1 flex items-center gap-2 text-xs text-destructive">
            <span>发送失败</span>
            {onRetry && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => onRetry(message)}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                重试
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // User 消息(保持原有样式)
  if (isUser) {
    return (
      <div
        className={cn("flex w-full", "justify-end")}
        data-testid={`message-${message.role}`}
      >
        <div
          className={cn(
            "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
            "border-primary/20 bg-primary/10",
          )}
        >
          <div className="break-words">{message.content}</div>
          {message.pending && (
            <div className="mt-1 text-xs text-muted-foreground">发送中…</div>
          )}
        </div>
      </div>
    );
  }

  // Assistant 运行中:任务列表视图
  if (message.steps && message.pending) {
    return (
      <div
        className="flex w-full justify-start"
        data-testid={`message-${message.role}`}
      >
        <div className="max-w-[80%] text-sm">
          <TaskListView steps={message.steps} />
        </div>
      </div>
    );
  }

  // Assistant 完成(无论是否有 steps):最终答案气泡
  return (
    <div
      className={cn("flex w-full", "justify-start")}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
          "border-border bg-card",
        )}
      >
        <FinalAnswerView content={message.content} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && pnpm test src/components/MessageBubble.test.tsx`
Expected: 全部 8 个用例通过(5 现有 + 3 新)。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MessageBubble.tsx frontend/src/components/MessageBubble.test.tsx
git commit -m "feat(frontend): render task list during stream, final answer on done"
```

---

## Task 6: 最终验证

**Files:** none (validation only)

- [ ] **Step 1: 跑 typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: 退出码 0。

- [ ] **Step 2: 跑 lint**

Run: `cd frontend && pnpm lint`
Expected: 无错误,无警告。

- [ ] **Step 3: 跑全部测试**

Run: `cd frontend && pnpm test`
Expected: 全部测试通过,包括:
- `stepContent.test.ts`(6)
- `stepDescription.test.ts`(6)
- `api.test.ts`(5 现有,未改动)
- `useChat.test.tsx`(10:6 流式 + 4 非流式)
- `MessageBubble.test.tsx`(8:5 现有 + 3 新)
- 其他未列出的现有测试文件(ChatContext, MessageList, ChatInput, Sidebar, useConversations, storage, sanity)

- [ ] **Step 4: 手动冒烟测试**

启动前后端:

```bash
# 终端 1
uv run uvicorn backend.main:app --reload --port 8000

# 终端 2
cd frontend && pnpm dev
```

浏览器打开 `http://localhost:5173`,发 "What's the weather in San Francisco?",确认:
- 用户消息立即出现,带"发送中…"
- 出现任务列表视图,显示 2-3 步(准备调用 get_weather → 执行工具 → 生成回复)
- 最后一步空心圆,有脉冲动画(`animate-pulse`)
- done 后任务列表消失,出现单个最终答案气泡
- 浏览器 devtools 看 `/api/chat/stream` 响应是 `text/event-stream`,事件序列正确

- [ ] **Step 5: 手动验证错误路径**

停掉后端(`Ctrl-C` 终端 1),再发消息,确认:
- 用户消息标红 + 显示重试按钮
- 出现 toast 提示 "智能体暂时不可用"
- 没有残留任务列表(因为 assistant 消息未被创建,直接标 user 错误)

- [ ] **Step 6: 如有失败或 lint 警告,修复并提交**

```bash
git add <fixed-files>
git commit -m "fix(frontend): address validation findings from final check"
```

---

## Self-Review Notes

- Spec coverage: types changes → Task 1; stepContent helpers → Task 2; stepDescription → Task 3; useChat aggregation with ref → Task 4; MessageBubble 3-way branch + task list view → Task 5; validation → Task 6. All covered.
- Placeholder scan: no "TBD"/"TODO"/"implement later" in any task step.
- Type consistency: `AssistantStep` (types.ts Task 1) → used in `useChat.ts` (Task 4) and `MessageBubble.tsx` (Task 5) and `stepDescription.ts` (Task 3). `extractText` / `toolSummary` (Task 2) → imported in useChat.ts (Task 4). `describeStep` (Task 3) → imported in MessageBubble.tsx (Task 5). All consistent.
- Test signatures: `sseResponse()` / `errorResponse()` helpers and `wrapper` from existing useChat.test.tsx reused in new tests without modification.