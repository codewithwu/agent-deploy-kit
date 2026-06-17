# 去掉 TaskListView：assistant 消息改为流式累积文本

- 日期：2026-06-17
- 范围：**仅前端**。把 assistant 消息从「流式任务列表 + 末尾 markdown 答案」改成「单气泡 + 文本随每个 step 实时累积」。TaskListView、`stepDescription.ts`、`stepDetail.ts`、`AssistantStep` 类型、`flushSync` 强渲染、`MIN_TASKLIST_DISPLAY_MS` 延迟全部移除。
- 后端 SSE 协议（`POST /api/chat/stream` 的 `step` / `done` / `error` 事件）、`api.ts` / `apiClient.ts` / `ChatContext` / `useConversations` / `MessageList` / `ChatWindow` / `ChatInput` / `EmptyState` / `Sidebar` / `TopBar` / `ProtectedRoute` / 所有 auth 流程不动。

## 背景与目标

当前 `useChat.send`（hooks/useChat.ts）收到每个 SSE `step` 事件后，会把 `message.steps` 数组追加一项，并把 `message.content` 覆盖为「当前 step 的文本」或「tool_call 摘要」。`MessageBubble.tsx:TaskListView` 拿 `steps` 数组逐行渲染为「正在准备调用 get_weather…」之类的中文标签 + 详情行。`done` 之后切换为单 markdown 气泡，只展示最后一步的 `content`。

`flushSync` + `MIN_TASKLIST_DISPLAY_MS = 500ms` 的设计目的都是为了让 TaskListView 真正能被人眼看到——本机 LLM 一次完整多步调用 < 100ms，不强制渲染 + 强制保活，列表会一闪而过。

用户希望简化交互：**只显示流式文本**。每收到一个 step 的文本，就把它追加到 assistant 气泡里；纯 tool_call 步（无 text 块）静默跳过；done 之后同一个 `content` 渲染为 markdown。

## 决策摘要

| 决策点 | 选择 | 理由 |
|---|---|---|
| step 文本如何进 content | 累加：`prev + "\n\n" + extractText(blocks)` | 「流式文本」的自然含义；和 ChatGPT / Claude.ai 一致 |
| tool_call-only 步 | 跳过，不写 content | 用户明确「只显示流式文本」；调工具是内部行为，不该出现在最终答案里 |
| pending 阶段渲染 | 纯文本（`whitespace-pre-wrap`），不用 ReactMarkdown | 避免半成型 markdown（`**` / code fence）抖动 |
| done 阶段渲染 | ReactMarkdown（沿用 `FinalAnswerView`） | 与现有最终答案视觉一致 |
| TaskListView / stepDescription / stepDetail | 全部删除 | 不再有任何 caller |
| `AssistantStep` 类型 / `steps` 字段 | 删除 | 不再需要结构化 step 数据 |
| `flushSync` 包裹 | 移除 | 不再需要绕过 React 18 批处理（一个 step 一次 setState 已是细粒度） |
| `MIN_TASKLIST_DISPLAY_MS` 500ms 延迟 | 移除 | 没有 list 要保活 |
| 占位 assistant 消息（`useChat.ts:91-97`） | 保留 | 给用户「正在回复」的视觉锚点，等第一个文本 step 填充 |
| 打字光标 / typed-effect 动画 | 不做 | YAGNI |
| 后端 SSE 协议 | 不动 | 跨前后端边界，本次不碰 |

## 数据模型

`frontend/src/types.ts` 删除 `AssistantStep` 接口，删除 `ChatMessage.steps` 字段。`ChatMessage.content` 注释更新：

```ts
export interface ChatMessage {
  id: string;
  role: Role;
  /** Markdown 文本。assistant 上等于所有 step 文本块按时间顺序用 "\n\n" 拼接 */
  content: string;
  createdAt: number;
  pending?: boolean;
  error?: boolean;
}
```

`Conversation` / `Role` 不动。

## 改动文件

### `frontend/src/hooks/useChat.ts`

收到 `step` 事件时改为追加文本：

