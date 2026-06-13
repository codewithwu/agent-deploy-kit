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
