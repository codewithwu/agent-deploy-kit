# 去掉 TaskListView、改为流式文本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 assistant 消息从「流式任务列表 + 末尾 markdown 答案」改成「单气泡 + 文本随每个 SSE step 实时累积」;TaskListView、AssistantStep 类型、stepDescription / stepDetail lib 全部删除。

**Architecture:** `useChat` 收到 `step` 事件时把 `extractText(blocks)` 追加到 `message.content`(`prev + "\n\n" + piece`,tool_call-only 步跳过),不再维护 `steps` 数组。`MessageBubble` 简化为 3 分支:error / user / assistant(pending 流式纯文本 / done markdown 渲染同一 content)。`flushSync` 强渲染、`MIN_TASKLIST_DISPLAY_MS` 500ms 延迟、TaskListView、AssistantStep 全部移除。后端 SSE 协议、api.ts、ChatContext、auth 流程均不动。

**Tech Stack:** React 18 + TypeScript + Vitest + @testing-library/react + sonner(toast)。测试命令 `pnpm test`(`vitest run`)、类型检查 `pnpm typecheck`(`tsc --noEmit`)、lint `pnpm lint`(`eslint .`)。

**Spec:** `docs/superpowers/specs/2026-06-17-remove-tasklist-streaming-text-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `frontend/src/types.ts` | 修改 | 删 `AssistantStep` 接口、`ChatMessage.steps` 字段 |
| `frontend/src/hooks/useChat.ts` | 修改 | 改 step 事件处理为 content 累加;删 `flushSync`、`MIN_TASKLIST_DISPLAY_MS`、`firstStepHandled` 标志、AssistantStep / toolSummary 导入 |
| `frontend/src/hooks/useChat.test.tsx` | 修改 | 5 条用例改写、1 条用例删除 |
| `frontend/src/components/MessageBubble.tsx` | 修改 | 删 TaskListView;改 pending 分支为流式纯文本渲染 |
| `frontend/src/components/MessageBubble.test.tsx` | 修改 | 2 条用例删除、3 条用例改写、2 条用例新增 |
| `frontend/src/lib/stepDescription.ts` | 删除 | 不再有 caller |
| `frontend/src/lib/stepDescription.test.ts` | 删除 | 随被测 lib |
| `frontend/src/lib/stepDetail.ts` | 删除 | 不再有 caller |
| `frontend/src/lib/stepDetail.test.ts` | 删除 | 随被测 lib |

`frontend/src/lib/stepContent.ts` 保留——`extractText` 仍被 useChat 调用;`toolSummary` 不再有 caller 但保留 export(YAGNI)。

---

## Task 1: 改写 useChat 测试用例为新行为

**Files:**
- Modify: `frontend/src/hooks/useChat.test.tsx`

- [ ] **Step 1: 改写 5 条用例,删除 1 条用例**

把以下 5 个 `it(...)` 整块替换为下方新内容,并删除 1 个 500ms 的 `it(...)`。其余 6 个 `it(...)`(`ignores empty input`、`sends only the current user message, no history`、`aborts the prior in-flight stream when a new send starts`、`marks user message as error on HTTP 400`、`marks last step message as error on event: error`、`removes placeholder assistant message when error arrives before any step`)**不动**。

**替换 1**:`aggregates 3 step events into 1 assistant message with steps.length === 3`(原文 76-119 行)→

```tsx
it("accumulates text from 3 step events into 1 assistant message with concatenated content", async () => {
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
          blocks: [{ type: "text", text: "Sunny in SF" }],
        },
      },
      {
        event: "step",
        data: {
          step: "model",
          blocks: [{ type: "text", text: "Final answer" }],
        },
      },
      { event: "done", data: {} },
    ]),
  );

  const { result } = renderHook(() => useChat(), { wrapper });
  await act(async () => {
    await result.current.send("Weather?");
  });

  const messages = result.current.context.conversations[0].messages;
  expect(messages).toHaveLength(2);  // user + 1 assistant
  expect(messages[0].role).toBe("user");
  expect(messages[0].pending).toBe(false);
  expect(messages[1].role).toBe("assistant");
  // tool_call-only 步跳过;两个 text 步用 "\n\n" 累加
  expect(messages[1].content).toBe("Sunny in SF\n\nFinal answer");
  expect(messages[1].pending).toBe(false);
});
```

**替换 2**:`first tool_call step stores summary in content, blocks in steps[0]`(原文 121-145 行)→

```tsx
it("tool_call-only step does not change content", async () => {
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
  expect(assistant.content).toBe("");
});
```

**替换 3**:`later text step overrides content with its own text`(原文 147-176 行)→

```tsx
it("later text step appends to content with separator", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    sseResponse([
      {
        event: "step",
        data: { step: "model", blocks: [{ type: "text", text: "thinking..." }] },
      },
      {
        event: "step",
        data: { step: "model", blocks: [{ type: "text", text: "final answer" }] },
      },
      { event: "done", data: {} },
    ]),
  );

  const { result } = renderHook(() => useChat(), { wrapper });
  await act(async () => {
    await result.current.send("hi");
  });

  const msgs = result.current.context.conversations[0].messages;
  expect(msgs[1].content).toBe("thinking...\n\nfinal answer");
});
```

**替换 4**:`first step with text sets content immediately and keeps pending true`(原文 238-261 行)→ 保留整个 `it(...)`,仅删掉最后两行 `expect(assistant.steps).toHaveLength(1);` 与紧接的 `});` 之间的 `expect` 调用,文件 260 行那一行:

```tsx
it("first step with text sets content immediately and keeps pending true", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    sseResponse([
      {
        event: "step",
        data: { step: "model", blocks: [{ type: "text", text: "hello" }] },
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
  expect(assistant.pending).toBe(false);
});
```

**替换 5**:`done flips assistant pending to false but keeps content`(原文 263-292 行)→

```tsx
it("done flips assistant pending to false and concatenates accumulated content", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    sseResponse([
      {
        event: "step",
        data: { step: "model", blocks: [{ type: "text", text: "first" }] },
      },
      {
        event: "step",
        data: { step: "model", blocks: [{ type: "text", text: "second" }] },
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
  expect(assistant.content).toBe("first\n\nsecond");
});
```

**删除**:`keeps the task list visible for at least 500ms (so user sees running steps, not just the final answer)`(原文 410-458 行整个 `it(...)` 块,含 helper `chunkedSseResponse` 不删——其它用例没用到它,但 `sseResponse` helper 仍被使用)。最终 `chunkedSseResponse` 和 `sseFrame` helper 不再有 caller,可以一并删除以避免死代码。整段从 6-32 行(导出 `chunkedSseResponse` 函数和 `sseFrame` 函数)一并删除,只保留 `sseResponse` 和 `errorResponse` helpers。

> 改完后文件顶部的 imports 不需要改。

- [ ] **Step 2: 运行 vitest 确认新测试失败**

Run:
```bash
cd frontend && pnpm test src/hooks/useChat.test.tsx
```

Expected: 大部分新测试 FAIL(如 `expected "Sunny in SF\n\nFinal answer" but received "Final answer"`)。`useChat.ts` 还没改,所以旧行为(覆盖式 content + `steps` 数组)与新断言不匹配,5 个改写后的用例全部失败,500ms 那条已删除。如果全过说明改错,停手检查。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/hooks/useChat.test.tsx
git commit -m "test(frontend): 改写 useChat 5 条用例为 content 累加行为,删 500ms 任务列表用例"
```

---

## Task 2: 改写 useChat 实现为 content 累加

**Files:**
- Modify: `frontend/src/hooks/useChat.ts`

- [ ] **Step 1: 删除 `flushSync` import**

`frontend/src/hooks/useChat.ts:2` 这一行删除:

```ts
import { flushSync } from "react-dom";
```

- [ ] **Step 2: 删除 `MIN_TASKLIST_DISPLAY_MS` 常量**

`frontend/src/hooks/useChat.ts:25` 整行删除:

```ts
const MIN_TASKLIST_DISPLAY_MS = 500;
```

并删除其上方 22-24 行的注释(整段「本机 LLM 单轮多步调用通常在数十毫秒内完成…」也一并删——失去存在理由)。

- [ ] **Step 3: 改 `toolSummary` import 为只导入 `extractText`**

`frontend/src/hooks/useChat.ts:5` 改为:

```ts
import { extractText } from "@/lib/stepContent";
```

- [ ] **Step 4: 改 `AssistantStep` import 为只导入 `ChatMessage`**

`frontend/src/hooks/useChat.ts:6` 改为:

```ts
import type { ChatMessage } from "@/types";
```

- [ ] **Step 5: 简化 `assistantRef` 类型**

`frontend/src/hooks/useChat.ts:59` 改为:

```ts
const assistantRef = useRef<{ content: string } | null>(null);
```

- [ ] **Step 6: 改写 step 事件处理逻辑**

`frontend/src/hooks/useChat.ts:115-136` 整段 `if (ev.kind === "step") { ... }` 替换为:

```ts
} else if (ev.kind === "step") {
  const piece = extractText(ev.blocks);
  const prev = assistantRef.current?.content ?? "";
  const newContent = piece ? (prev ? prev + "\n\n" + piece : piece) : prev;
  assistantRef.current = { content: newContent };
  updateMessage(id, assistantId, { content: newContent });
}
```

注意: 不再调 `flushSync`,不再维护 `firstStepHandled`,不再设 `steps` 字段。

- [ ] **Step 7: 简化 done 事件处理(去掉 500ms 延迟)**

`frontend/src/hooks/useChat.ts:137-150` 整段 `else if (ev.kind === "done") { ... }` 替换为:

```ts
} else if (ev.kind === "done") {
  updateMessage(id, assistantId, { pending: false });
  updateMessage(id, userMsg.id, { pending: false });
  renameIfFirstUserMessage(id, trimmed);
}
```

- [ ] **Step 8: 改写 error 事件处理(用 content 长度判断)**

`frontend/src/hooks/useChat.ts:151-160` 整段 `else if (ev.kind === "error") { ... }` 替换为:

```ts
} else if (ev.kind === "error") {
  if (assistantRef.current?.content) {
    updateMessage(id, assistantId, { pending: false, error: true });
  } else {
    removeMessage(id, assistantId);
  }
  updateMessage(id, userMsg.id, { pending: false });
  toastError(ev.detail || "智能体暂时不可用");
}
```

- [ ] **Step 9: 改 catch 块(用 content 长度判断)**

`frontend/src/hooks/useChat.ts:162-172` 整段 `catch (err) { ... }` 内 `if (firstStepHandled) { ... } else { removeMessage ... }` 替换为:

```ts
} catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return;
  }
  updateMessage(id, userMsg.id, { pending: false, error: true });
  if (assistantRef.current?.content) {
    updateMessage(id, assistantId, { pending: false, error: true });
  } else {
    removeMessage(id, assistantId);
  }
  toastError(toastMessage(err, "请求失败"));
}
```

- [ ] **Step 10: 删除 try 块前两行无用声明**

`frontend/src/hooks/useChat.ts:111-112` 这两行删除:

```ts
const streamStart = Date.now();
let firstStepHandled = false;
```

- [ ] **Step 11: 删除 `assistantRef.current = null` 后多余的引用**

确认 `frontend/src/hooks/useChat.ts:109` 的 `assistantRef.current = null;` 仍存在(它在 try 块外,用于重置,合法)。`109` 上方的注释(56-58 行关于"流循环内不能依赖闭包"的说明)简化为只解释 content:

```ts
// 流循环内不能依赖 useCallback 闭包里的 ctx.conversations(可能读到旧值),
// 用 ref 跟踪当前 assistant 消息的 content,避免后续 step 追加时丢上下文。
// 必须在组件顶层声明(useRef 是 hook,不能在 useCallback 里调用)。
```

- [ ] **Step 12: 运行 useChat 测试,确认全过**

Run:
```bash
cd frontend && pnpm test src/hooks/useChat.test.tsx
```

Expected: 全部 12 个 `it(...)` PASS。如果失败,先检查 content 累加表达式(`piece ? (prev ? prev + "\n\n" + piece : piece) : prev`)和 error 分支判断(`assistantRef.current?.content`)。

- [ ] **Step 13: 运行 typecheck,确认无类型错误**

Run:
```bash
cd frontend && pnpm typecheck
```

Expected: 0 error。如果报 `AssistantStep` 未找到或 `steps` 字段未找到,说明别处还有引用,定位后修(可能漏改了)。

- [ ] **Step 14: 提交**

```bash
git add frontend/src/hooks/useChat.ts
git commit -m "feat(frontend): useChat 改 content 累加,删 flushSync/500ms/AssistantStep"
```

---

## Task 3: 改写 MessageBubble 测试用例

**Files:**
- Modify: `frontend/src/components/MessageBubble.test.tsx`

- [ ] **Step 1: 删 2 个 testid 断言 + 改写 3 条用例**

修改 `frontend/src/components/MessageBubble.test.tsx`:

- **删除 1**(原文 44-55 行): 整个 `runningAssistantMsg` 常量声明。
- **修改 2**:`doneAssistantMsg` 常量(原文 57-68 行)→ 删 `steps` 字段,改为:

```tsx
const doneAssistantMsg: ChatMessage = {
  id: "d1",
  role: "assistant",
  content: "It's **sunny** today.",
  createdAt: 1,
  pending: false,
};
```

- **修改 3**:`errorAssistantMsg` 常量(原文 70-78 行)→ 删 `steps` 字段,改为:

```tsx
const errorAssistantMsg: ChatMessage = {
  id: "ea1",
  role: "assistant",
  content: "partial answer",
  createdAt: 1,
  error: true,
  pending: false,
};
```

- **修改 4**:`renders thinking indicator for pending assistant message without steps`(原文 112-117 行)→ 改为:

```tsx
it("renders thinking indicator for pending assistant with empty content", () => {
  const { container } = render(<MessageBubble message={thinkingAssistantMsg} />);
  expect(container.querySelector('[data-testid="thinking-indicator"]')).not.toBeNull();
  expect(screen.queryByTestId("task-list")).toBeNull();
  expect(screen.getByText(/智能体 正在回复/)).toBeInTheDocument();
});
```

- **删除 5**(原文 119-125 行): 整个 `it("renders task list when assistant message has steps and is pending", ...)` 块。

- **修改 6**:`renders final answer markdown when assistant message is not pending`(原文 127-132 行)→ 保留全文,因为已经用 `doneAssistantMsg`(我们已删 `steps`):

```tsx
it("renders final answer markdown when assistant message is not pending", () => {
  render(<MessageBubble message={doneAssistantMsg} />);
  const strong = screen.getByText("sunny");
  expect(strong.tagName).toBe("STRONG");
  expect(screen.queryByTestId("task-list")).toBeNull();
});
```

- **删除 7**(原文 141-165 行): 整个 `it("renders step detail below description for model+tool_call", ...)` 块。

- [ ] **Step 2: 新增 2 条用例**

在 `describe("MessageBubble", ...)` 块的尾部(最后一个 `it(...)` 之后)添加:

```tsx
it("renders streaming content with 正在回复 indicator for pending assistant with text", () => {
  const message: ChatMessage = {
    id: "a1",
    role: "assistant",
    content: "Hello there",
    createdAt: 1,
    pending: true,
  };
  const { container } = render(<MessageBubble message={message} />);
  // 顶部 loader
  expect(container.querySelector('[data-testid="thinking-indicator"]')).not.toBeNull();
  expect(screen.getByText(/智能体 正在回复/)).toBeInTheDocument();
  // 累积的 content 用纯文本展示(无 markdown 处理,** 不会被解析为 strong)
  expect(screen.getByText("Hello there")).toBeInTheDocument();
  expect(container.querySelector("strong")).toBeNull();
});

it("hides content area for pending assistant with empty content", () => {
  const { container } = render(<MessageBubble message={thinkingAssistantMsg} />);
  // 仅顶部 loader,无内容区(由 {message.content && ...} 守门)
  expect(container.querySelector('[data-testid="thinking-indicator"]')).not.toBeNull();
  expect(container.querySelector("div.whitespace-pre-wrap")).toBeNull();
});
```

- [ ] **Step 3: 运行 vitest 确认新测试失败**

Run:
```bash
cd frontend && pnpm test src/components/MessageBubble.test.tsx
```

Expected: 失败集中在「rendrers streaming content」(新加的),因为 MessageBubble 还在渲染 TaskListView 分支。如果其他用例因 fixtures 改写而失败,先检查 fixture 是否漏改 `steps`。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/MessageBubble.test.tsx
git commit -m "test(frontend): MessageBubble 测试改写,删 TaskListView 用例,加流式文本用例"
```

---

## Task 4: 改写 MessageBubble 渲染

**Files:**
- Modify: `frontend/src/components/MessageBubble.tsx`

- [ ] **Step 1: 删除 `describeStep` 和 `describeStepDetail` import**

`frontend/src/components/MessageBubble.tsx:8-9` 整段:

```ts
import { describeStep } from "@/lib/stepDescription";
import { describeStepDetail } from "@/lib/stepDetail";
```

两行整体删除,本文件无 `AssistantStep` 引用,不需补 import。

- [ ] **Step 2: 删除 `TaskListView` 组件**

`frontend/src/components/MessageBubble.tsx:42-108` 整段 `function TaskListView(...) { ... }` 函数体删除(包含其中 `setTimeout + console.log` 调试输出块,43-57 行)。

- [ ] **Step 3: 改写 pending 分支**

`frontend/src/components/MessageBubble.tsx:232-258` 整个「assistant 思考中」和「assistant 运行中」分支(原代码):

```tsx
// Assistant 思考中:首个 step 尚未到达,显示 loading 动效
if (message.pending && !message.steps) {
  return (
    <div className="flex w-full justify-start" data-testid={`message-${message.role}`}>
      <div className="max-w-[80%] text-sm">
        <ThinkingView />
      </div>
    </div>
  );
}

// Assistant 运行中:任务列表视图
if (message.steps && message.pending) {
  return (
    <div className="flex w-full justify-start" data-testid={`message-${message.role}`}>
      <div className="max-w-[80%] text-sm">
        <TaskListView steps={message.steps} />
      </div>
    </div>
  );
}
```

替换为(合并为单一 pending 分支,空 content 与有 content 同分支显示):

```tsx
// Assistant 思考中或累积中:顶部 loader + 累积 content(纯文本,不用 markdown)
if (message.pending) {
  return (
    <div className="flex w-full justify-start" data-testid={`message-${message.role}`}>
      <div className="max-w-[80%] rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          <span>智能体 正在回复…</span>
        </div>
        {message.content && (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}
```

> `ThinkingView` 组件不再被使用;`frontend/src/components/MessageBubble.tsx:24-40` 整段 `function ThinkingView() { ... }` 函数体删除(整个 `thinking-indicator` 视觉提示被内联在 pending 分支里,无 `data-testid` 需求——但请在 Step 4 步骤保留 `thinking-indicator` testid 兼容性)。

- [ ] **Step 4: 在 pending 容器外层加 `thinking-indicator` testid 兼容旧测试**

在 Step 3 的 `max-w-[80%]` 那个 div 上加 `data-testid="thinking-indicator"`,即:

```tsx
<div className="max-w-[80%] rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm" data-testid="thinking-indicator">
```

这样 Task 3 的 "renders thinking indicator for pending assistant with empty content" 用例(`container.querySelector('[data-testid="thinking-indicator"]')`)能继续找到该元素。

- [ ] **Step 5: 删除 `ThinkingView` 组件**

`frontend/src/components/MessageBubble.tsx:24-40` 整段 `function ThinkingView() { ... }` 函数体删除(在 Step 3 之后已经无人调用,直接删)。

- [ ] **Step 6: 运行 MessageBubble 测试**

Run:
```bash
cd frontend && pnpm test src/components/MessageBubble.test.tsx
```

Expected: 全部 10 个 `it(...)` PASS(原 10 条,删 2 加 2,净 10)。如果 `renders final answer markdown` 失败,检查 `doneAssistantMsg` 是否已删 `steps`;如果 `renders streaming content` 失败,检查 `whitespace-pre-wrap` 类名和 `{message.content && ...}` 守门。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/MessageBubble.tsx
git commit -m "feat(frontend): MessageBubble 改流式文本渲染,删 TaskListView 和 ThinkingView"
```

---

## Task 5: 清理 types.ts

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: 删除 `AssistantStep` 接口**

`frontend/src/types.ts:3-9` 整段 `export interface AssistantStep { ... }` 删除。

- [ ] **Step 2: 删除 `ChatMessage.steps` 字段 + 更新 `content` 注释**

`frontend/src/types.ts:15-24` 把:

```ts
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
```

改为:

```ts
  /** Markdown 文本。assistant 上等于所有 step 文本块按时间顺序用 "\n\n" 拼接。 */
  content: string;
  /** Date.now() */
  createdAt: number;
  /** 用户刚发出、等待后端响应时为 true */
  pending?: boolean;
  /** 请求失败标记,支持重试 */
  error?: boolean;
}
```

- [ ] **Step 3: 运行 typecheck + 测试**

Run:
```bash
cd frontend && pnpm typecheck
cd frontend && pnpm test
```

Expected: 0 type error;所有测试通过。如果报 `AssistantStep` 未找到,说明某文件还有遗留 import(grep `AssistantStep` 找)。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types.ts
git commit -m "refactor(frontend): types.ts 删 AssistantStep 和 steps 字段"
```

---

## Task 6: 删除四个 lib 文件

**Files:**
- Delete: `frontend/src/lib/stepDescription.ts`
- Delete: `frontend/src/lib/stepDescription.test.ts`
- Delete: `frontend/src/lib/stepDetail.ts`
- Delete: `frontend/src/lib/stepDetail.test.ts`

- [ ] **Step 1: git rm 四个文件**

```bash
git rm frontend/src/lib/stepDescription.ts frontend/src/lib/stepDescription.test.ts frontend/src/lib/stepDetail.ts frontend/src/lib/stepDetail.test.ts
```

- [ ] **Step 2: 跑全套 typecheck / lint / test**

Run:
```bash
cd frontend && pnpm typecheck
cd frontend && pnpm lint
cd frontend && pnpm test
```

Expected: 0 error。如果 lint 抱怨有未使用的 import,先 grep 一下 `stepDescription` 和 `stepDetail` 看是否还有遗漏 caller,修后再跑。

- [ ] **Step 3: 提交**

```bash
git commit -m "chore(frontend): 删 stepDescription / stepDetail(随 TaskListView 移除)"
```

---

## Task 7: 全量验证 + 手动冒烟

**Files:** 无(只跑命令)

- [ ] **Step 1: 跑全套前端检查**

Run:
```bash
cd frontend && pnpm typecheck
cd frontend && pnpm lint
cd frontend && pnpm test
```

Expected: 全部 PASS。如果只有 lint 警告(不是错误),允许通过。

- [ ] **Step 2: 启动后端(若未启动)与前端 dev server**

Run(并行启动):

```bash
# 终端 1
cd frontend && pnpm dev
```

按 `frontend/` 实际 dev 命令为准(`pnpm dev` → `vite`,端口 5173 默认)。后端 `uv run uvicorn backend.main:app --reload --port 8000` 单独跑(本任务不要求启动后端,可在浏览器手测时另开)。

- [ ] **Step 3: 浏览器手测 1 — 触发工具的对话**

打开 `http://localhost:5173`(或 vite 实际端口),新建对话,输入「北京天气怎么样」。肉眼确认:

- 占位 assistant 气泡出现,顶部「正在回复…」loader 转,内容区为空
- 收到 tool_call 步时气泡无视觉变化(无内容,无步骤列表)
- 收到 tools 步时气泡出现工具返回的纯文本(「Sunny in Beijing」之类)
- 收到末尾 model text 步时气泡文本用空行隔开追加
- `done` 后气泡切换为同一个 content 的 markdown 渲染(若有 `**bold**` 之类的语法,渲染为 `<strong>`)

- [ ] **Step 4: 浏览器手测 2 — 纯文本对话**

输入「你好」之类不触发工具的短问。肉眼确认:

- 气泡文本在 `done` 之前就能完整显示
- `done` 后无视觉抖动(同一个 content 切换渲染方式,无 jump)

- [ ] **Step 5: 浏览器手测 3 — 失败路径**

断网后再发一条消息,或调一个返回 500 的 agent。肉眼确认:

- user 消息变红 + 显示「重试」按钮
- assistant 占位消息被删除(空 content 时 `removeMessage`)

- [ ] **Step 6: 全量 diff 自检**

```bash
git log --oneline main..HEAD
```

确认 6 个 commit 顺序为 Task 1-6 的提交(顺序不限,但数量应对)。`git diff main..HEAD --stat` 应仅触碰:

- `frontend/src/types.ts`
- `frontend/src/hooks/useChat.ts`
- `frontend/src/hooks/useChat.test.tsx`
- `frontend/src/components/MessageBubble.tsx`
- `frontend/src/components/MessageBubble.test.tsx`
- `frontend/src/lib/stepDescription.ts`(删除)
- `frontend/src/lib/stepDescription.test.ts`(删除)
- `frontend/src/lib/stepDetail.ts`(删除)
- `frontend/src/lib/stepDetail.test.ts`(删除)

如果出现 `backend/`、`api.ts`、auth 相关、`ChatContext.tsx`、`MessageList.tsx`、`ChatWindow.tsx`、`ChatInput.tsx`、`EmptyState.tsx`、`Sidebar.tsx`、`TopBar.tsx`、`ProtectedRoute.tsx` 等文件的改动,说明越界,回滚并检查。

- [ ] **Step 7: 任务完成**

如全部通过,本 spec 的实施完成,可进入「finishing-a-development-branch」决定如何合入(merge / PR / 继续迭代)。