```ts
// 当前
const initContent = extractText(ev.blocks) || toolSummary(ev.blocks);
const newContent: string = firstStepHandled
  ? extractText(ev.blocks) || assistantRef.current?.content || ""
  : initContent;
const newSteps: AssistantStep[] = firstStepHandled
  ? [...(assistantRef.current?.steps ?? []), { name: ev.step, blocks: ev.blocks }]
  : [{ name: ev.step, blocks: ev.blocks }];
assistantRef.current = { steps: newSteps, content: newContent };
flushSync(() => {
  updateMessage(conversationId, assistantId, { content: newContent, steps: newSteps });
});

// 改成
const piece = extractText(ev.blocks);
const prev = assistantRef.current?.content ?? "";
const newContent = piece ? (prev ? prev + "\n\n" + piece : piece) : prev;
assistantRef.current = { content: newContent };
updateMessage(conversationId, assistantId, { content: newContent });
```

配套删除：

- `flushSync` import（`useChat.ts:2`）和 `useChat.ts:130-135` 的 `flushSync(() => …)` 包裹
- `MIN_TASKLIST_DISPLAY_MS` 常量（`useChat.ts:25`）和 `useChat.ts:140-147` 的 `await new Promise(setTimeout)` 延迟
- `firstStepHandled` 标志（`useChat.ts:112`）改用 `assistantRef.current?.content.length` 或 message content 长度判断
- `firstStepHandled` 相关的 `if (firstStepHandled) { … } else { removeMessage }` 分支改为基于「content 仍为空」判断
- `toolSummary` import（不再被 useChat 调用；如果整个项目无其他 caller 则一并删 import，但 stepContent.ts 保留 `extractText`，所以只删 useChat 这一行的 import）
- `AssistantStep` import（`useChat.ts:6`）—— 不再使用
- `assistantRef.current.steps` 字段—— ref 类型简化为 `{ content: string } | null`

`useChat.ts:91-97` 的占位 assistant 消息（`content: ""`, `pending: true`）保留，提供"正在回复"视觉锚点。

### `frontend/src/components/MessageBubble.tsx`

4 个分支简化为 3 个：

- **error 态**（assistant 或 user 的 `error=true`）—— 沿用现有 error 分支
- **user 态** —— 沿用现有
- **assistant pending** —— 新分支：
  ```tsx
  <div className="flex w-full justify-start" data-testid={`message-${message.role}`}>
    <div className="max-w-[80%] rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        <span>智能体 正在回复…</span>
      </div>
      {message.content && (
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      )}
    </div>
  </div>
  ```
- **assistant done**（沿用现有 FinalAnswerView）—— 渲染同一 `content` 为 markdown

`TaskListView` 组件整个删除（含其 `console.log` 调试输出）。`describeStep` / `describeStepDetail` import 删除。

### 删除文件

- `frontend/src/lib/stepDescription.ts` + `frontend/src/lib/stepDescription.test.ts`
- `frontend/src/lib/stepDetail.ts` + `frontend/src/lib/stepDetail.test.ts`

`stepContent.ts` 保留（`extractText` 仍被 useChat 调用；`toolSummary` 不再有 caller 但保留 export，YAGNI——文件本身仍有用，导出函数让别人决定用不用）。

## 数据流

正常路径（天气查询，3 step → 累积文本）：

```
useChat.send("What's the weather in SF?")
  │
  ▼ SSE steps
  │
  ├─ step "model" (tool_call: {city: "SF"})
  │   ├─ piece = extractText(blocks) = ""   ← tool_call 无 text
  │   ├─ newContent = "" (prev 仍为空)
  │   └─ bubble 渲染: "正在回复…" + 空内容
  │
  ├─ step "tools" (text: "Sunny, 22℃")
  │   ├─ piece = "Sunny, 22℃"
  │   ├─ prev = "" (falsy) → newContent = piece = "Sunny, 22℃"
  │   └─ bubble 渲染: "正在回复…" + "Sunny, 22℃"
  │
  ├─ step "model" (text: "It's always sunny in SF!")
  │   ├─ piece = "It's always sunny in SF!"
  │   ├─ newContent = "Sunny, 22℃" + "\n\n" + "It's always sunny in SF!"
  │   │                = "Sunny, 22℃\n\nIt's always sunny in SF!"
  │   └─ bubble 渲染: "正在回复…" + "Sunny, 22℃\n\nIt's always sunny in SF!"
  │
  ▼ done
  ├─ pending = false
  └─ bubble 切换为 FinalAnswerView: 同一 content 渲染为 markdown
```

