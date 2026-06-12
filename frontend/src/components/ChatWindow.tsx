import { useState } from "react";
import { Menu, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { useChat } from "@/hooks/useChat";
import { useChatContext } from "@/context/ChatContext";
import type { ChatMessage } from "@/types";

interface ChatWindowProps {
  /** 智能体名,显示在顶栏 */
  agentName?: string;
}

export function ChatWindow({ agentName = "Weather Agent" }: ChatWindowProps) {
  const ctx = useChatContext();
  const { send, isSending } = useChat();
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleSend(text: string) {
    void send(text);
  }

  function handleRetry(msg: ChatMessage) {
    // MVP 重试:直接重发,error 消息保留在 UI 上(用户能看到发送失败的痕迹),
    // 后续改进是把 error 消息从 messages 中删掉再 send,避免重复条目。
    // 详见 plan 末尾"已知遗留"。
    void send(msg.content);
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="打开侧边栏"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <Sidebar
              conversations={ctx.conversations}
              currentId={ctx.currentId}
              onSelect={(id) => {
                ctx.selectConversation(id);
                setSheetOpen(false);
              }}
              onCreate={() => {
                ctx.createConversation();
                setSheetOpen(false);
              }}
              onDelete={ctx.deleteConversation}
              onRename={ctx.renameConversation}
            />
          </SheetContent>
        </Sheet>
        <Bot className="h-5 w-5 text-muted-foreground" aria-hidden />
        <h1 className="text-base font-semibold">{agentName}</h1>
        {ctx.current && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="清空消息"
              onClick={() => {
                if (window.confirm("清空当前会话的所有消息?")) {
                  ctx.clearCurrent();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </header>
      {ctx.current && ctx.current.messages.length > 0 ? (
        <MessageList
          messages={ctx.current.messages}
          onRetry={handleRetry}
        />
      ) : (
        <div className="flex-1">
          <EmptyState onCreate={ctx.createConversation} />
        </div>
      )}
      <ChatInput onSend={handleSend} disabled={isSending} />
    </div>
  );
}
