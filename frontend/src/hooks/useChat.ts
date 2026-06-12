import { useCallback, useRef, useState } from "react";
import { ChatApiError, postChat } from "@/lib/api";
import { useChatContext } from "@/context/ChatContext";
import type { ChatMessage } from "@/types";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseChatValue {
  send: (text: string) => Promise<void>;
  isSending: boolean;
  /** 把 context 一并暴露,方便测试断言 */
  context: ReturnType<typeof useChatContext>;
}

export function useChat(): UseChatValue {
  const ctx = useChatContext();
  const { conversations, currentId, addMessage, updateMessage, renameIfFirstUserMessage } =
    ctx;
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // 1. 确保有会话
      let id = currentId;
      if (!id) {
        id = ctx.createConversation();
      }

      // 2. 加 userMsg(pending)
      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
        pending: true,
      };
      addMessage(id, userMsg);

      // 3. 构造 API 载荷(从最新 state 取)
      const conv = conversations.find((c) => c.id === id);
      const history = (conv?.messages ?? [])
        .filter((m) => !m.pending && !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      const payload = [...history, { role: "user", content: trimmed }];

      // 4. 发送
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSending(true);
      try {
        const reply = await postChat(payload, controller.signal);
        updateMessage(id, userMsg.id, { pending: false });
        addMessage(id, {
          id: newId(),
          role: "assistant",
          content: reply,
          createdAt: Date.now(),
        });
        renameIfFirstUserMessage(id, trimmed);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const status = err instanceof ChatApiError ? err.status : 0;
        const detail =
          err instanceof ChatApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "请求失败";
        updateMessage(id, userMsg.id, { pending: false, error: true });
        const toast = (
          globalThis as { toast?: { error: (msg: string) => void } }
        ).toast;
        const text =
          status === 400
            ? detail || "消息不能为空"
            : status >= 500
              ? "智能体暂时不可用"
              : detail || "请求失败";
        toast?.error(text);
      } finally {
        setIsSending(false);
        abortRef.current = null;
      }
    },
    [
      conversations,
      currentId,
      addMessage,
      updateMessage,
      renameIfFirstUserMessage,
      ctx,
    ],
  );

  return { send, isSending, context: ctx };
}
