# 前端流式交互：运行中任务列表 + 完成态单气泡设计

- 日期：2026-06-13
- 范围：**仅前端**。把"每个 SSE step 一条消息"改成"一轮一个 assistant 消息，内部带 steps 列表"，运行中按 `done.png` 风格渲染时间线任务列表，结束后切换为单条最终答案气泡（`running.png`）。后端契约（已在 `2026-06-13-streaming-chat-endpoint-design.md` 落地）不动。

## 背景与目标

当前 `useChat` 在每个 `step` 事件上 `addMessage` 一条 assistant 消息。一个 agent 回合（model→tools→model 三步）在 UI 上是 3 个独立气泡，散乱且看不出"同一轮推理"。任务列表样式（参考 `done.png`）能让用户清晰看到 agent 在做什么；结束后只保留最终答案（参考 `running.png`），避免信息噪声。

设计原则：
- **简洁优先**：一个 turn = 一个 assistant 消息，渲染分支最少。
- **沿用既有约定**：`pending` / `error` / abort / retry 全部保留，不引入新概念。
- **不依赖后端改动**：步骤文案前端内置映射；后端 SSE 事件原样消费。
- **零新依赖**：头像用纯 div + Tailwind，脉冲用 CSS `@keyframes`，不动 `package.json`。

## 决策摘要（来自 brainstorming 澄清）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 步骤文案来源 | 前端内置静态映射 | 不改后端；weather agent 场景够用；扩展时改 `describeStep` |
| 最终答案识别 | 最后一个含 text 的 step | 不需要后端加 final 事件；语义清晰 |
| 切换动画 | 无过渡，直接切换 | 与现状极简风格一致；零动画依赖 |

## 数据模型（`frontend/src/types.ts`）

```ts
/** 单个 SSE step 的原始数据,从前端视角聚合。 */
export interface AssistantStep {
  /** LangChain step 名,如 "model" / "tools" */
  name: string;
  /** 该 step 的原始 content blocks */
  blocks: Array<Record<string, unknown>>;
}

export interface ChatMessage {
  id: string;
  role: Role;
  /** Markdown 文本。assistant 上等于"最后一个含 text 的 step"的拼接文本;无 text 时为该 step 的 tool_call 摘要。 */
  content: string;
  createdAt: number;
  pending?: boolean;
  error?: boolean;
  /** assistant 专用:本轮所有 step。第一次 step 事件后即存在,旧消息无此字段视为非流式。 */
  steps?: AssistantStep[];
}
```

> 移除原来的 `step?: string`（单步名）。MessageBubble 的渲染分支天然兼容旧消息：没有 `steps` 字段时按"非流式 assistant"处理，直接渲染 content 气泡。

## 组件

### `frontend/src/lib/stepContent.ts`（新增）

把 useChat 中现有的私有 `renderStepContent` 拆成两个具名纯函数：

```ts
/** 拼接 blocks 里所有 type==="text" 的 text 字段;无 text 返回 ""。 */
export function extractText(blocks: Array<Record<string, unknown>>): string;

/** 把 tool_call 块渲染为占位字符串,多块用 "\n" 分隔;无 tool_call 返回 ""。 */
export function toolSummary(blocks: Array<Record<string, unknown>>): string;
```

实现逻辑直接搬现有 `renderStepContent`，仅做命名拆分。

### `frontend/src/lib/stepDescription.ts`（新增）

```ts
import type { AssistantStep } from "@/types";

function findToolCall(step: AssistantStep): { name: string } | null;
function hasText(step: AssistantStep): boolean;

/** 把 LangChain step + blocks 翻译成给用户看的中文描述。 */
export function describeStep(step: AssistantStep): string;
```

规则：
- `name === "tools"` 且有 tool_call → `"正在调用 <name>…"`
- `name === "tools"` 无 tool_call → `"正在执行工具…"`
- `name === "model"` 且有 text → `"正在生成回复…"`
- `name === "model"` 且仅有 tool_call → `"正在准备调用 <name>…"`
- `name === "model"` 无 text/tool_call → `"正在思考…"`
- 其他 → `"执行 <name>…"`

