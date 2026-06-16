# 前端流式步骤详情展示：在 TaskListView 内追加 args / 中间思考 / 工具返回值

- 日期：2026-06-16
- 范围：**仅前端**。在已有「流式任务列表」（`2026-06-13-frontend-stream-tasklist-design.md`）基础上，给每个 step 在描述行下方追加 muted 小字详情行，告知用户智能体实际在干什么。
- 后端 SSE 契约、`useChat` 累积逻辑、`describeStep` 6 条规则、`MessageList` / `ChatContext` / `api.ts` 全部不动。

## 背景与目标

当前 `MessageBubble.tsx` 的 `TaskListView` 把每个 SSE step 渲染为一行简短中文标签（`describeStep`），如「正在调用 get_weather…」。`blocks` 里的实际内容（工具 args、中间思考文本、工具返回内容）被丢弃。用户看不到智能体实际在做什么。

目标：在描述行正下方用小字 muted 样式展示详情，让用户在 done 之前就能看到：

- 即将调用哪个工具 + 关键参数
- 中间思考文本（model step 的 text block）
- 工具返回内容（截断到 500 字符）

末尾 model step（无 tool_call）的最终答案仍走现有逻辑：done 后切换为单 markdown 气泡，task list 内不再追加详情（避免重复渲染）。

## 决策摘要

| 决策点 | 选择 | 理由 |
|---|---|---|
| 详情行位置 | 描述行下方（同行内） | 与澄清选择一致，最小改动，视觉上和时间线圆点对齐 |
| 工具输出截断方式 | 按字符数截断 + `…(已截断)` 后缀 | 与澄清选择一致；纯文本截断对 JSON、单行、长 bash 输出都通用 |
| 截断阈值 | 500 字符（`STEP_DETAIL_MAX_CHARS` 常量） | 与澄清选择一致；够看清一段 bash 错误或文件首段，不至于过度拉长 |
| args 展示 | 仅当 args 是纯对象且非空时 → `key: value` 行数组 | 与澄清选择一致；非对象（string/array/null）返回 null，避免丑陋的 JSON.stringify |
| 中间思考文本 | model step 仅含 text（无 tool_call）时展示 | 与澄清选择一致；model + tool_call 共存时不展示思考（属噪音） |
| 最终答案 | 不在 task list 内展示，done 后切换为 markdown 气泡 | 与澄清选择一致；与现有 `2026-06-13` 设计保持一致 |
| 测试覆盖 | stepDetail.test.ts 全面覆盖 + MessageBubble 追加 1 用例 | 与澄清选择一致 |
| useChat / 后端 | 均不动 | 与澄清选择一致；保持外科手术式修改 |

## 数据模型

无变化。`AssistantStep` 已有 `name` + `blocks`，足够新函数使用。

## 新增文件：`frontend/src/lib/stepDetail.ts`

```ts
import type { AssistantStep } from "@/types";

/** 单行详情超过此字符数时截断;含后缀总长度不超过该值。 */
export const STEP_DETAIL_MAX_CHARS = 500;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…(已截断)`;
}

/** 把纯对象 args 拍平成 ["key1: value1", "key2: value2"];非对象/空对象返回 null。 */
function formatArgs(args: unknown): string[] | null;

/** 拼接 blocks 里所有 type==="text" 的 text;无 text 返回 ""。 */
function extractToolOutput(blocks: Array<Record<string, unknown>>): string;

