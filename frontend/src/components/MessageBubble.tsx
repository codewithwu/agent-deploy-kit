import { RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
}

/** 仅放行 http(s) 与 mailto,挡住 javascript: */
function safeUrl(url: string): string | null {
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return null;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
          isUser
            ? "border-primary/20 bg-primary/10"
            : "border-border bg-card",
          message.error && "border-destructive bg-destructive/10",
        )}
      >
        <div className="prose prose-sm max-w-none break-words dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const safe = href && safeUrl(href);
                if (!safe) return <span>{children}</span>;
                return (
                  <a href={safe} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
              code(props) {
                const { className, children } = props;
                const match = /language-(\w+)/.exec(className ?? "");
                const code = String(children).replace(/\n$/, "");
                if (match) {
                  return (
                    <SyntaxHighlighter
                      language={match[1]}
                      style={oneDark}
                      PreTag="div"
                      customStyle={{
                        fontSize: "0.8rem",
                        borderRadius: "0.375rem",
                        margin: "0.5rem 0",
                      }}
                    >
                      {code}
                    </SyntaxHighlighter>
                  );
                }
                return (
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {message.pending && (
          <div className="mt-1 text-xs text-muted-foreground">发送中…</div>
        )}
        {message.error && (
          <div className="mt-1 flex items-center gap-2 text-xs text-destructive">
            <span>发送失败</span>
            {onRetry && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => onRetry(message)}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                重试
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
