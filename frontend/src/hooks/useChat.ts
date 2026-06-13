import { useCallback, useEffect, useRef, useState } from "react";
import { ChatApiError, streamChat } from "@/lib/api";
import { useChatContext } from "@/context/ChatContext";
import type { ChatMessage } from "@/types";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 把一个 step 的 blocks 渲染成展示给用户的纯文本:
//  - text 块按顺序拼接
//  - 没有任何 text 块时,改用 tool_call 的占位文字,便于调试
function renderStepContent(blocks: Array<Record<string, unknown>>): string {
  const textParts = blocks
    .filter((b): b is { type: string; text: string } => b.type === "text")
    .map((b) => b.text);
  if (textParts.length > 0) return textParts.join("");
  return blocks
    .filter((b) => b.type === "tool_call")
    .map((b) => {
      const name = String(b.name ?? "");
      const args = b.args;
      return `调用工具: ${name}(${JSON.stringify(args)})`;
    })
    .join("\n");
}

// 把任意异常翻译成展示给用户的 toast 文案
function toastMessage(err: unknown, fallbackDetail: string): string {
  if (err instanceof ChatApiError) {
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
  const { conversations, currentId, addMessage, updateMessage, renameIfFirstUserMessage } =
    ctx;
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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

      // 3. 构造 API 载荷(从最新 state 取)
      const conv = conversations.find((c) => c.id === id);
      const history = (conv?.messages ?? [])
        .filter((m) => !m.pending && !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      const payload = [...history, { role: "user", content: trimmed }];

      // 4. 发送流
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSending(true);
      let lastAssistantId: string | null = null;
      try {
        for await (const ev of streamChat(payload, controller.signal)) {
          if (ev.kind === "step") {
            const content = renderStepContent(ev.blocks);
            const assistantId = newId();
            lastAssistantId = assistantId;
            addMessage(id, {
              id: assistantId,
              role: "assistant",
              content,
              createdAt: Date.now(),
              pending: true,
              step: ev.step,
            });
          } else if (ev.kind === "done") {
            updateMessage(id, userMsg.id, { pending: false });
            renameIfFirstUserMessage(id, trimmed);
          } else if (ev.kind === "error") {
            if (lastAssistantId) {
              updateMessage(id, lastAssistantId, { error: true });
            }
            updateMessage(id, userMsg.id, { pending: false });
            const toast = (
              globalThis as { toast?: { error: (msg: string) => void } }
            ).toast;
            toast?.error(ev.detail || "智能体暂时不可用");
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        updateMessage(id, userMsg.id, { pending: false, error: true });
        if (lastAssistantId) {
          updateMessage(id, lastAssistantId, { error: true });
        }
        const toast = (
          globalThis as { toast?: { error: (msg: string) => void } }
        ).toast;
        toast?.error(toastMessage(err, "请求失败"));
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
