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

  it("shows pending indicator for pending user message", () => {
    render(<MessageBubble message={pendingMsg} />);
    expect(screen.getByText(/发送中/i)).toBeInTheDocument();
  });
});
