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