### `frontend/src/hooks/useChat.ts`（重写 send 主循环）

新增 import（其余 imports 不变）：

```ts
import { extractText, toolSummary } from "@/lib/stepContent";
import type { AssistantStep, ChatMessage } from "@/types";
```

主循环：

```ts
// useChat 函数体内,send 之外,与其他 ref 同级:
const assistantRef = useRef<{ steps: AssistantStep[]; content: string } | null>(null);

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

  const payload = [{ role: "user", content: trimmed }];

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
      return; // 静默
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
}, [currentId, addMessage, updateMessage, renameIfFirstUserMessage, ctx]);
```

要点：
- `assistantId` 一旦建立整个 for-await 期间不变；所有 step 追加到同一个消息。
- 后续 step 的 `content` 策略：`extractText` 有值则覆盖（语义：最后一个 text step 是当前答案），否则保留旧 content（避免 tool_call 摘要覆盖前面的 text 答案）。
- 移除原有 `lastAssistantId` 概念。

### `frontend/src/components/MessageBubble.tsx`（重写）

渲染分支：

```tsx
if (isUser)              → 现有 user 气泡(完全不变)
else if (message.error)  → 现有错误态气泡(pending=false, error=true;显示 content + 重试按钮)
else if (message.steps)  → 分两个子态:
  pending === true       → TaskListView(steps, describeStep)
  pending === false      → FinalAnswerView(content, 现有 markdown 渲染)
else                     → 兼容老消息:FinalAnswerView(content)
```

`TaskListView`（嵌入在 MessageBubble 内部，约 30 行）：

```tsx
<div className="flex items-start gap-2" data-testid="task-list">
  {/* 占位头像 */}
  <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-muted" aria-hidden />
  <div className="flex flex-col">
    <div className="mb-1 text-xs text-muted-foreground">智能体 正在回复…</div>
    <ol className="flex flex-col gap-1.5">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        return (
          <li key={i} className="relative pl-5 text-sm">
            <span
              className={cn(
                "absolute left-0 top-1.5 inline-block h-2 w-2 rounded-full",
                isLast
                  ? "border border-muted-foreground bg-background animate-[pulse_1.5s_ease-in-out_infinite]"
                  : "bg-foreground",
              )}
            />
            {i < steps.length - 1 && (
              <span className="absolute left-[3.5px] top-4 h-full w-px bg-border" />
            )}
            {describeStep(s)}
          </li>
        );
      })}
    </ol>
  </div>
</div>
```

`FinalAnswerView`：提取现有 markdown 渲染 + 头像气泡为独立子函数，复用现有 `<ReactMarkdown>` 配置（链接白名单、code 块高亮）。

脉冲动画用 Tailwind 任意值 `animate-[pulse_1.5s_ease-in-out_infinite]`（Tailwind 已支持 JIT）；如不可用则改 `index.css` 加 `@keyframes pulse-dot`。

## 数据流

正常路径（一次天气查询，SSE 推 model→tools→model→done）：

```
send("What's the weather in SF?")
  │
  ├─ addMessage(userMsg, pending: true)
  │
  ▼ for-await step events:
  │
  ├─ step "model" (tool_call)   ← 第一个 step
  │   ├─ assistantId = newId()
  │   └─ addMessage(assistantMsg, {
  │        content: "调用工具: get_weather(...)",
  │        pending: true,
  │        steps: [step1],
  │      })
  │
  ├─ step "tools" (text)
  │   └─ updateMessage(assistantMsg, {
  │        content: "It's always sunny in SF!",
  │        steps: [step1, step2],
  │      })
  │
  ├─ step "model" (text)
  │   └─ updateMessage(assistantMsg, {
  │        content: "It's always sunny in SF!",
  │        steps: [step1, step2, step3],
  │      })
  │
  ▼ done
  ├─ updateMessage(assistantMsg, { pending: false })   ← UI 切到最终答案气泡
  ├─ updateMessage(userMsg, { pending: false })
  └─ renameIfFirstUserMessage(...)
```

