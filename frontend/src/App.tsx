import { ChatProvider } from "@/context/ChatContext";
import { AuthProvider } from "@/context/AuthContext";
import { AppRoutes } from "./AppRoutes";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <AuthProvider>
      <ChatProvider>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </ChatProvider>
    </AuthProvider>
  );
}
