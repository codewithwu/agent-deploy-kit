import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage, Conversation } from "@/types";
import { loadConversations, saveConversations } from "@/lib/storage";

const TITLE_PLACEHOLDER = "新对话";
const TITLE_MAX = 30;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseConversationsValue {
  conversations: Conversation[];
  currentId: string | null;
  current: Conversation | null;
  createConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  clearCurrent: () => void;
  addMessage: (id: string, message: ChatMessage) => void;
  updateMessage: (
    id: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ) => void;
  renameIfFirstUserMessage: (id: string, content: string) => void;
}

export function useConversations(): UseConversationsValue {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 水合:从 localStorage 读一次
  useEffect(() => {
    const loaded = loadConversations();
    if (loaded.length > 0) {
      setConversations(loaded);
    }
    setHydrated(true);
  }, []);

  // 持久化:水合之后才写
  useEffect(() => {
    if (!hydrated) return;
    saveConversations(conversations);
  }, [conversations, hydrated]);

  const createConversation = useCallback((): string => {
    const id = newId();
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: TITLE_PLACEHOLDER,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [conv, ...prev]);
    setCurrentId(id);
    return id;
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrentId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setCurrentId((prev) => (prev === id ? null : prev));
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim() || TITLE_PLACEHOLDER;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, title: trimmed, updatedAt: Date.now() } : c,
      ),
    );
  }, []);

  const clearCurrent = useCallback(() => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentId ? { ...c, messages: [], updatedAt: Date.now() } : c,
      ),
    );
  }, [currentId]);

  const addMessage = useCallback((id: string, message: ChatMessage) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c,
      ),
    );
  }, []);

  const updateMessage = useCallback(
    (id: string, messageId: string, patch: Partial<ChatMessage>) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id !== id
            ? c
            : {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId ? { ...m, ...patch } : m,
                ),
                updatedAt: Date.now(),
              },
        ),
      );
    },
    [],
  );

  const renameIfFirstUserMessage = useCallback(
    (id: string, content: string) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          // 标题已被手动或之前自动重命名过 → 不动
          if (c.title !== TITLE_PLACEHOLDER) return c;
          const title = content.slice(0, TITLE_MAX);
          return { ...c, title, updatedAt: Date.now() };
        }),
      );
    },
    [],
  );

  const current = useMemo(
    () => conversations.find((c) => c.id === currentId) ?? null,
    [conversations, currentId],
  );

  return {
    conversations,
    currentId,
    current,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    clearCurrent,
    addMessage,
    updateMessage,
    renameIfFirstUserMessage,
  };
}