UI 视角：
- t0：用户消息 + assistant 任务列表（3 步，最后一步脉冲）
- t1（done）：assistant 切换为单个气泡，内容 = "It's always sunny in SF!"

错误路径（流中途 `event: error`）：

```
step "model" (text)
  └─ addMessage(assistantMsg, pending: true, steps: [step1])
error { detail: "rate limit" }
  ├─ updateMessage(assistantMsg, { pending: false, error: true })   ← 错误态气泡
  ├─ updateMessage(userMsg, { pending: false })
  └─ toast("rate limit")
```

边界（流中途用户发新消息）：

```
旧流: streamChat(...) 正在 yield → assistantMsg-1 显示任务列表
新流: send("b")
  ├─ abortRef.current.abort()              ← 旧流 controller 触发
  ├─ streamChat 内部 reader.cancel()       ← fetch 中断
  ├─ 旧 for-await 抛 AbortError → useChat 静默返回
  └─ 旧 assistantMsg-1 保持 pending: true  ← 视觉上"卡在最后一个 step"
```

> 这是已知遗留视觉态：旧流的 assistant 消息永远 pending（永不变成最终答案）。MVP 不修复（用户切会话时旧消息不再可见）。如需修：在 `send` 开头 `abortRef.current?.abort()` 之后，对 `currentId` 里的所有 `role==="assistant" && pending` 消息执行 `updateMessage(id, m.id, { pending: false })`。

## 错误处理

| 失败点 | useChat 行为 |
|---|---|
| HTTP 400 / 422 | userMsg 标 error + pending:false；toast "消息不能为空" |
| HTTP 5xx | userMsg 标 error；toast "智能体暂时不可用" |
| 流中 `event: error` | assistantMsg（若已建）标 pending:false + error:true；userMsg 标 pending:false；toast detail |
| SSE 解析失败 | 同 HTTP 5xx 路径 |
| `AbortError` | 静默返回 |

`error && pending` 不再共存：error 路径一律先把 pending 设 false。MessageBubble 错误态分支优先于 steps 分支，所以即使有 steps 也会渲染错误气泡。

## 测试

### `frontend/src/lib/stepContent.test.ts`（新增）

| 用例 | 断言 |
|---|---|
| `extractText concatenates multiple text blocks` | 输入 2 个 text 块 → 拼接字符串 |
| `extractText ignores tool_call blocks` | 输入 1 text + 1 tool_call → 仅 text |
| `extractText returns empty string when no text blocks` | 仅 tool_call → "" |
| `toolSummary formats single tool_call` | 1 tool_call → `"调用工具: name({...})"` |
| `toolSummary joins multiple tool_calls with newline` | 2 tool_call → 两行 |
| `toolSummary returns empty when no tool_call` | 仅 text → "" |

### `frontend/src/lib/stepDescription.test.ts`（新增）

| 用例 | 断言 |
|---|---|
| `tools step with tool_call` | `"正在调用 get_weather…"` |
| `tools step without tool_call` | `"正在执行工具…"` |
| `model step with text` | `"正在生成回复…"` |
| `model step with tool_call only` | `"正在准备调用 get_weather…"` |
| `model step empty` | `"正在思考…"` |
| `unknown step name` | `"执行 <name>…"` |

### `frontend/src/hooks/useChat.test.tsx`（重写流式用例）

| 旧用例 | 新用例 |
|---|---|
| `streams 3 step events then done, producing 3 assistant messages with step labels` | `aggregates 3 step events into 1 assistant message with steps.length === 3` |
| `renders tool_call step as 占位文字 in content` | `first step tool_call sets content to tool summary, stored in steps[0]` |
| `concatenates text blocks for text step` | `later text step overrides content to its own text` |

