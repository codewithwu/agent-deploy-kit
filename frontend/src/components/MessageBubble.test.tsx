import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "@/types";

const userMsg: ChatMessage = {
  id: "u1",
  role: "user",
  content: "hi",
  createdAt: 1,
};

const assistantMsg: ChatMessage = {
  id: "a1",
  role: "assistant",
  content: "**hello**",
  createdAt: 1,
};

const errorMsg: ChatMessage = {
  id: "e1",
  role: "user",
  content: "boom",
  createdAt: 1,
  error: true,
};

const pendingMsg: ChatMessage = {
  id: "p1",
  role: "user",
  content: "...",
  createdAt: 1,
  pending: true,
};

const thinkingAssistantMsg: ChatMessage = {
  id: "t1",
  role: "assistant",
  content: "",
  createdAt: 1,
  pending: true,
};

const runningAssistantMsg: ChatMessage = {
  id: "r1",
  role: "assistant",
  content: "调用工具: get_weather({})",
  createdAt: 1,
  pending: true,
  steps: [
    { name: "model", blocks: [{ type: "tool_call", name: "get_weather", args: {} }] },
    { name: "tools", blocks: [{ type: "text", text: "sunny" }] },
    { name: "model", blocks: [{ type: "text", text: "正在准备最终回复" }] },
  ],
};

const doneAssistantMsg: ChatMessage = {
  id: "d1",
  role: "assistant",
  content: "It's **sunny** today.",
  createdAt: 1,
  pending: false,
  steps: [
    { name: "model", blocks: [{ type: "tool_call", name: "get_weather", args: {} }] },
    { name: "tools", blocks: [{ type: "text", text: "sunny" }] },
    { name: "model", blocks: [{ type: "text", text: "It's sunny today." }] },
  ],
};

const errorAssistantMsg: ChatMessage = {
  id: "ea1",
  role: "assistant",
  content: "partial answer",
  createdAt: 1,
  error: true,
  pending: false,
  steps: [{ name: "model", blocks: [{ type: "text", text: "partial answer" }] }],
};

describe("MessageBubble", () => {
  it("renders user message content", () => {
    render(<MessageBubble message={userMsg} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("renders assistant markdown as <strong>", () => {
    render(<MessageBubble message={assistantMsg} />);
    const strong = screen.getByText("hello");
    expect(strong.tagName).toBe("STRONG");
  });

  it("shows retry button when message has error and onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<MessageBubble message={errorMsg} onRetry={onRetry} />);
    const btn = screen.getByRole("button", { name: /重试/i });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledWith(errorMsg);
  });

  it("does not show retry button when onRetry is not provided", () => {
    render(<MessageBubble message={errorMsg} />);
    expect(screen.queryByRole("button", { name: /重试/i })).toBeNull();
  });

  it("does not render a sending indicator for pending user message", () => {
    render(<MessageBubble message={pendingMsg} />);
    expect(screen.queryByText(/发送中/i)).toBeNull();
    // user 内容本身仍要展示
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("renders thinking indicator for pending assistant message without steps", () => {
    const { container } = render(<MessageBubble message={thinkingAssistantMsg} />);
    expect(container.querySelector('[data-testid="thinking-indicator"]')).not.toBeNull();
    expect(screen.queryByTestId("task-list")).toBeNull();
    expect(screen.getByText(/智能体 正在回复/)).toBeInTheDocument();
  });

  it("renders task list when assistant message has steps and is pending", () => {
    const { container } = render(<MessageBubble message={runningAssistantMsg} />);
    expect(container.querySelector('[data-testid="task-list"]')).not.toBeNull();
    expect(screen.getByText("正在准备调用 get_weather…")).toBeInTheDocument();
    expect(screen.getByText("正在生成回复…")).toBeInTheDocument();
    expect(screen.getByText(/智能体 正在回复/)).toBeInTheDocument();
  });

  it("renders final answer markdown when assistant message is not pending", () => {
    render(<MessageBubble message={doneAssistantMsg} />);
    const strong = screen.getByText("sunny");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByTestId("task-list")).toBeNull();
  });

  it("renders error state with retry button when assistant message has error flag", () => {
    const onRetry = vi.fn();
    render(<MessageBubble message={errorAssistantMsg} onRetry={onRetry} />);
    expect(screen.getByRole("button", { name: /重试/i })).toBeInTheDocument();
    expect(screen.queryByTestId("task-list")).toBeNull();
  });
});
