export type Role = "user" | "assistant";

export interface ChatMessage {
  /** 客户端生成,用于 React key 与重试定位 */
  id: string;
  role: Role;
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
