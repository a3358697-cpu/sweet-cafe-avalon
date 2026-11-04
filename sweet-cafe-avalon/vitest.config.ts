import { defineConfig } from "vitest/config";

// 單元測試：規則引擎與房間核心邏輯（不需要 Firebase）。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "functions/src/**/*.test.ts"],
  },
});
