# 流式步骤详情展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有 TaskListView 时间线基础上，给每个 SSE step 在描述行下方追加 muted 小字详情行，展示工具 args 摘要 / 中间思考文本 / 工具返回内容（截断到 500 字符），让用户看到智能体实际执行步骤。

**Architecture:** 新增 `frontend/src/lib/stepDetail.ts` 纯函数模块（与现有 `stepContent.ts` / `stepDescription.ts` 同模式），`MessageBubble.tsx` 的 `TaskListView` 在描述行下方条件渲染详情。零后端改动、零 `useChat` 改动、零新依赖。

**Tech Stack:** React 18 + TypeScript 5 + Vitest + Tailwind 3（已有）

---

## File Structure

### 新增文件

| 路径 | 职责 |
|---|---|
| `frontend/src/lib/stepDetail.ts` | `describeStepDetail(step)` 纯函数 + `STEP_DETAIL_MAX_CHARS` 常量 + 私有 `truncate` / `formatArgs` / `extractToolOutput` 辅助函数 |
| `frontend/src/lib/stepDetail.test.ts` | Vitest 单测，覆盖规则表全部 12 个用例 |

### 修改文件

| 路径 | 改动 |
|---|---|
| `frontend/src/components/MessageBubble.tsx` | `TaskListView` 内每个 `<li>` 在 `describeStep(s)` 下方追加 `describeStepDetail(s)` 详情行；新增 import |
| `frontend/src/components/MessageBubble.test.tsx` | 追加 1 个用例：model+tool_call step 的详情行渲染 |

### 不动的文件（明确列出供 agent 参考）

- `frontend/src/hooks/useChat.ts`（content 累计策略不变）
- `frontend/src/lib/api.ts` / `apiClient.ts` / `stepContent.ts` / `stepDescription.ts`
- `frontend/src/types.ts`（`AssistantStep` 已够用）
- `frontend/src/context/ChatContext.tsx` / `useConversations.ts`
- `frontend/src/components/MessageList.tsx` / `ChatWindow.tsx` / `ChatInput.tsx` / `EmptyState.tsx` / `Sidebar.tsx` / `TopBar.tsx` / `ProtectedRoute.tsx`
- 所有 `frontend/src/components/auth/*` / `ui/*`
- 所有后端文件（`backend/main.py` SSE、schemas、auth、agent_loader、db、models、alembic）
- `package.json`（零新依赖）

---

## Task 1: 新增 `frontend/src/lib/stepDetail.ts` 模块与完整单测

**Files:**
- Create: `frontend/src/lib/stepDetail.ts`
- Create: `frontend/src/lib/stepDetail.test.ts`

- [ ] **Step 1: 写失败的测试 — `describeStepDetail` 全部 12 个用例**

写入 `frontend/src/lib/stepDetail.test.ts`：

