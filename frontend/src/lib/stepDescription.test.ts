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
