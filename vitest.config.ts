import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      // Sentinels make setup isolation fail deterministically if it stops clearing
      // these values before test modules load.
      OPENCODE_CONFIG: "/__opencode_quota_vitest_sentinel__/opencode.jsonc",
      OPENCODE_CONFIG_DIR: "/__opencode_quota_vitest_sentinel__/config",
    },
  },
});