```tsx
import { describe, it, expect } from "vitest";
import {
  describeStepDetail,
  STEP_DETAIL_MAX_CHARS,
} from "./stepDetail";
import type { AssistantStep } from "@/types";

function step(
  name: string,
  blocks: Array<Record<string, unknown>>,
): AssistantStep {
  return { name, blocks };
}

describe("describeStepDetail", () => {
  it("model + tool_call with object args returns key-value lines", () => {
    expect(
      describeStepDetail(
        step("model", [
          {
            type: "tool_call",
            name: "get_weather",
            args: { city: "SF" },
          },
        ]),
      ),
    ).toEqual(["city: SF"]);
  });

  it("model + tool_call with empty object args returns null", () => {
    expect(
      describeStepDetail(
        step("model", [
          { type: "tool_call", name: "noop", args: {} },
        ]),
      ),
    ).toBeNull();
  });

  it("model + tool_call with string args returns null", () => {
    expect(
      describeStepDetail(
        step("model", [
          { type: "tool_call", name: "x", args: "raw" },
        ]),
      ),
    ).toBeNull();
  });

  it("model + tool_call with array args returns null", () => {
    expect(
      describeStepDetail(
        step("model", [
          { type: "tool_call", name: "x", args: [1, 2] },
        ]),
      ),
    ).toBeNull();
  });

  it("model + tool_call with null args returns null", () => {
    expect(
      describeStepDetail(
        step("model", [
          { type: "tool_call", name: "x", args: null },
        ]),
      ),
    ).toBeNull();
  });

  it("model + only text returns truncated text", () => {
    expect(
      describeStepDetail(
        step("model", [
          { type: "text", text: "让我想一下…" },
        ]),
      ),
    ).toEqual(["让我想一下…"]);
  });

  it("model + text + tool_call prefers tool_call (ignores text)", () => {
    expect(
      describeStepDetail(
        step("model", [
          { type: "text", text: "noise" },
          { type: "tool_call", name: "x", args: { k: 1 } },
        ]),
      ),
    ).toEqual(["k: 1"]);
  });

  it("model + empty blocks returns null", () => {
    expect(describeStepDetail(step("model", []))).toBeNull();
  });

  it("tools + text returns tool output", () => {
    expect(
      describeStepDetail(
        step("tools", [{ type: "text", text: "Sunny, 22℃" }]),
      ),
    ).toEqual(["Sunny, 22℃"]);
  });

  it("tools + empty blocks returns null", () => {
    expect(describeStepDetail(step("tools", []))).toBeNull();
  });

  it("truncates content over STEP_DETAIL_MAX_CHARS with suffix", () => {
    const long = "x".repeat(STEP_DETAIL_MAX_CHARS + 100);
    const result = describeStepDetail(
      step("tools", [{ type: "text", text: long }]),
    );
    expect(result).not.toBeNull();
    expect(result![0]).toBe("x".repeat(STEP_DETAIL_MAX_CHARS) + "…(已截断)");
  });

  it("does not truncate under limit", () => {
    const exact = "y".repeat(STEP_DETAIL_MAX_CHARS);
    expect(
      describeStepDetail(step("tools", [{ type: "text", text: exact }])),
    ).toEqual([exact]);
  });

  it("preserves insertion order of args", () => {
    expect(
      describeStepDetail(
        step("model", [
          {
            type: "tool_call",
            name: "x",
            args: { z: 1, a: 2, m: 3 },
          },
        ]),
      ),
    ).toEqual(["z: 1", "a: 2", "m: 3"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && pnpm test stepDetail.test.ts
```

预期：FAIL，错误 `Failed to resolve import "./stepDetail"` 或 `describeStepDetail is not a function`。

- [ ] **Step 3: 实现 `frontend/src/lib/stepDetail.ts`**

```ts
import type { AssistantStep } from "@/types";

/** 单行详情超过此字符数时截断到 `max` 字符 + `…(已截断)` 后缀。
 *  实际输出长度 = max + 6 字符后缀。 */
export const STEP_DETAIL_MAX_CHARS = 500;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…(已截断)`;
}

/** 拼接 blocks 里所有 type==="text" 的 text 字段;无 text 返回 ""。 */
function extractToolOutput(
  blocks: Array<Record<string, unknown>>,
): string {
  return blocks
    .filter(
      (b): b is { type: string; text: string } => b.type === "text",
    )
    .map((b) => b.text)
    .join("");
}

/** 把纯对象 args 拍平成 ["key1: value1", ...];非对象/空对象返回 null。 */
function formatArgs(args: unknown): string[] | null {
  if (
    args === null ||
    typeof args !== "object" ||
    Array.isArray(args)
  ) {
    return null;
  }
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${String(v)}`);
}

/** 返回该 step 给用户的详情行数组(0..N 行);无详情返回 null。 */
export function describeStepDetail(step: AssistantStep): string[] | null {
  if (step.name === "model") {
    const toolCall = step.blocks.find((b) => b.type === "tool_call");
    if (toolCall) {
      const lines = formatArgs(toolCall.args);
      if (!lines) return null;
      return lines.map((line) => truncate(line, STEP_DETAIL_MAX_CHARS));
    }
    const text = extractToolOutput(step.blocks);
    if (!text) return null;
    return [truncate(text, STEP_DETAIL_MAX_CHARS)];
  }
  // tools 步骤以及其它未知 step 名:统一提取 text
  const text = extractToolOutput(step.blocks);
  if (!text) return null;
  return [truncate(text, STEP_DETAIL_MAX_CHARS)];
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && pnpm test stepDetail.test.ts
```

预期：13 个用例全部 PASS（3 个 describe 块，共 13 个 `it`）。

- [ ] **Step 5: 运行 typecheck 与 lint**

```bash
cd frontend && pnpm typecheck
cd frontend && pnpm lint
```

预期：两个命令均无错误。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/stepDetail.ts frontend/src/lib/stepDetail.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): 加 describeStepDetail 步骤详情函数