实现细节：第 1 步（tool_call-only）`piece` 为空，三元走 else 分支，prev 保持 `""`，content 仍是空串。第 2 步（tools + text）`piece = "Sunny, 22℃"`，prev 是空串（falsy），结果 = piece = `"Sunny, 22℃"`。第 3 步（model + text）`piece = "It's always sunny in SF!"`，prev = `"Sunny, 22℃"` truthy，结果 = `"Sunny, 22℃" + "\n\n" + "It's always sunny in SF!"` = `"Sunny, 22℃\n\nIt's always sunny in SF!"`。

## 错误处理

| 边界 | 行为 |
|---|---|
| HTTP 4xx/5xx | 标 user 消息 `error=true, pending=false`（不变） |
| SSE `event: error` 且 content 非空 | 标 assistant `error=true, pending=false, content=当前累积内容`（不变） |
| SSE `event: error` 且 content 仍为空 | `removeMessage` 删占位（判断从 `!firstStepHandled` 改为 `content.length === 0`） |
| `AbortError` | 静默 return（不变） |
| 任何 fetch 异常 | 同 SSE error 路径（按 content 长度判断标 error 或 remove） |
| tool_call-only step | 不动 content（piece 为空，三元走 else 分支返回 prev） |
| step 含 text + tool_call 混合 | 只取 text（`extractText` 只 filter `type === "text"`） |
| 同一 step 多个 text 块 | `extractText` 用 `join("")` 拼为一段 |
| `content` 在 done 之前一直为空 | 占位 bubble 仍显示"正在回复…"指示，不显示内容区（`{message.content && …}` 守门） |
| 占位消息的 content 累积 | `assistantRef.current = { content: newContent }` 在每个 step 重新赋值；首 step 前 ref 为 `null`，`prev` 取空串 |

## 测试

### `frontend/src/hooks/useChat.test.tsx`（12 条 → 改 5 条 + 删 1 条）

| 原用例 | 改动 |
|---|---|
| `aggregates 3 step events into 1 assistant message with steps.length === 3` | **改**：断言 `content` 等于文本块的累积拼接（tool_call-only 步跳过；最终 = "It's always sunny in San Francisco!"，因为只有 text-only 的 step 有 piece）。不再断言 `steps` |
| `first tool_call step stores summary in content, blocks in steps[0]` | **改**：tool_call-only 步不改 content（保持 `""`）；删 `steps?.[0].blocks` 断言 |
| `later text step overrides content with its own text` | **改**：第二个 text 步**追加**而非覆盖，断言 `content === "thinking...\n\nfinal answer"` |
| `first step with text sets content immediately and keeps pending true` | **改**：删 `steps.length === 1` 断言，保留 `content === "hello"` |
| `done flips assistant pending to false but keeps content` | **改**：两步 text 后断言 `content === "first\n\nsecond"` |
| `event: error marks assistant pending=false + error=true` | 不变（content 长度判断仍能工作） |
| `keeps the task list visible for at least 500ms` | **删**：500ms 延迟整个移除，本测试失去意义 |
| 其余 5 条 | 不变（HTTP 400 / 切会话 abort / 空输入 / 历史不混 / placeholder assistant 删除等） |

### `frontend/src/components/MessageBubble.test.tsx`（8 条 → 改 2 条 + 删 2 条）

| 原用例 | 改动 |
|---|---|
| `renders thinking indicator for pending assistant message without steps` | **改**：测试数据删 `steps` 字段；`thinking-indicator` testid 保留（pending 分支顶部仍带 loader） |
| `renders task list when assistant message has steps and is pending` | **删** |
| `renders step detail below description for model+tool_call` | **删** |
| `renders final answer markdown when assistant message is not pending` | **微调**：测试数据删 `steps` 字段；断言保持 |
| 其余 4 条 | 不变（user 渲染、retry 按钮、error 态等） |

