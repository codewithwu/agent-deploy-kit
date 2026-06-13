const DEFAULT_API_BASE = "http://localhost:8000";

/** 函数内读取,这样测试用 vi.stubEnv 改 VITE_API_BASE 才能生效 */
function apiBase(): string {
  const v = import.meta.env.VITE_API_BASE;
  return v && v.length > 0 ? v : DEFAULT_API_BASE;
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
    throw new ChatApiError(0, "invalid SSE: response has no body");
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
      throw new ChatApiError(
        0,
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

  function parseLine(line: string): StreamEvent | null {
    if (line === "") {
      // 空行:一个 SSE 事件块结束
      return flushFrame();
    }
    if (line.startsWith(":")) {
      // 注释行,忽略
      return null;
    }
    if (!line.includes(":")) {
      // 心跳等无字段行,忽略
      return null;
    }
    const idx = line.indexOf(":");
    const field = line.slice(0, idx);
    const raw = line.slice(idx + 1);
    // SSE 规范:前导单个空格去掉
    const val = raw.startsWith(" ") ? raw.slice(1) : raw;
    if (field === "event") frame.event = val;
    else if (field === "data") frame.data = val;
    // "id" / 其他字段忽略
    return null;
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
        const ev = parseLine(line);
        if (ev) yield ev;
        nlIdx = buffer.indexOf("\n");
      }
    }
    // 流结束:处理 buffer 末尾残留(EOF 直接终止流,无尾随换行)
    if (buffer.length > 0) {
      const ev = parseLine(buffer);
      buffer = "";
      if (ev) yield ev;
    }
    // 流结束:data 行已设置但缺少分隔空行(后端漏发尾随 \n\n)
    if (frame.data !== undefined) {
      const ev = flushFrame();
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}
