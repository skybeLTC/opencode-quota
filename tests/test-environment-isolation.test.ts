import { beforeAll, describe, expect, it } from "vitest";

const envAtModuleEvaluation = {
  opencodeConfig: process.env.OPENCODE_CONFIG,
  opencodeConfigDir: process.env.OPENCODE_CONFIG_DIR,
};

describe("test environment OpenCode config isolation", () => {
  it("clears OpenCode config before test module evaluation", () => {
    expect(envAtModuleEvaluation).toEqual({
      opencodeConfig: undefined,
      opencodeConfigDir: undefined,
    });
  });

  describe("per-test baseline", () => {
    beforeAll(() => {
      process.env.OPENCODE_CONFIG = "/tmp/opencode-config-leak.jsonc";
      process.env.OPENCODE_CONFIG_DIR = "/tmp/opencode-config-dir-leak";
    });

    it("clears OpenCode config before test execution", () => {
      expect(process.env.OPENCODE_CONFIG).toBeUndefined();
      expect(process.env.OPENCODE_CONFIG_DIR).toBeUndefined();
    });
  });
});
