import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "@/types";

interface MessageListProps {
  messages: ChatMessage[];
  onRetry?: (message: ChatMessage) => void;
}

export function MessageList({ messages, onRetry }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <ScrollArea className="flex-1">
      <div
        role="log"
        aria-live="polite"
        className="flex flex-col gap-3 p-4"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onRetry={onRetry} />
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
