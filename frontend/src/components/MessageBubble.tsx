import { RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeStep } from "@/lib/stepDescription";
import type { AssistantStep, ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
}

/** 仅放行 http(s) 与 mailto,挡住 javascript: */
function safeUrl(url: string): string | null {
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return null;
}

/** 任务列表视图:运行中的 assistant 消息。 */
function TaskListView({ steps }: { steps: AssistantStep[] }) {
  return (
    <div
      className="flex items-start gap-2"
      data-testid="task-list"
    >
      <div
        className="mt-1 h-7 w-7 shrink-0 rounded-full bg-muted"
        aria-hidden
      />
      <div className="flex flex-col">
        <div className="mb-2 text-xs text-muted-foreground">
          智能体 正在回复…
        </div>
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <li
                key={i}
                className="relative pl-5 text-sm leading-relaxed"
              >
                <span
                  className={cn(
                    "absolute left-0 top-1.5 inline-block h-2 w-2 rounded-full",
                    isLast
                      ? "border border-muted-foreground bg-background animate-pulse"
                      : "bg-foreground",
                  )}
                />
                {i < steps.length - 1 && (
                  <span className="absolute left-[3.5px] top-4 h-[calc(100%+0.5rem)] w-px bg-border" />
                )}
                {describeStep(s)}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
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

  // Assistant 运行中:任务列表视图
  if (message.steps && message.pending) {
    return (
      <div
        className="flex w-full justify-start"
        data-testid={`message-${message.role}`}
      >
        <div className="max-w-[80%] text-sm">
          <TaskListView steps={message.steps} />
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
