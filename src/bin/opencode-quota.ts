#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  runManagedInitCommand,
  runManagedUpdateCommand,
} from "../lib/local-deployment-commands.js";

const USAGE = [
  "Usage:",
  "  opencode-quota init [--dry-run] [--sync-legacy-config]",
  "  opencode-quota show [--provider <provider-id>] [--json] [--threshold <pct>]",
  "  opencode-quota status [--provider <provider-id>] [--json]",
  "  opencode-quota update [--dry-run] [--yes]",
  "  opencode-quota provider add [--dry-run]",
  "  opencode-quota --help",
  "",
  "Commands:",
  "  init    Disabled: this local build is managed by local-ai",
  "  show    Print a quick quota glance",
  "          --json               Machine-readable JSON output (reads from cache)",
  "          --threshold <pct>    With --json, exit 1 if below <pct>%, 2 if incomplete/not comparable",
  "          --provider <id>      Filter to one provider",
  "  status  Print Quota Status diagnostics (same data as /quota_status)",
  "          --json               Machine-readable JSON output",
  "          --provider <id>      Filter to one provider",
  "  update  Show local identity and deployment ownership; never mutates anything",
  "          --dry-run            Accepted for compatibility; no changes are made",
  "          --yes                Accepted for compatibility; no changes are made",
  "  provider add  Add or update one global quotaProviders definition",
  "          --dry-run            Preview the exact global OpenCode config without writing",
].join("\n");

function printUsage(): void {
  console.log(USAGE);
}

function resolveCliPath(filePath: string): string {
  try {
    return realpathSync.native(filePath);
  } catch {
    return resolve(filePath);
  }
}

export function cliShouldRunMain(
  argv1: string | undefined = process.argv[1],
  modulePath: string = fileURLToPath(import.meta.url),
  resolvePath: (filePath: string) => string = resolveCliPath,
): boolean {
  if (!argv1) {
    return false;
  }

  return resolvePath(modulePath) === resolvePath(argv1);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;

  if (!command) {
    printUsage();
    return 1;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    printUsage();
    return 0;
  }

  if (command === "init") {
    return runManagedInitCommand({ argv: rest });
  }

  if (command === "show") {
    const { runCliShowCommand } = await import("../lib/cli-show.js");
    return await runCliShowCommand({ argv: rest });
  }

  if (command === "status") {
    const { runCliStatusCommand } = await import("../lib/cli-status.js");
    return await runCliStatusCommand({ argv: rest });
  }

  if (command === "update") {
    return await runManagedUpdateCommand({ argv: rest });
  }

  if (command === "provider" && rest[0] === "add") {
    const { runProviderAddCommand } = await import("../lib/provider-add-command.js");
    return await runProviderAddCommand({ argv: rest.slice(1) });
  }

  printUsage();
  return 1;
}

if (cliShouldRunMain()) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
