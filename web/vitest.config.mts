import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // Các test hiện có chạy trên dữ liệu mẫu (src/mocks). Ứng dụng thật mặc định TẮT dữ liệu mẫu.
    env: { NEXT_PUBLIC_USE_MOCKS: "true" },
  },
});
