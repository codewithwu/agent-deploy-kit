export type Role = "user" | "assistant";

/** 单个 SSE step 的原始数据(从前端视角聚合)。 */
export interface AssistantStep {
  /** LangChain step 名,如 "model" / "tools" */
  name: string;
  /** 该 step 的原始 content blocks */
  blocks: Array<Record<string, unknown>>;
}

export interface ChatMessage {
  /** 客户端生成,用于 React key 与重试定位 */
  id: string;
  role: Role;
  /** Markdown 文本。assistant 上等于所有 step 文本块按时间顺序用 "\n\n" 拼接。 */
  content: string;
  /** Date.now() */
  createdAt: number;
  /** 用户刚发出、等待后端响应时为 true */
  pending?: boolean;
  /** 请求失败标记,支持重试 */
  error?: boolean;
}

export interface Conversation {
  /** uuid */
  id: string;
  /** 首条用户消息前 30 字;可在侧边栏重命名 */
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
