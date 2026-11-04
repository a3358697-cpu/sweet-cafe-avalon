import { defineConfig } from "vitest/config";

// Security Rules 測試：需要 Firestore 模擬器，請用 `npm run test:rules` 執行。
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20000 },
});