在 TaskListView 时间线基础上，提供 500 字符截断的步骤详情：
- model + tool_call: 展示 args key-value 摘要
- model + text: 展示中间思考文本
- tools step: 展示工具返回内容

零新依赖,仅前端纯函数。
EOF
)"
```

---

## Task 2: 修改 `MessageBubble.tsx` 在 TaskListView 内追加详情行

**Files:**
- Modify: `frontend/src/components/MessageBubble.tsx:42-83` (TaskListView 内部)
- Test: `frontend/src/components/MessageBubble.test.tsx`

- [ ] **Step 1: 追加失败的测试 — 详情行渲染**

打开 `frontend/src/components/MessageBubble.test.tsx`，先读现状以确认导入与现有用例风格（agent 可读后插入；测试代码必须使用项目现有的 `describeStep` import 风格）。

在文件末尾（最后一个 `describe` 块内）追加：

```tsx
it("renders step detail below description for model+tool_call", () => {
  const message: ChatMessage = {
    id: "a1",
    role: "assistant",
    content: "",
    createdAt: Date.now(),
    pending: true,
    steps: [
      {
        name: "model",
        blocks: [
          {
            type: "tool_call",
            name: "get_weather",
            args: { city: "San Francisco" },
          },
        ],
      },
    ],
  };
  render(<MessageBubble message={message} />);
  expect(screen.getByTestId("step-detail")).toHaveTextContent(
    "city: San Francisco",
  );
});
```

> 详细路径：`frontend/src/components/MessageBubble.test.tsx`，找到最后一个 `it(` 调用，在其后插入。**不要**删除现有用例。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && pnpm test MessageBubble.test.tsx
```

预期：FAIL，错误 `Unable to find an element by: [data-testid="step-detail"]`（task list 已渲染但 detail 元素尚不存在）。

- [ ] **Step 3: 修改 `MessageBubble.tsx`**

打开 `frontend/src/components/MessageBubble.tsx`，做两处改动：

**(3a)** 在文件顶部 imports 中追加（紧跟现有 `import { describeStep } from "@/lib/stepDescription";` 之后）：

```tsx
import { describeStepDetail } from "@/lib/stepDetail";
```

**(3b)** 替换 `TaskListView` 组件内的 `<li>` 渲染。当前代码（57-79 行附近）：

```tsx
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
```

替换为：

```tsx
{steps.map((s, i) => {
  const isLast = i === steps.length - 1;
  const detail = describeStepDetail(s);
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
      <div>{describeStep(s)}</div>
      {detail?.map((line, j) => (
        <div
          key={j}
          data-testid="step-detail"
          className="mt-0.5 whitespace-pre-wrap break-all text-xs text-muted-foreground/80"
        >
          {line}
        </div>
      ))}
    </li>
  );
})}
```

> 关键改动：
> - 在 `{describeStep(s)}` 外包一层 `<div>`（让详情行能换行不破坏圆点对齐）
> - 用 `describeStepDetail(s)` 计算详情（null 不渲染）
> - 详情行使用 `whitespace-pre-wrap` + `text-muted-foreground/80` + `text-xs` + `break-all`
> - 测试标识 `data-testid="step-detail"`

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && pnpm test MessageBubble.test.tsx
```

预期：所有用例 PASS（含刚追加的 1 个）。

- [ ] **Step 5: 运行全部前端测试**

```bash
cd frontend && pnpm test
```

预期：所有测试 PASS（含 stepDetail、MessageBubble、其他既有测试）。

- [ ] **Step 6: 运行 typecheck 与 lint**

```bash
cd frontend && pnpm typecheck
cd frontend && pnpm lint
```

预期：均无错误。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/MessageBubble.tsx frontend/src/components/MessageBubble.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): TaskListView 追加步骤详情行

在描述行下方以 muted 小字展示:
- 工具 args 摘要(key-value)
- 中间思考文本
- 工具返回内容(500 字符截断)

whitespace-pre-wrap 保留多行输出,text-muted-foreground/80
保持视觉对比度弱于描述行。
EOF
)"
```

---

## Task 3: 端到端验证

**Files:** 无改动

- [ ] **Step 1: 启动后端**

```bash
uv run uvicorn backend.main:app --reload --port 8000
```

预期：Uvicorn 启动在 8000，无报错。

- [ ] **Step 2: 启动前端 dev server**

新开终端：

```bash
cd frontend && pnpm dev
```

预期：Vite dev server 启动。

- [ ] **Step 3: 手动验证工具调用对话**

打开浏览器登录后，发："北京天气怎么样"。

肉眼可见：
- 第一步 task list：`●  正在准备调用 get_weather…` 下方小字 `city: 北京`
- 第二步 task list：`●  正在调用 get_weather…` 下方小字 `Sunny, 22℃` 之类
- 第三步 task list：`●  正在生成回复…` 下方小字 `…思考文本…`
- done 后切换为单个 markdown 最终答案气泡

- [ ] **Step 4: 手动验证长工具输出截断**

发："列出当前目录所有文件"（触发 `run_bash` 长输出）或类似能产生 >500 字符输出的提示词。

肉眼可见：工具返回行末尾出现 `…(已截断)`。

- [ ] **Step 5: 手动验证纯文本对话（无工具调用）**

发："你好" 或任意不需要工具的对话。

肉眼可见：model + text step 下方有思考文本；done 后切换为最终答案气泡。

- [ ] **Step 6: 完整测试套件最终运行**

```bash
cd frontend && pnpm test
uv run pytest
```

预期：所有测试 PASS（注意：项目已知 2 个 pytest 失败 + 8 个 mypy 错误来自 `weather_agent → code_agent` 迁移未完成，是预存在遗留，与本次改动无关，不阻塞本次任务）。

- [ ] **Step 7: 最终 commit（如有遗漏）**

若步骤 3-5 中有任何 hotfix，单独 commit；否则不新增 commit。

---

## Self-Review

**1. Spec 覆盖检查**

| Spec 段落 / 需求 | 对应 Task |
|---|---|
| 新增 `frontend/src/lib/stepDetail.ts`（含常量 + 3 个辅助函数 + 主函数） | Task 1 |
| `STEP_DETAIL_MAX_CHARS = 500` 常量导出 | Task 1 |
| 规则表 7 条（model + 4 种 / tools + 空 / 其它 step 名） | Task 1 |
| `formatArgs` 非对象 → null | Task 1 |
| `formatArgs` 空对象 → null | Task 1 |
| `args` value 嵌套 → `String(value)` 不递归 | Task 1 |
| `truncate(s, max)` 含后缀语义 | Task 1 |
| `MessageBubble.tsx` TaskListView 详情行渲染 | Task 2 |
| `whitespace-pre-wrap` + `text-muted-foreground/80` 样式 | Task 2 |
| `data-testid="step-detail"` | Task 2 |
| 不改 `useChat` / 后端 / `describeStep` | Task 2（明确不动）+ Task 3 验证 |
| 12+ 单元测试 + MessageBubble 追加 1 用例 | Task 1 + Task 2 |
| 验证标准 1-6 条 | Task 3 |
| 范围外（折叠、动画、i18n、新依赖、Abort 旧消息、types.ts 等） | 全程未触碰 |

**2. Placeholder 扫描**

- 无 TBD / TODO / "implement later"
- 无 "类似 Task N" 的引用；每段代码都完整给出
- 所有函数名（`describeStepDetail` / `STEP_DETAIL_MAX_CHARS` / `truncate` / `extractToolOutput` / `formatArgs`）均先定义后使用，签名一致
- 测试中所有 import 都对应存在的模块

**3. 类型一致性**

- `AssistantStep` 来自 `@/types`，与现有 `stepDescription.ts` import 风格一致
- `blocks` 类型 `Array<Record<string, unknown>>`，与 `stepContent.ts` / `stepDescription.ts` 一致
- `MessageBubble.test.tsx` 用例使用项目既有 `ChatMessage` 类型字段（`id` / `role` / `content` / `createdAt` / `pending` / `steps`）
- `formatArgs` 返回 `string[] | null`，与 spec 完全对齐
- `describeStepDetail` 返回 `string[] | null`，与 spec 完全对齐