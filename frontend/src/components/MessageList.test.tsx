import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { ChatMessage } from "@/types";

const messages: ChatMessage[] = [
  { id: "m1", role: "user", content: "hi", createdAt: 1 },
  { id: "m2", role: "assistant", content: "hello", createdAt: 2 },
];

describe("MessageList", () => {
  it("renders a log role and all messages", () => {
    render(<MessageList messages={messages} />);
    const log = screen.getByRole("log");
    expect(log).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders empty list without crashing", () => {
    render(<MessageList messages={[]} />);
    expect(screen.getByRole("log")).toBeInTheDocument();
  });
});
