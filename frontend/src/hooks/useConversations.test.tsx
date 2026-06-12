import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversations } from "./useConversations";
import { STORAGE_KEY } from "@/lib/storage";

beforeEach(() => {
  localStorage.clear();
});

describe("useConversations", () => {
  it("starts with empty state", () => {
    const { result } = renderHook(() => useConversations());
    expect(result.current.conversations).toEqual([]);
    expect(result.current.currentId).toBeNull();
    expect(result.current.current).toBeNull();
  });

  it("hydrates from localStorage on mount", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "c1",
          title: "hi",
          messages: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );
    const { result } = renderHook(() => useConversations());
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].id).toBe("c1");
  });

  it("createConversation returns a new id and selects it", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    expect(typeof id).toBe("string");
    expect(id).not.toBe("");
    expect(result.current.currentId).toBe(id);
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].title).toBe("新对话");
  });

  it("addMessage appends to the specified conversation", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    act(() => {
      result.current.addMessage(id, {
        id: "m1",
        role: "user",
        content: "hi",
        createdAt: 100,
      });
    });
    expect(result.current.conversations[0].messages).toHaveLength(1);
    expect(result.current.conversations[0].messages[0].content).toBe("hi");
  });

  it("updateMessage patches a message in place", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
      result.current.addMessage(id, {
        id: "m1",
        role: "user",
        content: "hi",
        createdAt: 1,
        pending: true,
      });
    });
    act(() => {
      result.current.updateMessage(id, "m1", { pending: false, error: true });
    });
    const msg = result.current.conversations[0].messages[0];
    expect(msg.pending).toBe(false);
    expect(msg.error).toBe(true);
  });

  it("renameIfFirstUserMessage updates title for empty-title conv", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    act(() => {
      result.current.renameIfFirstUserMessage(id, "hello world");
    });
    expect(result.current.conversations[0].title).toBe("hello world");
  });

  it("renameIfFirstUserMessage still renames after a message is added", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
      result.current.addMessage(id, {
        id: "m1",
        role: "user",
        content: "first",
        createdAt: 1,
      });
    });
    act(() => {
      result.current.renameIfFirstUserMessage(id, "the first user message");
    });
    expect(result.current.conversations[0].title).toBe("the first user message");
  });

  it("renameIfFirstUserMessage truncates to 30 chars", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    const long = "a".repeat(50);
    act(() => {
      result.current.renameIfFirstUserMessage(id, long);
    });
    expect(result.current.conversations[0].title).toHaveLength(30);
  });

  it("deleteConversation removes and clears currentId if it was selected", () => {
    const { result } = renderHook(() => useConversations());
    let id = "";
    act(() => {
      id = result.current.createConversation();
    });
    act(() => {
      result.current.deleteConversation(id);
    });
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.currentId).toBeNull();
  });

  it("persists to localStorage on change", () => {
    const { result } = renderHook(() => useConversations());
    act(() => {
      result.current.createConversation();
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
  });
});
