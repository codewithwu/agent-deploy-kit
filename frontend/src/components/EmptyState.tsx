import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onCreate: () => void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <MessageSquareText
        className="h-12 w-12 text-muted-foreground"
        aria-hidden
      />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">开始一段新对话</h2>
        <p className="text-sm text-muted-foreground">
          选择左侧"新对话",向智能体提问。
        </p>
      </div>
      <Button onClick={onCreate}>新对话</Button>
    </div>
  );
}
