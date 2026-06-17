import { Loader2, RefreshCw } from "lucide-react";
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

/** 最终答案视图:已完成 assistant 消息的 markdown 气泡。 */
function FinalAnswerView({ content }: { content: string }) {
  return (
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
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // Assistant 错误态:即使有 steps 也优先显示错误气泡
  if (!isUser && message.error) {
    return (
      <div
        className={cn("flex w-full", "justify-start")}
        data-testid={`message-${message.role}`}
      >
        <div
          className={cn(
            "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
            "border-destructive bg-destructive/10",
          )}
        >
          <FinalAnswerView content={message.content} />
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
        </div>
      </div>
    );
  }

  // User 消息(保持原有样式)
  if (isUser) {
    return (
      <div
        className={cn("flex w-full", "justify-end")}
        data-testid={`message-${message.role}`}
      >
        <div
          className={cn(
            "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
            "border-primary/20 bg-primary/10",
            message.error && "border-destructive bg-destructive/10",
          )}
        >
          <div className="break-words">{message.content}</div>
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

  // Assistant 思考中或累积中:顶部 loader + 累积 content(纯文本,不用 markdown)
  if (message.pending) {
    return (
      <div
        className="flex w-full justify-start"
        data-testid={`message-${message.role}`}
      >
        <div
          className="max-w-[80%] rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm"
          data-testid="thinking-indicator"
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            <span>智能体 正在回复…</span>
          </div>
          {message.content && (
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant 完成(无论是否有 steps):最终答案气泡
  return (
    <div
      className={cn("flex w-full", "justify-start")}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-4 py-2 text-sm shadow-sm",
          "border-border bg-card",
        )}
      >
        <FinalAnswerView content={message.content} />
      </div>
    </div>
  );
}
