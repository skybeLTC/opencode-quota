import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => ({
  runManagedInitCommand: vi.fn(),
  runManagedUpdateCommand: vi.fn(),
  runCliShowCommand: vi.fn(),
  runCliStatusCommand: vi.fn(),
}));

vi.mock("../src/lib/local-deployment-commands.js", () => ({
  runManagedInitCommand: commandMocks.runManagedInitCommand,
  runManagedUpdateCommand: commandMocks.runManagedUpdateCommand,
}));

vi.mock("../src/lib/cli-show.js", () => ({
  runCliShowCommand: commandMocks.runCliShowCommand,
}));

vi.mock("../src/lib/cli-status.js", () => ({
  runCliStatusCommand: commandMocks.runCliStatusCommand,
}));

describe("opencode-quota bin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandMocks.runManagedInitCommand.mockReturnValue(1);
    commandMocks.runManagedUpdateCommand.mockResolvedValue(0);
    commandMocks.runCliShowCommand.mockResolvedValue(0);
    commandMocks.runCliStatusCommand.mockResolvedValue(0);
  });

  it("dispatches init to the local deployment guard", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");

    const code = await main(["init"]);

    expect(code).toBe(1);
    expect(commandMocks.runManagedInitCommand).toHaveBeenCalledWith({ argv: [] });
    expect(commandMocks.runCliShowCommand).not.toHaveBeenCalled();
  });

  it("passes init arguments to the local deployment guard without installing", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");

    const code = await main(["init", "--sync-legacy-config"]);

    expect(code).toBe(1);
    expect(commandMocks.runManagedInitCommand).toHaveBeenCalledWith({
      argv: ["--sync-legacy-config"],
    });
    expect(commandMocks.runCliShowCommand).not.toHaveBeenCalled();
  });

  it("passes init dry-run and legacy sync flags to the guard", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");

    const code = await main(["init", "--sync-legacy-config", "--dry-run"]);

    expect(code).toBe(1);
    expect(commandMocks.runManagedInitCommand).toHaveBeenCalledWith({
      argv: ["--sync-legacy-config", "--dry-run"],
    });
  });

  it("dispatches show to the quota CLI command", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");

    const code = await main(["show"]);

    expect(code).toBe(0);
    expect(commandMocks.runCliShowCommand).toHaveBeenCalledWith({ argv: [] });
    expect(commandMocks.runManagedInitCommand).not.toHaveBeenCalled();
  });

  it("passes show provider args through to the quota CLI command", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");

    const code = await main(["show", "--provider", "copilot"]);

    expect(code).toBe(0);
    expect(commandMocks.runCliShowCommand).toHaveBeenCalledWith({
      argv: ["--provider", "copilot"],
    });
  });

  it("dispatches update args to the informational local deployment command", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");

    const code = await main(["update", "--dry-run", "--yes"]);

    expect(code).toBe(0);
    expect(commandMocks.runManagedUpdateCommand).toHaveBeenCalledWith({
      argv: ["--dry-run", "--yes"],
    });
  });

  it("dispatches status to the quota status CLI command", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");

    const code = await main(["status"]);

    expect(code).toBe(0);
    expect(commandMocks.runCliStatusCommand).toHaveBeenCalledWith({ argv: [] });
    expect(commandMocks.runCliShowCommand).not.toHaveBeenCalled();
  });

  it("passes status provider args through to the status CLI command", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");

    const code = await main(["status", "--provider", "copilot", "--json"]);

    expect(code).toBe(0);
    expect(commandMocks.runCliStatusCommand).toHaveBeenCalledWith({
      argv: ["--provider", "copilot", "--json"],
    });
  });

  it("prints help and exits zero for --help", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await main(["--help"]);

    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("opencode-quota show"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("opencode-quota status"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Disabled: this local build"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("never mutates anything"));
    log.mockRestore();
  });

  it("prints usage and exits non-zero for no args", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await main([]);

    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("opencode-quota status"));
    log.mockRestore();
  });

  it("prints usage and exits non-zero for unknown commands", async () => {
    const { main } = await import("../src/bin/opencode-quota.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await main(["wat"]);

    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("opencode-quota status"));
    log.mockRestore();
  });

  it("treats symlinked bin paths as direct CLI execution", async () => {
    const { cliShouldRunMain } = await import("../src/bin/opencode-quota.js");

    const modulePath = fileURLToPath(new URL("../src/bin/opencode-quota.ts", import.meta.url));
    const tempDir = mkdtempSync(join(tmpdir(), "opencode-quota-bin-"));
    const symlinkPath = join(tempDir, "opencode-quota");

    try {
      symlinkSync(modulePath, symlinkPath);

      expect(cliShouldRunMain(symlinkPath, modulePath)).toBe(true);
      expect(cliShouldRunMain(join(tempDir, "other.js"), modulePath)).toBe(false);
      expect(cliShouldRunMain(undefined, modulePath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