### 删除文件

- `frontend/src/lib/stepDescription.test.ts`（随 `stepDescription.ts` 一并删）
- `frontend/src/lib/stepDetail.test.ts`（随 `stepDetail.ts` 一并删）

### 不动的测试文件

`api.test.ts` / `apiClient.test.ts` / `authApi.test.ts` / `authEvents.test.ts` / `storage.test.ts` / `tokenStorage.test.ts` / `stepContent.test.ts` / `AuthContext.test.tsx` / `ChatContext.test.tsx` / `MessageList.test.tsx` / `ChatInput.test.tsx` / `Sidebar.test.tsx` / `TopBar.test.tsx` / `UserMenu.test.tsx` / `ProtectedRoute.test.tsx` / `sanity.test.tsx`。

### 测试运行命令

`frontend/package.json` 已定义：

- `pnpm test` → `vitest run`（CI 模式）
- `pnpm typecheck` → `tsc --noEmit`
- `pnpm lint` → `eslint .`

## 配置与运行

无新增依赖、无环境变量变更、无后端改动。开发命令不变：

```bash
cd frontend && pnpm dev
uv run uvicorn backend.main:app --reload --port 8000
```

## 验证标准

1. `cd frontend && pnpm typecheck`（或仓库实际命令）通过
2. `cd frontend && pnpm lint` 通过
3. `cd frontend && pnpm test` 全部通过：
   - `useChat.test.tsx` 改写后的 11 条用例全过
   - `MessageBubble.test.tsx` 改写后的 6 条用例全过
   - 其余测试文件全部仍通过
4. 启动前后端，发触发工具的对话（如 "北京天气怎么样"），肉眼可见：
   - 占位 assistant 气泡出现 "正在回复…" 提示（无内容）
   - tool_call 步到达时无视觉变化（piece 为空）
   - tools 步到达时气泡出现工具返回的纯文本
   - 末尾 model text 步到达时气泡文本用 `\n\n` 与前一段隔开
   - done 后气泡切换为同一个 `content` 的 markdown 渲染
5. 发纯文本对话（不触发工具），肉眼可见 assistant 文本在 done 前就完整显示
6. 发触发 HTTP 400 的请求（如空 `messages`），肉眼可见 user 消息标红 + 重试按钮，assistant 占位消息被删除

## 范围外（明确不做）

- 后端任何改动。
- 修改 `api.ts` / `apiClient.ts` / SSE 协议。
- 修改 `ChatContext` / `useConversations` / `MessageList` / `ChatWindow` / `ChatInput` / `EmptyState` / `Sidebar` / `TopBar` / `ProtectedRoute`。
- 任何 auth 相关改动。
- 修改 `Conversation` / `Role` 类型。
- 打字光标 / typed-effect 动画。
- 在 UI 上以任何形式展示 tool_call 步骤（删除 TaskListView 后，用户不再看到「正在调用 xxx 工具」之类的提示；如需可后续另立 spec）。
- 折叠/展开、Markdown 实时渲染、流式 markdown 高亮。
- i18n（文案写死中文）。
- 把"是否还有 pending step"做成外露状态（`isSending` 仍由 `useChat` 暴露，`ChatInput` 仍据此禁用）。
- Abort 时清理旧 pending 消息（已知遗留）。
- 引入新依赖。
- 删除 `stepContent.ts` 中的 `toolSummary`（保留 export，YAGNI）。

## 后续可考虑

- 如果用户希望重新看到工具调用的进度，另立一个独立 spec（status bar / inline indicator / drawer 三选一），不动 `message.steps` 数据结构。
- 把流式文本也用 markdown 实时渲染（需要解决半成型 markdown 抖动，可能引入 `marked` 的 streaming mode 或自写 diff-based markdown re-render）。
- 把 `extractText` 的累加策略改为 OpenAI 的 delta 协议（每个字符一块），前提是后端愿意改 SSE 协议。
- 在占位气泡上加一个「停止生成」按钮（目前只有等 done）。
