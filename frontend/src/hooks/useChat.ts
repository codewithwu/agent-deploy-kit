import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, streamChat } from "@/lib/api";
import { useChatContext } from "@/context/ChatContext";
import { extractText } from "@/lib/stepContent";
import type { ChatMessage } from "@/types";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toastError(msg: string): void {
  const toast = (
    globalThis as { toast?: { error: (m: string) => void } }
  ).toast;
  toast?.error(msg);
}

// 把任意异常翻译成展示给用户的 toast 文案
function toastMessage(err: unknown, fallbackDetail: string): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return err.message || "消息不能为空";
    if (err.status >= 500) return "智能体暂时不可用";
    return err.message || fallbackDetail;
  }
  if (err instanceof Error) return err.message || fallbackDetail;
  return fallbackDetail;
}

export interface UseChatValue {
  send: (text: string) => Promise<void>;
  isSending: boolean;
  /** 把 context 一并暴露,方便测试断言 */
  context: ReturnType<typeof useChatContext>;
}

export function useChat(): UseChatValue {
  const ctx = useChatContext();
  const {
    currentId,
    addMessage,
    updateMessage,
    removeMessage,
    renameIfFirstUserMessage,
  } = ctx;
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // 流循环内不能依赖 useCallback 闭包里的 ctx.conversations(可能读到旧值),
  // 用 ref 跟踪当前 assistant 消息的 content,避免后续 step 追加时丢上下文。
  // 必须在组件顶层声明(useRef 是 hook,不能在 useCallback 里调用)。
  const assistantRef = useRef<{ content: string } | null>(null);

  // 组件卸载时取消尚未完成的请求
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // 取消上一次仍在飞行的请求(切换会话 / 重复点击发送时避免泄漏)
      abortRef.current?.abort();

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

      // 2.5 立即添加 assistant 占位消息(无 steps),让用户立刻看到"智能体正在回复"反馈,
      //      避免后端首个 step 事件到达前的空白等待。首个 step 事件到达时直接 update 它。
      const placeholderAssistantId = newId();
      addMessage(id, {
        id: placeholderAssistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        pending: true,
      });

      // 3. 构造 API 载荷。智能体本身无状态、无记忆,本地上下文仅用于 UI 展示,
      //    发往后端的载荷每轮只含当前 user 消息,避免历史干扰 LLM 决策。
      const payload = [{ role: "user", content: trimmed }];

      // 4. 发送流
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSending(true);
      const assistantId = placeholderAssistantId;
      // 重置 ref,避免上一轮 send 残留影响本轮
      assistantRef.current = null;
      try {
        for await (const ev of streamChat(payload, controller.signal)) {
          if (ev.kind === "step") {
            const piece = extractText(ev.blocks);
            const prev: string = assistantRef.current?.content ?? "";
            const newContent: string = piece
              ? (prev ? prev + "\n\n" + piece : piece)
              : prev;
            assistantRef.current = { content: newContent };
            updateMessage(id, assistantId, { content: newContent });
          } else if (ev.kind === "done") {
            updateMessage(id, assistantId, { pending: false });
            updateMessage(id, userMsg.id, { pending: false });
            renameIfFirstUserMessage(id, trimmed);
          } else if (ev.kind === "error") {
            if (assistantRef.current?.content) {
              updateMessage(id, assistantId, { pending: false, error: true });
            } else {
              removeMessage(id, assistantId);
            }
            updateMessage(id, userMsg.id, { pending: false });
            toastError(ev.detail || "智能体暂时不可用");
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        updateMessage(id, userMsg.id, { pending: false, error: true });
        if (assistantRef.current?.content) {
          updateMessage(id, assistantId, { pending: false, error: true });
        } else {
          removeMessage(id, assistantId);
        }
        toastError(toastMessage(err, "请求失败"));
      } finally {
        setIsSending(false);
        abortRef.current = null;
      }
    },
    [
      currentId,
      addMessage,
      updateMessage,
      removeMessage,
      renameIfFirstUserMessage,
      ctx,
    ],
  );

  return { send, isSending, context: ctx };
}