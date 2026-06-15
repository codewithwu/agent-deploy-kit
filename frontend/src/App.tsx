import { ChatProvider, useChatContext } from "@/context/ChatContext";
import { ChatWindow } from "@/components/ChatWindow";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  const agentName = import.meta.env.VITE_AGENT_NAME || "Weather Agent";
  return (
    <ChatProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <div className="hidden md:block">
          <DesktopSidebar />
        </div>
        <main className="flex-1">
          <ChatWindow agentName={agentName} />
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </ChatProvider>
  );
}

function DesktopSidebar() {
  const ctx = useChatContext();
  return (
    <Sidebar
      conversations={ctx.conversations}
      currentId={ctx.currentId}
      onSelect={ctx.selectConversation}
      onCreate={ctx.createConversation}
      onDelete={ctx.deleteConversation}
      onRename={ctx.renameConversation}
    />
  );
}
