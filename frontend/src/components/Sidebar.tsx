import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function Sidebar({
  conversations,
  currentId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-[280px] flex-col border-r border-border bg-muted/30">
      <div className="border-b border-border p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          新对话
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2" aria-label="对话列表">
        {conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            还没有对话
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((c) => {
              const isCurrent = c.id === currentId;
              return (
                <li key={c.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-md",
                      isCurrent && "bg-accent",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-current={isCurrent ? "true" : undefined}
                      className={cn(
                        "flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                        isCurrent && "font-medium",
                      )}
                    >
                      {c.title || "新对话"}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          aria-label="更多操作"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            const next = window.prompt("重命名", c.title);
                            if (next != null) onRename(c.id, next);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            if (window.confirm(`删除对话"${c.title}"?`)) {
                              onDelete(c.id);
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
