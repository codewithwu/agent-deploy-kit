import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("calls onSend with trimmed text on Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "hello world{enter}");
    expect(onSend).toHaveBeenCalledWith("hello world");
    expect(textarea).toHaveValue("");
  });

  it("does not call onSend on Shift+Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "line one{shift>}{enter}{/shift}line two");
    expect(onSend).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toContain("line one");
    expect((textarea as HTMLTextAreaElement).value).toContain("line two");
  });

  it("does not call onSend with whitespace-only text", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("is disabled and shows spinner-like state when disabled=true", () => {
    render(<ChatInput onSend={() => {}} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
