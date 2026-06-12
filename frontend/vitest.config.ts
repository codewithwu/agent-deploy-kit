/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // 不挂 @vitejs/plugin-react：其 React Refresh wrapper 在 vitest 1.x 下会
  // 抛 "can't detect preamble"。测试环境不需要 HMR，JSX 由 Vite 内置的
  // esbuild jsx=automatic 处理（生产构建路径），行为与构建产物一致。
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
