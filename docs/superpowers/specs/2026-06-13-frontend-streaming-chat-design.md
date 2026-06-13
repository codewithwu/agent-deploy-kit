# 前端切到 `/api/chat/stream` 设计

- 日期：2026-06-13
- 范围：把前端从非流式 `POST /api/chat` 切到流式 `POST /api/chat/stream`，按 LangChain step 增量展示 agent 推理过程。**仅前端**，后端契约（已在 `2026-06-13-streaming-chat-endpoint-design.md` 落地）不动。

## 背景与目标

仓库后端已新增 `POST /api/chat/stream` SSE 端点（commit `bdbfbe3`），能推送 N 条 `step` 事件 + 末尾 `done`（异常时 `error`）。但前端 `useChat` 仍调非流式 `postChat`，等 agent 跑完再一次性塞进 assistant 气泡，丢失了"逐步推理"的体感，且对工具调用完全不可见。

本任务把前端切到流式消费：
- 收到一条 `step` 立即渲染一条 assistant 消息，标签显示 step 来源（`model` / `tools`）。
- `tool_call` 块渲染为占位文字（"调用工具: get_weather(city: ...)"），`text` 块渲染为正常 markdown 文本。
- 流正常结束 → userMsg 切到非 pending、会话自动命名。
- 流中 `event: error` → 最后一条 step 消息标 error + toast。
- **彻底删掉** `postChat` 旧函数与对应测试，不保留 fallback。

设计原则：
- 简洁优先（`Simplicity First`）：只动 3 个前端文件，不动 `MessageList` / `ChatContext` / `useConversations` / `types.ts` 核心骨架。
- 流式体感：用户能看到 model→tools→model 依次出现，与"逐步推理"语义对齐。
- 沿用现有 abort / pending / error / retry 模式，不引入新概念。

## 端点契约（依赖）

`POST /api/chat/stream`（来自后端 spec，**本任务不修改**）：

- 请求体：`ChatRequest`，与旧端点一致。
- 成功响应：`Content-Type: text/event-stream`，事件三类：
  - `event: step` — `data: {"step": "<name>", "blocks": [...content_blocks 原样...]}`
  - `event: done` — `data: {}`
  - `event: error` — `data: {"detail": "<msg>"}`（响应头已发出，HTTP 状态仍 200）
- HTTP 400（空 messages / 422 字段错误）：标准 JSON 错误响应，由 `streamChat` 抛 `ChatApiError`。

## 组件

### `frontend/src/lib/api.ts`（重写）

**删**：`postChat` 函数、`ChatApiError` 不删（HTTP 错误响应仍用它）。

**增**：

```ts
export type StreamEvent =
  | { kind: "step"; step: string; blocks: Array<Record<string, unknown>> }
  | { kind: "done" }
  | { kind: "error"; detail: string };

export async function* streamChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent>;
```

实现要点：
1. `fetch(\`${apiBase()}/api/chat/stream\`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({messages}), signal })`。
2. HTTP 非 2xx：`await res.text()` 后尝试 `JSON.parse` 取 `detail`，否则用 `res.statusText`；抛 `new ChatApiError(res.status, detail)`。**与原 postChat 错误行为对齐**。
3. HTTP 2xx：从 `res.body` 取 `getReader()`，按行解析 SSE：
   - 维护 `buffer: string` 与 `current: {event?: string, data?: string}` 两个状态。
   - 读到 `\n` 切行；行内容若是 `event: foo` / `data: {...}` / `id: ...`，按 SSE 规范剥前导空格后塞入 `current`。
   - 读到空行（`\n\n` 或末尾）：若 `current.data` 存在，`json.loads` 后按 `current.event` yield 对应 `StreamEvent`；重置 `current`。
   - 行首为 `:`（注释）或不含 `:`（如心跳），忽略。
4. 流结束：reader done 时若 `current.data` 还有残余，按同样的逻辑 yield 一次。
5. 解析失败（`json.loads` 抛错）：抛 `new Error(\`invalid SSE: \${msg}\`)`，由 `useChat` 兜底。

不引入 `eventsource-parser` 等第三方库（前端依赖 `package.json` 保持不变）。

### `frontend/src/hooks/useChat.ts`（重写 send 主体）

```ts
const send = useCallback(async (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return;

  abortRef.current?.abort();

  let id = currentId;
  if (!id) id = ctx.createConversation();

  const userMsg: ChatMessage = {
    id: newId(),
    role: "user",
    content: trimmed,
    createdAt: Date.now(),
    pending: true,
  };
  addMessage(id, userMsg);

  const conv = conversations.find((c) => c.id === id);
  const history = (conv?.messages ?? [])
    .filter((m) => !m.pending && !m.error)
    .map((m) => ({ role: m.role, content: m.content }));
  const payload = [...history, { role: "user", content: trimmed }];

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
        toastError(ev.detail || "智能体暂时不可用");
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // 静默,符合现有约定
    } else {
      const status = err instanceof ChatApiError ? err.status : 0;
      const detail =
        err instanceof ChatApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "请求失败";
      updateMessage(id, userMsg.id, { pending: false, error: true });
      if (lastAssistantId) {
        updateMessage(id, lastAssistantId, { error: true });
      }
      toastError(
        status === 400
          ? detail || "消息不能为空"
          : status >= 500
            ? "智能体暂时不可用"
            : detail || "请求失败",
      );
    }
  } finally {
    setIsSending(false);
    abortRef.current = null;
  }
}, [...]);
```

