import { Loader2 } from "lucide-react";

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        {message ? <p className="text-sm">{message}</p> : null}
      </div>
    </div>
  );
}
