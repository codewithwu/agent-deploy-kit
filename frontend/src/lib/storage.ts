import type { Conversation } from "@/types";

export const STORAGE_KEY = "adk:conversations:v1";

/** 加载并清理 transient 字段(pending / error) */
export function loadConversations(): Conversation[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((c) => stripTransient(c));
}

export function saveConversations(items: Conversation[]): void {
  // 持久化前剥掉 pending / error(双保险;通常内存状态也不应保留)
  const cleaned = items.map((c) => stripTransient(c));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

function stripTransient(c: Conversation): Conversation {
  return {
    ...c,
    messages: c.messages.map((m) => {
      const { pending: _p, error: _e, ...rest } = m;
      return rest;
    }),
  };
}
