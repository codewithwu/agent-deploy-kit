import { describe, it, expect } from "vitest";
import { extractText, toolSummary } from "./stepContent";

describe("extractText", () => {
  it("concatenates multiple text blocks", () => {
    expect(
      extractText([
        { type: "text", text: "hello " },
        { type: "text", text: "world" },
      ]),
    ).toBe("hello world");
  });

  it("ignores tool_call blocks", () => {
    expect(
      extractText([
        { type: "text", text: "answer" },
        { type: "tool_call", name: "x", args: {} },
      ]),
    ).toBe("answer");
  });

  it("returns empty string when no text blocks", () => {
    expect(extractText([{ type: "tool_call", name: "x", args: {} }])).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(extractText([])).toBe("");
  });
});

describe("toolSummary", () => {
  it("formats single tool_call", () => {
    expect(
      toolSummary([
        { type: "tool_call", name: "get_weather", args: { city: "SF" } },
      ]),
    ).toBe('调用工具: get_weather({"city":"SF"})');
  });

  it("joins multiple tool_calls with newline", () => {
    expect(
      toolSummary([
        { type: "tool_call", name: "a", args: {} },
        { type: "tool_call", name: "b", args: { x: 1 } },
      ]),
    ).toBe('调用工具: a({})\n调用工具: b({"x":1})');
  });

  it("returns empty string when no tool_call", () => {
    expect(toolSummary([{ type: "text", text: "x" }])).toBe("");
  });
});