辅助函数 `renderStepContent(blocks: Array<Record<string, unknown>>): string`：
- 取 `text` 块（`block.type === "text"`），把 `block.text` 拼成单个字符串。
- 若至少 1 个 text 块 → 返回拼接结果。
- 若全为 `tool_call` 块 → 对每块渲染 `"调用工具: " + block.name + "(" + JSON.stringify(block.args) + ")"`，多块用 `\n` 连接。
- 混合（text + tool_call）→ text 拼接结果（tool_call 不重复渲染，与"只看文本回复"的直觉对齐；tool_call 已在第一条 step 出现过）。

辅助函数 `toastError(msg: string)`：抽出原有 `toast?.error(msg)` 三元逻辑（status 判断、fallback 文案），catch 与 `event: error` 两条路径共用。

### `frontend/src/components/MessageBubble.tsx`（小改）

- 检测 `message.step`：若存在，在气泡右上显示一个小标签：

  ```tsx
  {message.step && (
    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {message.step}
    </div>
  )}
  ```

  位置在 markdown 内容上方、bubble 内顶部。
- 现有 markdown 渲染、`pending` 指示器、`error` 状态、重试按钮全部保留。
- **不**为"调用工具: ..."占位文字加特殊样式——靠 step 标签已经能区分 model / tools。

### `frontend/src/types.ts`（小改）

```ts
export interface ChatMessage {
  // ...现有字段
  /** 流式 step 名称,如 "model" / "tools";非流式消息省略 */
  step?: string;
}
```

加一个 `step?` 字段，其他不动。

## 数据流

正常路径（一次天气查询，推 3 条 step + done）：

```
[User clicks send]
   │
   ▼
useChat.send("What's the weather in San Francisco?")
   │
   ├─ abortRef.current?.abort()      ← 取消上一次
   ├─ createConversation if needed
   ├─ addMessage(userMsg, pending: true)
   │
   ▼
for await (const ev of streamChat(payload, signal)):
   │
   ├─ ev.kind === "step", step = "model", blocks = [tool_call]
   │   └─ content = '调用工具: get_weather(city: "San Francisco")'
   │   └─ addMessage(assistantMsg-1, { pending: true, step: "model" })
   │
   ├─ ev.kind === "step", step = "tools", blocks = [text]
   │   └─ content = "It's always sunny in San Francisco!"
   │   └─ addMessage(assistantMsg-2, { pending: true, step: "tools" })
   │
   ├─ ev.kind === "step", step = "model", blocks = [text]
   │   └─ content = "It's always sunny in San Francisco!"
   │   └─ addMessage(assistantMsg-3, { pending: true, step: "model" })
   │
   ├─ ev.kind === "done"
   │   └─ updateMessage(userMsg.id, { pending: false })
   │   └─ renameIfFirstUserMessage(id, trimmed)
   │
   ▼
setIsSending(false)
```

UI 视角下用户看到：自己的消息（"发送中…"）→ 3 条带 `model`/`tools`/`model` 标签的 assistant 消息依次出现 → 自己的消息去掉"发送中…"，会话被自动命名为 "What's the weather in San Francis…"。

错误路径（流中途 `event: error`）：

```
step (model, tool_call) → 已 addMessage assistant-1
error { detail: "rate limit" }
   └─ updateMessage(assistant-1.id, { error: true })   ← 把最后一条 step 标 error
   └─ updateMessage(userMsg.id, { pending: false })
   └─ toast("rate limit")
```

边界（流中途用户发新消息）：

```
旧流: streamChat(...) 正在 yield
新流: send("b")
   └─ abortRef.current.abort()    ← 旧流 controller 触发
   └─ streamChat 内部 reader.cancel()  ← fetch 中断
   └─ 旧 for-await 抛 AbortError → useChat 静默返回
   └─ 新流开始: addMessage(userMsg-2), addMessage(assistant-...)
```

## 错误处理

| 失败点 | streamChat 行为 | useChat 行为 |
|---|---|---|
| HTTP 400（空 messages / 422） | 抛 `ChatApiError(400, "...")` | userMsg 标 `error: true`；toast "消息不能为空" |
| HTTP 5xx | 抛 `ChatApiError(5xx, "...")` | userMsg 标 `error: true`；toast "智能体暂时不可用" |
| 流中 `event: error` | yield `{kind:"error", detail}` | 最后一条 step 消息（如有）标 `error: true`；userMsg 切 `pending: false`；toast(detail \|\| "智能体暂时不可用") |
| SSE 解析失败 | 抛 `Error("invalid SSE: ...")` | userMsg 标 `error: true`；toast "请求失败" |
| `AbortError` | 由 fetch / reader 抛出 | 静默返回（与现有约定一致） |

