const DEFAULT_API_BASE = "http://localhost:8000";

/** 函数内读取,这样测试用 vi.stubEnv 改 VITE_API_BASE 才能生效 */
function apiBase(): string {
  return import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE;
}

export class ChatApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export type StreamEvent =
  | {
      kind: "step";
      step: string;
      blocks: Array<Record<string, unknown>>;
    }
  | { kind: "done" }
  | { kind: "error"; detail: string };

interface SseFrame {
  event?: string;
  data?: string;
}

export async function* streamChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${apiBase()}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    let detail: string;
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail = String(body.detail ?? res.statusText);
    } catch {
      detail = res.statusText;
    }
    throw new ChatApiError(res.status, detail);
  }

  if (!res.body) {
    throw new Error("invalid SSE: response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let frame: SseFrame = {};

  function flushFrame(): StreamEvent | null {
    if (frame.data === undefined) {
      frame = {};
      return null;
    }
    let parsed: { event?: string; detail?: string; step?: string; blocks?: unknown };
    try {
      parsed = JSON.parse(frame.data) as typeof parsed;
    } catch (err) {
      throw new Error(
        `invalid SSE: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const event = frame.event ?? "";
    const ev: StreamEvent =
      event === "done"
        ? { kind: "done" }
        : event === "error"
          ? { kind: "error", detail: String(parsed.detail ?? "") }
          : {
              kind: "step",
              step: String(parsed.step ?? ""),
              blocks: Array.isArray(parsed.blocks)
                ? (parsed.blocks as Array<Record<string, unknown>>)
                : [],
            };
    frame = {};
    return ev;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nlIdx = buffer.indexOf("\n");
      while (nlIdx !== -1) {
        const line = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        if (line === "") {
          // 空行:一个 SSE 事件块结束
          const ev = flushFrame();
          if (ev) yield ev;
        } else if (line.startsWith(":")) {
          // 注释行,忽略
        } else if (line.includes(":")) {
          const idx = line.indexOf(":");
          const field = line.slice(0, idx);
          const raw = line.slice(idx + 1);
          // SSE 规范:前导单个空格去掉
          const val = raw.startsWith(" ") ? raw.slice(1) : raw;
          if (field === "event") frame.event = val;
          else if (field === "data") frame.data = val;
          // "id" / 其他字段忽略
        }
        nlIdx = buffer.indexOf("\n");
      }
    }
    // 流结束:处理 buffer 末尾残留(没有换行符的最后一帧)
    if (buffer.length > 0) {
      const line = buffer;
      buffer = "";
      if (line === "") {
        const ev = flushFrame();
        if (ev) yield ev;
      } else if (!line.startsWith(":") && line.includes(":")) {
        const idx = line.indexOf(":");
        const field = line.slice(0, idx);
        const raw = line.slice(idx + 1);
        const val = raw.startsWith(" ") ? raw.slice(1) : raw;
        if (field === "event") frame.event = val;
        else if (field === "data") frame.data = val;
        const ev = flushFrame();
        if (ev) yield ev;
      }
    }
    // 流结束:再处理未触发的最后一帧(以 \n\n 结尾但读 done 时刚好用完)
    if (frame.data !== undefined) {
      const ev = flushFrame();
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}