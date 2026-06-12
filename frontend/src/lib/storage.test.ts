import { describe, it, expect, beforeEach } from "vitest";
import { loadConversations, saveConversations, STORAGE_KEY } from "./storage";
import type { Conversation } from "@/types";

const sample: Conversation[] = [
  {
    id: "c1",
    title: "hello",
    messages: [
      { id: "m1", role: "user", content: "hi", createdAt: 1, pending: true },
    ],
    createdAt: 1,
    updatedAt: 1,
  },
];

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when nothing is stored", () => {
    expect(loadConversations()).toEqual([]);
  });

  it("returns empty array on corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json{");
    expect(loadConversations()).toEqual([]);
  });

  it("strips pending and error flags when loading", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    const loaded = loadConversations();
    expect(loaded[0].messages[0].pending).toBeUndefined();
    expect(loaded[0].messages[0].error).toBeUndefined();
  });

  it("round-trips save -> load", () => {
    saveConversations(sample);
    const loaded = loadConversations();
    expect(loaded).toEqual([
      {
        id: "c1",
        title: "hello",
        messages: [
          { id: "m1", role: "user", content: "hi", createdAt: 1 },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
  });
});
