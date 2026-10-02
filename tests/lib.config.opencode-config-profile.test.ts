import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quotaProvider } from "./fixtures/quota-providers.js";
import {
  type ConfigLoaderWorkspace,
  createConfigLoaderWorkspace,
  quotaConfigSource,
  writeQuotaToastConfig,
} from "./helpers/config-loader-test-harness.js";

const mocks = vi.hoisted(() => ({
  runtimeDirs: {
    value: {
      dataDirs: [] as string[],
      configDirs: [] as string[],
      cacheDirs: [] as string[],
      stateDirs: [] as string[],
    },
  },
}));

vi.mock("../src/lib/opencode-runtime-paths.js", () => ({
  getOpencodeRuntimeDirCandidates: () => mocks.runtimeDirs.value,
  getOpencodeRuntimeDirs: () => ({
    dataDir: mocks.runtimeDirs.value.dataDirs[0] ?? "",
    configDir: mocks.runtimeDirs.value.configDirs[0] ?? "",
    cacheDir: mocks.runtimeDirs.value.cacheDirs[0] ?? "",
    stateDir: mocks.runtimeDirs.value.stateDirs[0] ?? "",
  }),
}));

import { createLoadConfigMeta, loadConfig } from "../src/lib/config.js";
import { resolveQuotaRuntimeContext } from "../src/lib/quota-runtime-context.js";

const PROFILE_SOURCE_SUFFIX = " (experimental.quotaToast)";