/** 返回给用户的详情行数组(0..N 行);无详情返回 null。 */
export function describeStepDetail(step: AssistantStep): string[] | null;
```

### 规则表

| `step.name` | blocks 命中 | 返回 |
|---|---|---|
| `model` | 1 个 `tool_call`, args 是纯对象且非空 | `formatArgs(args)` 截断后 |
| `model` | 1 个 `tool_call`, args 非对象或为空 | `null` |
| `model` | 含 text 且无 `tool_call` | `[truncate(extractText(blocks))]` |
| `model` | 同时含 text + tool_call | 走 tool_call 分支（text 不展示） |
| `model` | 空 / 仅有非 text 非 tool_call 块 | `null` |
| `tools` | 任意 blocks | `[truncate(extractToolOutput(blocks))]`，输出为空时 `null` |
| 其它 step 名 | 任意 | 按 `tools` 处理（提取 text） |

> `formatArgs` 实现细节：
> - `typeof args !== "object" || args === null || Array.isArray(args)` → 返回 `null`
> - `Object.keys(args).length === 0` → 返回 `null`
> - 否则 `Object.entries(args).map(([k, v]) => \`${k}: ${String(v)}\`)`，单行超 500 时整行截断（保留 `…(已截断)` 后缀）
>
> 嵌套对象/数组的值按 `String(value)` 渲染（不递归 JSON.stringify），与"key-value 摘要"语义一致。

## 改动文件

### `frontend/src/components/MessageBubble.tsx`

`TaskListView` 内每个 `<li>` 在描述行下方追加可选详情块：

```tsx
<li key={i} className="relative pl-5 text-sm leading-relaxed">
  <span className={cn(/* 现有圆点 */)} />
  {i < steps.length - 1 && (
    <span className="absolute left-[3.5px] top-4 h-[calc(100%+0.5rem)] w-px bg-border" />
  )}
  <div>{describeStep(s)}</div>
  {(() => {
    const detail = describeStepDetail(s);
    if (!detail) return null;
    return detail.map((line, j) => (
      <div
        key={j}
        data-testid="step-detail"
        className="mt-0.5 whitespace-pre-wrap break-all text-xs text-muted-foreground/80"
      >
        {line}
      </div>
    ));
  })()}
</li>
```

要点：
- 详情用 `whitespace-pre-wrap`：保留工具返回里的换行（bash 输出常见多行）
- `text-muted-foreground/80`：比描述行更弱的对比度
- 详情是 `<div>` 而非 `<span>`：长内容会换行不破坏时间线圆点对齐
- 不增加新的 `useState` / 折叠交互；纯静态渲染

其它分支（user / error / thinking / final answer）均不动。

### 不动的文件

- `frontend/src/hooks/useChat.ts`（content 累计策略不变）
- `frontend/src/lib/api.ts` / `apiClient.ts`
- `frontend/src/lib/stepContent.ts` / `stepDescription.ts`
- `frontend/src/context/ChatContext.tsx` / `useConversations.ts`
- `frontend/src/components/MessageList.tsx` / `ChatWindow.tsx` / `ChatInput.tsx` / `EmptyState.tsx` / `Sidebar.tsx` / `TopBar.tsx` / `ProtectedRoute.tsx`
- `frontend/src/types.ts`（AssistantStep 已够用）
- 所有 `frontend/src/components/ui/*`
- 所有 `frontend/src/components/auth/*`
- 所有后端文件（含 `backend/main.py` SSE、schemas、auth）
- `package.json`（零新依赖）
- 后端依赖（pyproject.toml）

## 数据流

正常路径（天气查询，3 step → final answer）：

```
useChat.send("What's the weather in SF?")
  │
  ▼ SSE steps
  │
  ├─ step "model" (tool_call: {city: "SF"})
  │   ├─ steps[0] = { name: "model", blocks: [{ type: "tool_call", name: "get_weather", args: {city: "SF"} }] }
  │   ├─ TaskListView 渲染:
  │   │     ●  正在准备调用 get_weather…
  │   │        city: SF                  ← describeStepDetail 新行
  │   └─ content 累计: 现有逻辑不变(content 仍由后续 text step 决定)
  │
  ├─ step "tools" (ToolMessage.content: "Sunny, 22℃")
  │   ├─ steps[1] = { name: "tools", blocks: [{ type: "text", text: "Sunny, 22℃" }] }
  │   └─ TaskListView 渲染:
  │        ●  正在调用 get_weather…
  │           Sunny, 22℃                  ← describeStepDetail 新行
  │
  ├─ step "model" (text: "It's always sunny in SF!")
  │   ├─ steps[2] = { name: "model", blocks: [{ type: "text", text: "It's always sunny in SF!" }] }
  │   ├─ TaskListView 渲染:
  │   │     ●  正在生成回复…
  │   │        It's always sunny in SF!   ← describeStepDetail 新行
  │   └─ content = "It's always sunny in SF!"
  │
  ▼ done
  ├─ pending = false
  └─ MessageBubble 切换到 FinalAnswerView(单 markdown 气泡)
```

错误路径：与现有逻辑一致。`error && steps` 同时存在时优先走 error 分支，详情行不展示。

Abort 路径：不变（仍为已知遗留 — 旧消息卡在 pending）。

## 错误处理

| 边界 | 行为 |
|---|---|
| `step.name` 不在已知集合 | `describeStepDetail` 走 `tools` 分支（提取 text） |
| blocks 含未知 type（如 `reasoning`） | `extractText` / `extractToolOutput` 仅取 `type === "text"`，其它忽略 |
| args 非对象（string/array/null） | `formatArgs` 返回 `null` |
| args 是空对象 `{}` | `formatArgs` 返回 `null` |
| args value 是嵌套对象 | 按 `String(value)` 输出，不递归 JSON.stringify |
| 工具返回 > 500 字符 | 截断 + `…(已截断)` 后缀 |
| 工具返回 ≤ 500 字符 | 原样输出 |
| 工具返回含 `\n` | 保留换行（CSS `whitespace-pre-wrap`） |
| 工具返回为空字符串 | 返回 `null` |
| `message.error` 态 | 详情行不渲染（error 分支优先于 steps 分支） |
| 模型同时返回 text + tool_call | 走 tool_call 分支（text 视为噪音） |

## 测试

### `frontend/src/lib/stepDetail.test.ts`（新增，约 12 用例）

| 用例 | 断言 |
|---|---|
| `model + tool_call with object args returns key-value lines` | 输入 `{city: "SF"}` → `["city: SF"]` |
| `model + tool_call with empty object args returns null` | `{}` → `null` |
| `model + tool_call with string args returns null` | `"foo"` → `null` |
| `model + tool_call with array args returns null` | `[1, 2]` → `null` |
| `model + tool_call with null args returns null` | `null` → `null` |
| `model + only text returns truncated text` | 单 text → `[text]` |
| `model + text + tool_call prefers tool_call` | text + tool_call → 走 tool_call 分支 |
| `model + empty blocks returns null` | `[]` → `null` |
| `tools + text returns tool output` | `[{type:"text", text:"out"}]` → `["out"]` |
| `tools + empty blocks returns null` | `[]` → `null` |
| `truncates content over STEP_DETAIL_MAX_CHARS with suffix` | 600 字符 text → `[<500 字符>…(已截断)]` |
| `does not truncate under limit` | 恰好 500 字符 → 不带后缀 |
| `preserves insertion order of args` | `{z: 1, a: 2, m: 3}` → `["z: 1", "a: 2", "m: 3"]` |

### `frontend/src/components/MessageBubble.test.tsx`（追加 1 用例）

| 用例 | 断言 |
|---|---|
| `renders step detail below description for model+tool_call` | 喂 steps=`[{name:"model", blocks:[{type:"tool_call", name:"get_weather", args:{city:"SF"}}]}]` + pending=true，断言 `data-testid="step-detail"` 元素出现且文本含 `city: SF` |

保留全部现有 MessageBubble 用例。

### 不动的测试文件

`stepContent.test.ts` / `stepDescription.test.ts` / `useChat.test.tsx` / `MessageList.test.tsx` / `ChatInput.test.tsx` / `Sidebar.test.tsx` / `TopBar.test.tsx` / `UserMenu.test.tsx` / `ProtectedRoute.test.tsx` / `api.test.ts` / `apiClient.test.ts` / `authApi.test.ts` / `authEvents.test.ts` / `storage.test.ts` / `tokenStorage.test.ts` / `AuthContext.test.tsx` / `ChatContext.test.tsx` / `sanity.test.tsx`。

## 配置与运行

无新增依赖。开发命令不变：

```bash
cd frontend && pnpm dev
uv run uvicorn backend.main:app --reload --port 8000
```

## 验证标准

1. `cd frontend && pnpm typecheck` 通过
2. `cd frontend && pnpm lint` 通过
3. `cd frontend && pnpm test` 全部通过：
   - 新增 `stepDetail.test.ts`（12+ 用例）
   - 新增 1 个 MessageBubble 用例
   - 现有测试文件全部仍通过
4. 启动前后端，发触发工具的对话（如 "北京天气怎么样"），肉眼可见：
   - 第一步 `model + tool_call` 行下方有 `city: 北京`
   - 第二步 `tools` 行下方有工具返回值
   - 第三步 `model + text` 行下方有思考文本
   - done 后切换为单个 markdown 答案气泡
5. 发会触发长工具返回的对话（如 "列出当前目录下所有文件"），肉眼可见工具返回行末尾出现 `…(已截断)`
6. 发纯文本对话（不触发工具），肉眼可见 model + text 行下方有思考文本，done 后切换为最终答案

## 范围外（明确不做）

- 后端任何改动。
- 修改 `useChat` 的 content 累计策略（最后一个含 text 的 model step 作为最终答案）。
- 修改 `describeStep` 现有 6 条规则。
- 折叠/展开、手风琴、动画。
- i18n（文案写死中文）。
- 引入新依赖（无）。
- Abort 时清理旧 pending 消息（已知遗留）。
- 修改 `MessageList` / `ChatContext` / `useConversations` / `api.ts` / `storage.ts` / `utils.ts`。
- 修改 auth、ProtectedRoute、LoginPage、RegisterPage、SettingsPage、NotFoundPage、TopBar、Sidebar。
- 修改 `AppRoutes` / `App.tsx` / `main.tsx`。
- 修改 `types.ts`（AssistantStep 字段已够用）。
- 把 `STEP_DETAIL_MAX_CHARS` 抽到 `frontend/src/config/*`（MVP 用不到；YAGNI）。

## 后续可考虑

- 把截断阈值按工具类型分别配置（如 bash 输出 2000 字符，文件读取 500 字符）。
- 给长输出加"展开"按钮，点击加载完整内容（懒加载到 Modal）。
- 工具返回含 Markdown / JSON 时按对应格式渲染。
- 在 `code_agent` 场景中暴露实际执行的 shell 命令与返回的 stdout/stderr 区分。