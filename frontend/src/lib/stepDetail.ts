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