新增：

| 用例 | 断言 |
|---|---|
| `first step with text sets content immediately` | 1 个 model+text step → `content === text && pending === true` |
| `done flips assistant pending to false but keeps content` | 1 step + done → assistant.pending=false，content 不变 |
| `event: error marks assistant pending=false + error=true` | step + error → assistant.pending=false, error=true |

保留（与流式无关）：
- `marks user message as error on HTTP 400`
- `aborts the prior in-flight stream when a new send starts`
- `ignores empty input`
- `sends only the current user message, no history`

### `frontend/src/components/MessageBubble.test.tsx`（新增 task list 用例）

| 用例 | 断言 |
|---|---|
| `renders task list when assistant message has steps and is pending` | 喂 steps=[2 个]，断言 DOM 出现两个 `describeStep` 文本 |
| `renders final answer markdown when assistant message is not pending` | 喂 steps=[1 个] + pending=false，断言 markdown 渲染（`<strong>...</strong>`） |
| `renders error state when assistant message has error flag` | 喂 errorMsg，断言重试按钮出现 |

保留全部现有用例。

### 不动的文件

- `frontend/src/lib/api.ts`（streamChat / SSE 解析不变）
- `frontend/src/context/ChatContext.tsx`
- `frontend/src/hooks/useConversations.ts`
- `frontend/src/components/MessageList.tsx`
- `frontend/src/components/ChatInput.tsx` / `ChatWindow.tsx` / `EmptyState.tsx` / `Sidebar.tsx` / `App.tsx`
- `frontend/src/lib/storage.ts` / `utils.ts`
- 所有 `components/ui/*` 组件
- `package.json`（无新依赖）

## 配置与运行

无新增依赖。开发命令不变：

```bash
cd frontend && pnpm dev   # 前端
uv run uvicorn backend.main:app --reload --port 8000   # 后端
```

## 验证标准

1. `cd frontend && pnpm typecheck` 无错误。
2. `cd frontend && pnpm lint` 无错误。
3. `cd frontend && pnpm test` 全部通过：
   - `stepContent.test.ts`（6 用例）
   - `stepDescription.test.ts`（6 用例）
   - `useChat.test.tsx`（7 用例：3 新流式语义 + 4 保留）
   - `MessageBubble.test.tsx`（8 用例：5 现有 + 3 新）
   - 其他现有测试文件不动
4. 启动前后端，发"天气查询"：
   - 流中看到任务列表（3 步：准备调用 get_weather → 执行工具 → 生成回复）
   - 最后一步空心圆 + 脉冲
   - done 后列表消失，出现单个最终答案气泡
5. 手动验证：故意停后端再发 → userMsg 标 error + toast。
6. 手动验证：流中途发新消息 → 旧消息卡在 pending（已知遗留），新会话正常工作。

## 范围外（明确不做）

- 后端 `stream_mode='messages'` token 级流（打字机效果）。
- agent 头像 / 名字的可配置化（写死"智能体"占位）。
- 任务列表的折叠 / 展开 / "查看思考过程"按钮。
- Abort 时清理旧 pending 消息（已知遗留）。
- 修改 `MessageList` / `ChatContext` / `useConversations` / `api.ts` / 后端任一文件。
- 引入新依赖（`framer-motion` 等）。
- 国际化（i18n）—— 文案写死中文。

## 后续可考虑

- Abort 时把旧 assistant 消息 pending 置 false（已知遗留修复）。
- 把"智能体"名称 / 头像来源做成 `frontend/src/config/agent.ts` 常量，方便后续多 agent 切换。
- 引入 token 级流后，MessageBubble 可根据是否含 token 切换"打字机"或"任务列表"两种运行态。
- 给 task list 加"已完成 N 步 / 共 N 步"计数（仅当 steps.length > 4 时显示，避免视觉噪声）。