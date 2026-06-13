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