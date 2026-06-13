## 2026-06-13

- **feat(frontend)**: 前端切到流式 `/api/chat/stream`,按 LangChain step 增量渲染 assistant 消息;新增 `step` 名称标签区分 `model`/`tools`;`tool_call` 块渲染为"调用工具: ..."占位文字。`postChat` 已删除。