import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import type { Conversation } from "@/types";

const convs: Conversation[] = [
  { id: "c1", title: "first", messages: [], createdAt: 1, updatedAt: 1 },
  { id: "c2", title: "second", messages: [], createdAt: 2, updatedAt: 2 },
];

describe("Sidebar", () => {
  it("renders all conversation titles", () => {
    render(
      <Sidebar
        conversations={convs}
        currentId="c1"
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("highlights the current conversation", () => {
    render(
      <Sidebar
        conversations={convs}
        currentId="c1"
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );
    const c1 = screen.getByText("first").closest("button");
    expect(c1).toHaveAttribute("aria-current", "true");
  });

  it("calls onCreate when 新对话 is clicked", () => {
    const onCreate = vi.fn();
    render(
      <Sidebar
        conversations={[]}
        currentId={null}
        onSelect={() => {}}
        onCreate={onCreate}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /新对话/ }));
    expect(onCreate).toHaveBeenCalled();
  });

  it("calls onSelect when a conversation is clicked", () => {
    const onSelect = vi.fn();
    render(
      <Sidebar
        conversations={convs}
        currentId={null}
        onSelect={onSelect}
        onCreate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("first"));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });
});