`isSending` 全程 true（在 `try` 块内 `setIsSending(true)`，`finally` 中 `setIsSending(false)`），包括 done / error 之后。没有"部分完成"的中间态——一旦发了流，要么走完 `done`，要么走 `error` / abort。

## 测试

### `frontend/src/lib/api.test.ts`（新增）

mock 用 `vi.spyOn(globalThis, "fetch")` + 自定义 `ReadableStream`，与 `useChat.test.tsx` 风格一致。

| 用例 | 断言 |
|---|---|
| `yields step and done events from a complete SSE stream` | 喂一条含 2 条 step + 1 条 done 的 SSE 文本，断言 yield 3 个事件，类型/数据正确 |
| `throws ChatApiError on non-2xx with parsed detail` | fetch 返回 400 + JSON `{detail:"empty messages"}`，断言抛 `ChatApiError(400, "empty messages")` |
| `yields error event for event: error frame` | 流里推 `event: error\ndata: {"detail":"rate limit"}`，断言 yield `{kind:"error", detail:"rate limit"}` |
| `handles SSE frames split across reader chunks` | 把一段 SSE 文本切成 2 块喂给 reader，断言仍能正确 yield 全部事件 |
| `passes AbortSignal to fetch` | 断言 fetch 被调用时 `init.signal` 等于传入的 `AbortSignal` |

### `frontend/src/hooks/useChat.test.tsx`（重写 send 相关用例）

| 用例 | 断言 |
|---|---|
| `streams 3 step events then done, producing 3 assistant messages with step labels` | mock fetch 返回完整天气查询的 SSE 流，断言 conversations[0].messages 长度 = 4（1 user + 3 assistant），且 assistant 消息依次有 `step: "model"` / `"tools"` / `"model"` |
| `tool_call step renders as 占位文字 in content` | 断言第一条 assistant 的 content 含 `"调用工具: get_weather"` |
| `text step renders concatenated text blocks` | 断言第三条 assistant 的 content == `"It's always sunny in San Francisco!"` |
| `marks user message as error on HTTP 400` | mock fetch 返回 400，断言 userMsg.error == true, userMsg.pending == false |
| `marks last step message as error on event: error` | mock fetch 推 step + error，断言 userMsg.pending == false，最后一条 step 消息 error == true |
| `aborts prior in-flight stream when a new send starts` | 沿用现有断言（fetchSpy.mock.calls[0][1].signal.aborted === true），用流式 mock 适配 |
| `ignores empty input` | 沿用现有断言（与流式无关） |

删除旧用例（被流式版本替代）：
- `returns isSending flag that flips true->false across a call`
- `appends user message (pending) and then assistant reply on success`
- `marks user message as error on non-2xx`

### 不动的测试

- `MessageBubble.test.tsx`：现有断言都过（content 渲染、pending/error 指示器、retry 按钮）。step 标签的视觉不强求测试（属于实现细节 + 视觉），不写新断言。
- `MessageList.test.tsx` / `ChatInput.test.tsx` / `ChatContext.test.tsx` / `useConversations.test.tsx`：不动。

## 配置与运行

无新增依赖，无 `.env` 变更。开发命令不变：

```bash
# 后端
uv run uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# 前端
cd frontend && pnpm dev
```

## 验证标准

1. `cd frontend && pnpm typecheck` 无错误。
2. `cd frontend && pnpm lint` 无错误。
3. `cd frontend && pnpm test` 全部通过（旧 5 个测试文件 + 新增 `api.test.ts` 5 个 + 重写的 `useChat.test.tsx` 7 个）。
4. 启动前后端，发"天气查询"，浏览器 devtools 看 `/api/chat/stream` 响应是 `text/event-stream`，UI 上看到 3 条带 `model`/`tools` 标签的 assistant 消息依次出现。
5. 手动验证：故意停后端再发，userMsg 标 error + toast "智能体暂时不可用"。
6. 手动验证：流中途发新消息（旧 send 的 signal 变 aborted），UI 上不出现"幽灵"消息。

## 范围外（明确不做）

- **打字机效果**（token 级流 `stream_mode='messages'`）——需要后端先支持，独立任务。
- **`useConversations` 流式适配**——当前是收到 1 条流就 `addMessage` 多次，`useConversations` 已经支持（`addMessage` 是 list 追加语义），无需改。
- **手动重试流式消息**——现有 retry 按钮仍走 `send(msg.content)` 重新发流，行为自然，无需改。
- **流断线重连 / 心跳**——开发期本地用，不引入。
- **`MessageList` 虚拟化 / 性能优化**——3 条 step 的问答规模可忽略。
- **修改 `MessageList` / `ChatContext` / `useConversations` / `ChatInput` / `ChatWindow` / `App` / 后端任一文件**。
- **引入 `eventsource-parser` 等第三方库**——手写 SSE 解析器已够用，依赖保持不变。

## 后续可考虑

- 引入 token 级流（`stream_mode='messages'`）支持打字机效果（后端优先）。
- 把 `streamChat` 抽出独立 `frontend/src/lib/sse.ts`，与 `api.ts` 解耦（按需）。
- 给 `MessageBubble` 加"折叠/展开"控制，超过 N 条 step 时自动折叠（按需）。
