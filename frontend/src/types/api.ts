// 与 docs/api/endpoints.md 附录 A 一一对应。snake_case 命名约定与后端一致。

// === 通用错误 ===

export interface ApiErrorBody {
  detail?: string;
  errors?: Array<{ loc?: string[]; msg: string }>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly fieldErrors?: Array<{ loc: string[]; msg: string }>,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

// === 认证 ===

export type UserRole = "user" | "admin";

export interface UserOut {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface RegisterIn {
  username: string;
  email: string;
  password: string;
}

export interface RegisterOut {
  user_id: number;
  username: string;
  email: string;
  role: UserRole;
}

export interface LoginIn {
  username: string;
  password: string;
}

export interface TokenPairOut {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface LoginOut extends TokenPairOut {
  user: UserOut;
}

export interface ChangePasswordIn {
  old_password: string;
  new_password: string;
}

export interface DeleteMeIn {
  password: string;
}

export interface VerifyOut {
  valid: true;
  user: UserOut;
}

// === 健康 ===

export interface HealthResponse {
  status: "ok";
}

// === 聊天 ===

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role?: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
}

// === SSE 事件（仅 /api/chat/stream） ===

export interface SSEStepBlock {
  type: string;
  [k: string]: unknown;
}

export interface SSEStepEvent {
  step: string;
  blocks: SSEStepBlock[];
}

export type SSEDoneEvent = Record<string, never>;

export interface SSEErrorEvent {
  detail: string;
}

export type SSEEvent =
  | { event: "step"; id?: string; data: SSEStepEvent }
  | { event: "done"; id?: string; data: SSEDoneEvent }
  | { event: "error"; id?: string; data: SSEErrorEvent };
