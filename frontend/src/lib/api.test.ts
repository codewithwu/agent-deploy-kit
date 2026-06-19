import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, streamChat } from "./api";

// 把 SSE 帧列表编码成一段完整文本(供一次性入队)
function sseText(
  frames: Array<{ event?: string; data: object; id?: string }>,
): string {
  return frames
    .map((f) => {
      const parts: string[] = [];
      if (f.id) parts.push(`id: ${f.id}`);
      if (f.event) parts.push(`event: ${f.event}`);
      parts.push(`data: ${JSON.stringify(f.data)}`);
      return parts.join("\n") + "\n\n";
    })
    .join("");
}

// 构造一个一次性格式化的 SSE Response
function sseResponse(frames: Array<{ event?: string; data: object }>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseText(frames)));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// 构造一个可手动分块入队的 SSE Response,用于测试"跨 chunk 切帧"
function chunkedSseResponse(): {
  response: Response;
  push: (text: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controllerRef = c;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    push: (text: string) => controllerRef?.enqueue(encoder.encode(text)),
    close: () => controllerRef?.close(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("streamChat", () => {
  it("yields step and done events from a complete SSE stream", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "step",
          data: {
            step: "model",
            blocks: [{ type: "tool_call", name: "get_weather", args: { city: "SF" } }],
          },
        },
        { event: "done", data: {} },
      ]),
    );

    const events: unknown[] = [];
    for await (const ev of streamChat([{ role: "user", content: "hi" }])) {
      events.push(ev);
    }
    expect(events).toEqual([
      {
        kind: "step",
        step: "model",
        blocks: [
          { type: "tool_call", name: "get_weather", args: { city: "SF" } },
        ],
      },
      { kind: "done" },
    ]);
  });

  it("throws ApiError on non-2xx with parsed detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "empty messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const rejection = await streamChat([{ role: "user", content: "hi" }])
      .next()
      .then(
        () => {
          throw new Error("expected streamChat to throw");
        },
        (e: unknown) => e,
      );

    expect(rejection).toBeInstanceOf(ApiError);
    expect((rejection as ApiError).status).toBe(400);
    expect((rejection as ApiError).message).toBe("empty messages");
  });

  it("yields error event for event: error frame", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([{ event: "error", data: { detail: "rate limit" } }]),
    );

    const events: unknown[] = [];
    for await (const ev of streamChat([{ role: "user", content: "hi" }])) {
      events.push(ev);
    }
    expect(events).toEqual([{ kind: "error", detail: "rate limit" }]);
  });

  it("handles SSE frames split across reader chunks", async () => {
    const { response, push, close } = chunkedSseResponse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const collectPromise = (async () => {
      const events: unknown[] = [];
      for await (const ev of streamChat([{ role: "user", content: "hi" }])) {
        events.push(ev);
      }
      return events;
    })();

    // 让 async generator 进入 reader.read 等待
    await new Promise((r) => setTimeout(r, 0));
    push("event: step\ndata: {\"step\":\"m");
    await new Promise((r) => setTimeout(r, 0));
    push("odel\",\"blocks\":[]}\n\nevent: done\ndata: {}\n\n");
    close();

    const events = await collectPromise;
    expect(events).toEqual([
      { kind: "step", step: "model", blocks: [] },
      { kind: "done" },
    ]);
  });

  it("passes AbortSignal to fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(sseResponse([{ event: "done", data: {} }]));

    const controller = new AbortController();
    for await (const _ of streamChat(
      [{ role: "user", content: "hi" }],
      controller.signal,
    )) {
      // consume to completion
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.signal).toBe(controller.signal);
  });
});