describe("explicit OPENCODE_CONFIG profile layer", () => {
  const originalEnv = process.env;
  let workspace: ConfigLoaderWorkspace;
  let globalDir: string;
  let profileDir: string;

  function writeProfileConfig(
    fileName: string,
    quotaToast: Record<string, unknown>,
    raw?: string,
  ): string {
    const path = join(profileDir, fileName);
    writeFileSync(path, raw ?? JSON.stringify({ experimental: { quotaToast } }), "utf8");
    return path;
  }

  async function load(): Promise<{
    config: Awaited<ReturnType<typeof loadConfig>>;
    meta: ReturnType<typeof createLoadConfigMeta>;
  }> {
    const meta = createLoadConfigMeta();
    const config = await loadConfig(undefined, meta, {
      configRootDir: workspace.workspaceDir,
    });
    return { config, meta };
  }

  beforeEach(() => {
    workspace = createConfigLoaderWorkspace("opencode-quota-config-profile-");
    globalDir = workspace.opencodeConfigDir;
    profileDir = join(workspace.tempDir, "profiles");
    mkdirSync(profileDir, { recursive: true });
    mocks.runtimeDirs.value = { ...workspace.runtimeDirs, configDirs: [globalDir] };
    process.env = { ...originalEnv };
    delete process.env.OPENCODE_CONFIG;
  });

  afterEach(() => {
    process.env = originalEnv;
    workspace.cleanup();
  });

  it("ignores the profile layer when OPENCODE_CONFIG is absent", async () => {
    writeQuotaToastConfig(globalDir, { minIntervalMs: 1000 });
    writeProfileConfig("profile.json", { minIntervalMs: 2000 });

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(1000);
    expect(meta.profileConfigPaths).toEqual([]);
  });

  it("applies the profile layer alone", async () => {
    const profilePath = writeProfileConfig("profile.json", { minIntervalMs: 2000 });
    process.env.OPENCODE_CONFIG = profilePath;

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(2000);
    expect(meta.profileConfigPaths).toEqual([`${profilePath}${PROFILE_SOURCE_SUFFIX}`]);
    expect(meta.globalConfigPaths).toEqual([]);
    expect(meta.workspaceConfigPaths).toEqual([]);
  });

  it("applies the global layer alone", async () => {
    writeQuotaToastConfig(globalDir, { minIntervalMs: 1000 });

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(1000);
    expect(meta.globalConfigPaths).toEqual([quotaConfigSource(globalDir)]);
    expect(meta.profileConfigPaths).toEqual([]);
  });

  it("applies the workspace layer alone", async () => {
    writeQuotaToastConfig(workspace.workspaceDir, { minIntervalMs: 3000 });

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(3000);
    expect(meta.workspaceConfigPaths).toEqual([quotaConfigSource(workspace.workspaceDir)]);
    expect(meta.profileConfigPaths).toEqual([]);
  });

  it("lets the profile override the global layer", async () => {
    writeQuotaToastConfig(globalDir, { minIntervalMs: 1000 });
    const profilePath = writeProfileConfig("profile.json", { minIntervalMs: 2000 });
    process.env.OPENCODE_CONFIG = profilePath;

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(2000);
    expect(meta.settingSources.minIntervalMs).toBe(`${profilePath}${PROFILE_SOURCE_SUFFIX}`);
  });

  it("lets the workspace override the profile layer", async () => {
    const profilePath = writeProfileConfig("profile.json", { minIntervalMs: 2000 });
    process.env.OPENCODE_CONFIG = profilePath;
    writeQuotaToastConfig(workspace.workspaceDir, { minIntervalMs: 3000 });

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(3000);
    expect(meta.settingSources.minIntervalMs).toBe(quotaConfigSource(workspace.workspaceDir));
  });

  it("lets the workspace override the global layer with no profile present", async () => {
    writeQuotaToastConfig(globalDir, { minIntervalMs: 1000, resetTimeDecimals: 1 });
    writeQuotaToastConfig(workspace.workspaceDir, { minIntervalMs: 3000 });

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(3000);
    expect(config.resetTimeDecimals).toBe(1);
    expect(meta.profileConfigPaths).toEqual([]);
    expect(meta.paths).toEqual([
      quotaConfigSource(globalDir),
      quotaConfigSource(workspace.workspaceDir),
    ]);
    expect(meta.settingSources.minIntervalMs).toBe(quotaConfigSource(workspace.workspaceDir));
    expect(meta.settingSources.resetTimeDecimals).toBe(quotaConfigSource(globalDir));
  });

  it("resolves global -> profile -> workspace precedence across all three layers", async () => {
    writeQuotaToastConfig(globalDir, {
      minIntervalMs: 1000,
      requestTimeoutMs: 1100,
      resetTimeDecimals: 1,
    });
    const profilePath = writeProfileConfig("profile.json", {
      minIntervalMs: 2000,
      requestTimeoutMs: 2200,
    });
    process.env.OPENCODE_CONFIG = profilePath;
    writeQuotaToastConfig(workspace.workspaceDir, { minIntervalMs: 3000 });

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(3000);
    expect(config.requestTimeoutMs).toBe(2200);
    expect(config.resetTimeDecimals).toBe(1);
    expect(meta.paths).toEqual([
      quotaConfigSource(globalDir),
      `${profilePath}${PROFILE_SOURCE_SUFFIX}`,
      quotaConfigSource(workspace.workspaceDir),
    ]);
    expect(meta.settingSources.resetTimeDecimals).toBe(quotaConfigSource(globalDir));
    expect(meta.settingSources.requestTimeoutMs).toBe(`${profilePath}${PROFILE_SOURCE_SUFFIX}`);
    expect(meta.settingSources.minIntervalMs).toBe(quotaConfigSource(workspace.workspaceDir));
  });

  it("parses a JSONC profile with comments and trailing commas", async () => {
    const profilePath = writeProfileConfig(
      "profile.jsonc",
      {},
      `{
  // machine-specific overlay
  "experimental": {
    "quotaToast": {
      "minIntervalMs": 2500,
    },
  },
}
`,
    );
    process.env.OPENCODE_CONFIG = profilePath;

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(2500);
    expect(meta.profileConfigPaths).toEqual([`${profilePath}${PROFILE_SOURCE_SUFFIX}`]);
  });

  it("ignores an OPENCODE_CONFIG path that does not exist", async () => {
    writeQuotaToastConfig(globalDir, { minIntervalMs: 1000 });
    process.env.OPENCODE_CONFIG = join(profileDir, "missing-profile.json");

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(1000);
    expect(meta.profileConfigPaths).toEqual([]);
    expect(meta.configIssues).toEqual([]);
  });

  it("deduplicates a profile that points at the same physical global candidate", async () => {
    writeQuotaToastConfig(globalDir, { minIntervalMs: 1000 });
    process.env.OPENCODE_CONFIG = join(globalDir, "opencode.json");

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(1000);
    expect(meta.profileConfigPaths).toEqual([]);
    expect(meta.paths).toEqual([quotaConfigSource(globalDir)]);
  });

  it("deduplicates a profile that points at the same physical workspace candidate", async () => {
    writeQuotaToastConfig(workspace.workspaceDir, { minIntervalMs: 3000 });
    process.env.OPENCODE_CONFIG = join(workspace.workspaceDir, "opencode.json");

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(3000);
    expect(meta.profileConfigPaths).toEqual([]);
    expect(meta.paths).toEqual([quotaConfigSource(workspace.workspaceDir)]);
  });

  it("keeps quotaProviders global-only and rejects them from the profile", async () => {
    const profilePath = writeProfileConfig("profile.json", {
      minIntervalMs: 2000,
      quotaProviders: [quotaProvider({ id: "profile-source", label: "Profile source" })],
    });
    process.env.OPENCODE_CONFIG = profilePath;

    const { config, meta } = await load();

    expect(config.minIntervalMs).toBe(2000);
    expect(config.quotaProviders ?? []).toEqual([]);
    expect(meta.settingSources.quotaProviders).toBeUndefined();
    expect(meta.configIssues).toContainEqual({
      path: `${profilePath}${PROFILE_SOURCE_SUFFIX}`,
      key: "quotaProviders",
      message: "allowed only in global OpenCode or global opencode-quota config",
    });
  });

  it("reaches every surface through the shared runtime-context loader", async () => {
    writeQuotaToastConfig(globalDir, { minIntervalMs: 1000 });
    const profilePath = writeProfileConfig("profile.json", { minIntervalMs: 2000 });
    process.env.OPENCODE_CONFIG = profilePath;

    const runtime = await resolveQuotaRuntimeContext({
      client: {
        config: {
          get: async () => ({ data: {} }),
          providers: async () => ({ data: { providers: [] } }),
        },
      } as never,
      roots: { configRoot: workspace.workspaceDir, fallbackDirectory: workspace.workspaceDir },
    });

    expect(runtime.config.minIntervalMs).toBe(2000);
    expect(runtime.configMeta.profileConfigPaths).toEqual([
      `${profilePath}${PROFILE_SOURCE_SUFFIX}`,
    ]);
  });

  it("keeps global quotaProviders authoritative while a profile is active", async () => {
    writeQuotaToastConfig(globalDir, {
      quotaProviders: [quotaProvider({ id: "global-source", label: "Global source" })],
    });
    const profilePath = writeProfileConfig("profile.json", { minIntervalMs: 2000 });
    process.env.OPENCODE_CONFIG = profilePath;

    const { config, meta } = await load();

    expect((config.quotaProviders ?? []).map((definition) => definition.id)).toEqual([
      "global-source",
    ]);
    expect(meta.settingSources.quotaProviders).toBe(quotaConfigSource(globalDir));
    expect(config.minIntervalMs).toBe(2000);
  });
});
