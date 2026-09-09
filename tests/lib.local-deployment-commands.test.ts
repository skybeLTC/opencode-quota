import { describe, expect, it, vi } from "vitest";

import {
  LOCAL_DEPLOYMENT_OWNER,
  LOCAL_PLUGIN_SPEC,
  runManagedInitCommand,
  runManagedUpdateCommand,
} from "../src/lib/local-deployment-commands.js";

describe("local deployment command guards", () => {
  it("fails closed for init without invoking an installer", () => {
    const log = vi.fn();

    expect(runManagedInitCommand({ argv: ["--dry-run"], log })).toBe(1);

    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("init is disabled");
    expect(output).toContain(LOCAL_DEPLOYMENT_OWNER);
    expect(output).toContain(LOCAL_PLUGIN_SPEC);
    expect(output).toContain("No network, npm, configuration, package-cache, or migration changes");
  });

  it("reports local update identity without applying any update", async () => {
    const log = vi.fn();

    expect(await runManagedUpdateCommand({ argv: ["--dry-run", "--yes"], log })).toBe(0);

    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("informational-only");
    expect(output).toContain("Local identity:");
    expect(output).toContain(LOCAL_DEPLOYMENT_OWNER);
    expect(output).toContain(LOCAL_PLUGIN_SPEC);
    expect(output).toContain("No network, npm, configuration, package-cache, or migration changes");
  });

  it("rejects unknown update options before inspecting deployment state", async () => {
    const log = vi.fn();

    expect(await runManagedUpdateCommand({ argv: ["--apply"], log })).toBe(1);
    expect(log).toHaveBeenCalledWith("Unknown update option: --apply");
  });
});
