import { useChatContext } from "@/context/ChatContext";
import { ChatWindow } from "@/components/ChatWindow";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export function ChatPage() {
  const ctx = useChatContext();
  const agentName = import.meta.env.VITE_AGENT_NAME || "Weather Agent";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TopBar agentName={agentName} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar
            conversations={ctx.conversations}
            currentId={ctx.currentId}
            onSelect={ctx.selectConversation}
            onCreate={ctx.createConversation}
            onDelete={ctx.deleteConversation}
            onRename={ctx.renameConversation}
          />
        </div>
        <main className="flex-1">
          <ChatWindow agentName={agentName} />
        </main>
      </div>
    </div>
  );
}
