import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ChatProvider, useChatContext } from "./ChatContext";
import { STORAGE_KEY } from "@/lib/storage";

function Probe() {
  const ctx = useChatContext();
  return (
    <div>
      <span data-testid="count">{ctx.conversations.length}</span>
      <span data-testid="currentId">{ctx.currentId ?? "null"}</span>
      <button
        onClick={() => {
          const id = ctx.createConversation();
          ctx.addMessage(id, {
            id: "m1",
            role: "user",
            content: "hi",
            createdAt: 1,
          });
        }}
      >
        add
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("ChatContext", () => {
  it("throws when used outside provider", () => {
    expect(() => render(<Probe />)).toThrow(/ChatProvider/);
  });

  it("exposes state and actions through the provider", () => {
    render(
      <ChatProvider>
        <Probe />
      </ChatProvider>,
    );
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("currentId").textContent).toBe("null");
    act(() => {
      screen.getByRole("button", { name: /add/i }).click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
  });
});
