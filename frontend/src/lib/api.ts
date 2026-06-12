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

export async function postChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${apiBase()}/api/chat`, {
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
  const data = (await res.json()) as { reply: string };
  return data.reply;
}
