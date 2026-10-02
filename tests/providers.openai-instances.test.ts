import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ConfigLoaderWorkspace,
  createConfigLoaderWorkspace,
  writeQuotaToastConfig,
} from "./helpers/config-loader-test-harness.js";

const TEST_RUNTIME_ROOT = "/tmp/opencode-quota-openai-instance-tests";

const mocks = vi.hoisted(() => ({
  readAuthFileCached: vi.fn(),
  runtimeConfigDirs: { value: [] as string[] },
}));

vi.mock("../src/lib/opencode-auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/opencode-auth.js")>();
  return {
    ...actual,
    readAuthFileCached: mocks.readAuthFileCached,
  };
});

vi.mock("../src/lib/resolved-auth-identity.js", () => ({
  // Deterministic, collision-free stand-in: identity depends on both the
  // provider namespace and the winning principal, which is exactly what the
  // instance model relies on for cache separation and invalidation.
  deriveResolvedAuthIdentity: vi.fn(
    async (params: { providerId: string; principal: { kind: string; value: string } }) =>
      `rai1_${params.providerId}|${params.principal.kind}|${params.principal.value}`,
  ),
}));

vi.mock("../src/lib/opencode-runtime-paths.js", () => ({
  getOpencodeRuntimeDirCandidates: () => ({
    dataDirs: [`${TEST_RUNTIME_ROOT}/data`],
    configDirs: mocks.runtimeConfigDirs.value,
    cacheDirs: [`${TEST_RUNTIME_ROOT}/cache`],
    stateDirs: [`${TEST_RUNTIME_ROOT}/state`],
  }),
  getOpencodeRuntimeDirs: () => ({
    dataDir: `${TEST_RUNTIME_ROOT}/data`,
    configDir: `${TEST_RUNTIME_ROOT}/config`,
    cacheDir: `${TEST_RUNTIME_ROOT}/cache`,
    stateDir: `${TEST_RUNTIME_ROOT}/state`,
  }),
}));

import { createLoadConfigMeta, loadConfig } from "../src/lib/config.js";
import type { QuotaProvider, QuotaProviderContext } from "../src/lib/entries.js";
import { resolveQuotaRuntimeContext } from "../src/lib/quota-runtime-context.js";
import {
  createRuntimeProviderResolvers,
  narrowRuntimeProviderDescriptor,
} from "../src/lib/runtime-provider-ids.js";
import { openaiProvider } from "../src/providers/openai.js";
import {
  createOpenAIInstanceProvider,
  materializeInheritedProviderInstances,
} from "../src/providers/openai-instances.js";

const CANONICAL_PROVIDERS: QuotaProvider[] = [
  openaiProvider,
  { id: "anthropic", isAvailable: async () => false, fetch: async () => attemptedNothing() },
];

function attemptedNothing() {
  return { attempted: false, entries: [], errors: [] };
}

/** Minimal JWT-shaped access token; only the payload segment is parsed. */
function accessToken(payload: Record<string, unknown>, signature: string): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
}

function oauthEntry(params: { accountId?: string; signature: string; email?: string }) {
  return {
    type: "oauth",
    access: accessToken(
      params.email ? { "https://api.openai.com/profile": { email: params.email } } : {},
      params.signature,
    ),
    refresh: `refresh-${params.signature}`,
    ...(params.accountId ? { accountId: params.accountId } : {}),
  };
}

function usageResponse(planType: string, usedPercent: number) {
  return {
    plan_type: planType,
    rate_limit: {
      limit_reached: false,
      primary_window: { limit_window_seconds: 18000, used_percent: usedPercent },
    },
  };
}

/** Routes each request to a plan/usage pair keyed by the exact bearer token. */
function stubUsageByBearerToken(usageByToken: Record<string, unknown>) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer /u, "");
    const usage = usageByToken[token];
    if (!usage) return { ok: false, status: 401 };
    return { ok: true, json: async () => usage };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createProviderContext(): QuotaProviderContext {
  return {
    client: {
      config: {
        providers: async () => ({ data: { providers: [] } }),
        get: async () => ({ data: {} }),
      },
    },
    resolveRuntimeProviderIds: async () => new Set<string>(),
    config: {
      googleModels: ["CLAUDE"],
      cursorPlan: "none",
      onlyCurrentModel: false,
      enabledProviders: "auto",
    },
  };
}

describe("inherited OpenAI provider instances", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await rm(TEST_RUNTIME_ROOT, { recursive: true, force: true });
    const { __resetQuotaStateForTests } = await import("../src/lib/quota-state.js");
    __resetQuotaStateForTests();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { __resetQuotaStateForTests } = await import("../src/lib/quota-state.js");
    __resetQuotaStateForTests();
    await rm(TEST_RUNTIME_ROOT, { recursive: true, force: true });
  });

  it("materializes instances only for descriptors whose baseProviderID is exactly openai", () => {
    const providers = materializeInheritedProviderInstances({
      providers: CANONICAL_PROVIDERS,
      descriptors: [
        { id: "openai", baseProviderID: "openai" },
        { id: "openai-Work", baseProviderID: "openai", name: "Work" },
        { id: "vendor-alias", baseProviderID: "anthropic" },
        { id: "case-alias", baseProviderID: "OpenAI" },
        { id: "plain-alias" },
      ],
    });

    expect(providers.map((provider) => provider.id)).toEqual([
      "openai",
      "anthropic",
      "openai-Work",
    ]);
  });

  it("preserves the canonical static openai provider instance untouched", () => {
    const providers = materializeInheritedProviderInstances({
      providers: CANONICAL_PROVIDERS,
      descriptors: [
        { id: "openai", baseProviderID: "openai" },
        { id: "openai-Work", baseProviderID: "openai" },
      ],
    });

    expect(providers[0]).toBe(openaiProvider);
    expect(providers.filter((provider) => provider.id === "openai")).toHaveLength(1);
  });

  it("leaves unknown non-OpenAI runtime providers and legacy canonical providers unaffected", () => {
    const providers = materializeInheritedProviderInstances({
      providers: CANONICAL_PROVIDERS,
      descriptors: [
        { id: "anthropic", baseProviderID: "anthropic" },
        { id: "some-unknown-provider" },
        { id: "another-unknown", baseProviderID: "unknown-base" },
      ],
    });

    expect(providers).toEqual(CANONICAL_PROVIDERS);
  });

  it("becomes available only through an exact OAuth auth entry for its own id", async () => {
    const instance = createOpenAIInstanceProvider({ id: "openai-Work" });

    mocks.readAuthFileCached.mockResolvedValue({
      "openai-Work": oauthEntry({ signature: "work", accountId: "acct-work" }),
    });
    await expect(instance.isAvailable(createProviderContext())).resolves.toBe(true);
  });

  it("never falls back to canonical OpenAI auth for an alias id", async () => {
    const instance = createOpenAIInstanceProvider({ id: "openai-Work" });

    mocks.readAuthFileCached.mockResolvedValue({
      openai: oauthEntry({ signature: "canonical", accountId: "acct-canonical" }),
    });

    await expect(instance.isAvailable(createProviderContext())).resolves.toBe(false);
    const result = await instance.fetch(createProviderContext());
    expect(result.attempted).toBe(false);
  });

  it("treats an API-credential alias as an unavailable ChatGPT quota source", async () => {
    const instance = createOpenAIInstanceProvider({ id: "openai-ApiKeyAlias" });

    mocks.readAuthFileCached.mockResolvedValue({
      "openai-ApiKeyAlias": { type: "api", key: "sk-not-a-chatgpt-session" },
      openai: oauthEntry({ signature: "canonical", accountId: "acct-canonical" }),
    });

    await expect(instance.isAvailable(createProviderContext())).resolves.toBe(false);
    const result = await instance.fetch(createProviderContext());
    expect(result.attempted).toBe(false);
    expect(result.entries).toEqual([]);
  });

  it("fetches with the exact alias credential and keeps the exact id in the result identity", async () => {
    const instance = createOpenAIInstanceProvider({ id: "openai-Work" });
    const entry = oauthEntry({ signature: "work", accountId: "acct-work" });

    mocks.readAuthFileCached.mockResolvedValue({
      "openai-Work": entry,
      openai: oauthEntry({ signature: "canonical", accountId: "acct-canonical" }),
    });
    const fetchMock = stubUsageByBearerToken({ [entry.access]: usageResponse("plus", 40) });

    const result = await instance.fetch(createProviderContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get("Authorization")).toBe(`Bearer ${entry.access}`);
    expect(requestHeaders.get("ChatGPT-Account-Id")).toBe("acct-work");
    expect(result.attempted).toBe(true);
    expect(result.entries[0]?.group).toBe("OpenAI (Plus) (openai-Work)");
    expect(result.presentation?.singleWindowDisplayName).toBe("OpenAI (Plus) (openai-Work)");
  });

  it("reports errors under the exact configured instance id", async () => {
    const instance = createOpenAIInstanceProvider({ id: "openai-Work" });

    mocks.readAuthFileCached.mockResolvedValue({
      "openai-Work": oauthEntry({ signature: "work" }),
    });
    stubUsageByBearerToken({});

    const result = await instance.fetch(createProviderContext());

    expect(result.attempted).toBe(true);
    expect(result.errors[0]?.label).toBe("openai-Work");
  });

  it("keeps two instances independent across results, cache and in-flight de-duplication", async () => {
    const { fetchQuotaProviderResult } = await import("../src/lib/quota-state.js");
    const work = createOpenAIInstanceProvider({ id: "openai-Work" });
    const personal = createOpenAIInstanceProvider({ id: "openai-Personal" });
    const workEntry = oauthEntry({ signature: "work", accountId: "acct-work" });
    const personalEntry = oauthEntry({ signature: "personal", accountId: "acct-personal" });

    mocks.readAuthFileCached.mockResolvedValue({
      "openai-Work": workEntry,
      "openai-Personal": personalEntry,
    });
    const fetchMock = stubUsageByBearerToken({
      [workEntry.access]: usageResponse("plus", 40),
      [personalEntry.access]: usageResponse("pro", 10),
    });

    const ctx = createProviderContext();
    // Concurrent: in-flight de-duplication must be keyed per instance, so both
    // instances still perform their own request.
    const [workResult, personalResult] = await Promise.all([
      fetchQuotaProviderResult({ provider: work, ctx, ttlMs: 60_000 }),
      fetchQuotaProviderResult({ provider: personal, ctx, ttlMs: 60_000 }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(workResult.entries[0]?.group).toBe("OpenAI (Plus) (openai-Work)");
    expect(personalResult.entries[0]?.group).toBe("OpenAI (Pro) (openai-Personal)");
    expect(workResult.entries[0]).toMatchObject({ percentRemaining: 60 });
    expect(personalResult.entries[0]).toMatchObject({ percentRemaining: 90 });

    // Cached: each instance resolves from its own cache entry, no new requests.
    const workCached = await fetchQuotaProviderResult({ provider: work, ctx, ttlMs: 60_000 });
    const personalCached = await fetchQuotaProviderResult({
      provider: personal,
      ctx,
      ttlMs: 60_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(workCached.entries[0]?.group).toBe("OpenAI (Plus) (openai-Work)");
    expect(personalCached.entries[0]?.group).toBe("OpenAI (Pro) (openai-Personal)");
  });

  it("builds distinct cache keys and cache files per instance id", async () => {
    const { buildQuotaProviderStateCacheKey, getQuotaProviderStateCacheFilePath } = await import(
      "../src/lib/quota-state.js"
    );
    const ctx = createProviderContext();

    const workKey = buildQuotaProviderStateCacheKey("openai-Work", ctx);
    const personalKey = buildQuotaProviderStateCacheKey("openai-Personal", ctx);
    const canonicalKey = buildQuotaProviderStateCacheKey("openai", ctx);

    expect(new Set([workKey, personalKey, canonicalKey]).size).toBe(3);
    expect(getQuotaProviderStateCacheFilePath("openai-Work", workKey)).toContain("openai-Work-");
    expect(getQuotaProviderStateCacheFilePath("openai-Work", workKey)).not.toBe(
      getQuotaProviderStateCacheFilePath("openai-Personal", personalKey),
    );
  });

  it("invalidates a stale instance cache entry when the account identity changes", async () => {
    const { fetchQuotaProviderResult } = await import("../src/lib/quota-state.js");
    const work = createOpenAIInstanceProvider({ id: "openai-Work" });
    const firstEntry = oauthEntry({ signature: "first", accountId: "acct-first" });
    const secondEntry = oauthEntry({ signature: "second", accountId: "acct-second" });

    mocks.readAuthFileCached.mockResolvedValue({ "openai-Work": firstEntry });
    const fetchMock = stubUsageByBearerToken({
      [firstEntry.access]: usageResponse("plus", 40),
      [secondEntry.access]: usageResponse("pro", 10),
    });

    const ctx = createProviderContext();
    const first = await fetchQuotaProviderResult({ provider: work, ctx, ttlMs: 60_000 });
    expect(first.entries[0]?.group).toBe("OpenAI (Plus) (openai-Work)");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    mocks.readAuthFileCached.mockResolvedValue({ "openai-Work": secondEntry });
    const second = await fetchQuotaProviderResult({ provider: work, ctx, ttlMs: 60_000 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.entries[0]?.group).toBe("OpenAI (Pro) (openai-Work)");
    expect(second.entries[0]).toMatchObject({ percentRemaining: 90 });
  });
});

describe("enabledProviders acceptance of discovered runtime provider ids", () => {
  let workspace: ConfigLoaderWorkspace;

  beforeEach(() => {
    workspace = createConfigLoaderWorkspace("opencode-quota-enabled-providers-");
    mocks.runtimeConfigDirs.value = [];
  });

  afterEach(() => {
    mocks.runtimeConfigDirs.value = [];
    workspace.cleanup();
  });

  it("accepts a discovered exact runtime id without lowercasing or synonym collapsing", async () => {
    writeQuotaToastConfig(workspace.workspaceDir, {
      enabledProviders: ["openai", "openai-Work"],
    });
    const meta = createLoadConfigMeta();

    const config = await loadConfig(undefined, meta, {
      configRootDir: workspace.workspaceDir,
      knownRuntimeProviderIds: new Set(["openai", "openai-Work"]),
    });

    expect(config.enabledProviders).toEqual(["openai", "openai-Work"]);
    expect(meta.configIssues).toEqual([]);
  });

  it("keeps canonical-catalog validation when the id was not discovered", async () => {
    writeQuotaToastConfig(workspace.workspaceDir, {
      enabledProviders: ["openai", "openai-Work"],
    });
    const meta = createLoadConfigMeta();

    const config = await loadConfig(undefined, meta, {
      configRootDir: workspace.workspaceDir,
      knownRuntimeProviderIds: new Set(["openai"]),
    });

    expect(config.enabledProviders).toEqual(["openai"]);
    expect(meta.configIssues).toContainEqual(expect.objectContaining({ key: "enabledProviders" }));
  });

  it("preserves legacy behavior when runtime discovery is unavailable", async () => {
    writeQuotaToastConfig(workspace.workspaceDir, {
      enabledProviders: ["OpenAI", "chatgpt"],
    });
    const meta = createLoadConfigMeta();

    const config = await loadConfig(undefined, meta, {
      configRootDir: workspace.workspaceDir,
    });

    expect(config.enabledProviders).toEqual(["openai"]);
  });
});

describe("runtime provider descriptor discovery", () => {
  it("narrows runtime values and keeps the optional runtime fields", () => {
    expect(
      narrowRuntimeProviderDescriptor({
        id: "openai-Work",
        baseProviderID: "openai",
        name: "Work",
        extra: "ignored",
      }),
    ).toEqual({ id: "openai-Work", baseProviderID: "openai", name: "Work" });

    expect(narrowRuntimeProviderDescriptor({ id: "openai" })).toEqual({ id: "openai" });
    expect(narrowRuntimeProviderDescriptor({ id: "openai", baseProviderID: 7, name: "" })).toEqual({
      id: "openai",
    });
  });

  it("rejects values that carry no usable exact id", () => {
    expect(narrowRuntimeProviderDescriptor(null)).toBeNull();
    expect(narrowRuntimeProviderDescriptor("openai")).toBeNull();
    expect(narrowRuntimeProviderDescriptor({})).toBeNull();
    expect(narrowRuntimeProviderDescriptor({ id: "" })).toBeNull();
    expect(narrowRuntimeProviderDescriptor({ id: 7 })).toBeNull();
  });

  it("exposes descriptors and ids from a single memoized discovery call", async () => {
    const providers = vi.fn(async () => ({
      data: {
        providers: [
          { id: "openai", baseProviderID: "openai", name: "OpenAI" },
          { id: "openai-Work", baseProviderID: "openai", name: "Work" },
          { id: "vendor-alias", baseProviderID: "anthropic" },
          { id: "" },
          null,
        ],
      },
    }));
    const resolvers = createRuntimeProviderResolvers({
      config: { providers, get: async () => ({ data: {} }) },
    } as never);

    await expect(resolvers.resolveRuntimeProviderDescriptors()).resolves.toEqual([
      { id: "openai", baseProviderID: "openai", name: "OpenAI" },
      { id: "openai-Work", baseProviderID: "openai", name: "Work" },
      { id: "vendor-alias", baseProviderID: "anthropic" },
    ]);
    await expect(resolvers.resolveRuntimeProviderIds()).resolves.toEqual(
      new Set(["openai", "openai-Work", "vendor-alias"]),
    );
    await resolvers.resolveRuntimeProviderDescriptors();

    expect(providers).toHaveBeenCalledTimes(1);
  });
});

describe("runtime context discovery integration", () => {
  let workspace: ConfigLoaderWorkspace;

  function createDiscoveryClient() {
    return {
      config: {
        get: async () => ({ data: {} }),
        providers: async () => ({
          data: {
            providers: [
              { id: "openai", baseProviderID: "openai" },
              { id: "openai-Work", baseProviderID: "openai", name: "Work" },
              { id: "vendor-alias", baseProviderID: "anthropic" },
            ],
          },
        }),
      },
    } as never;
  }

  beforeEach(() => {
    workspace = createConfigLoaderWorkspace("opencode-quota-runtime-discovery-");
    mocks.runtimeConfigDirs.value = [];
  });

  afterEach(() => {
    mocks.runtimeConfigDirs.value = [];
    workspace.cleanup();
  });

  it("materializes the inherited alias and accepts its exact mixed-case enabledProviders id", async () => {
    writeQuotaToastConfig(workspace.workspaceDir, {
      enabledProviders: ["openai", "openai-Work"],
    });

    const runtime = await resolveQuotaRuntimeContext({
      client: createDiscoveryClient(),
      roots: {
        configRoot: workspace.workspaceDir,
        fallbackDirectory: workspace.workspaceDir,
      },
    });

    expect(runtime.providers.map((provider) => provider.id)).toContain("openai-Work");
    expect(runtime.config.enabledProviders).toEqual(["openai", "openai-Work"]);
    expect(runtime.configMeta.configIssues).toEqual([]);
  });

  it("does not accept a discovered non-OpenAI provider id as a dynamic enabledProviders id", async () => {
    writeQuotaToastConfig(workspace.workspaceDir, {
      enabledProviders: ["openai-Work", "vendor-alias"],
    });

    const runtime = await resolveQuotaRuntimeContext({
      client: createDiscoveryClient(),
      roots: {
        configRoot: workspace.workspaceDir,
        fallbackDirectory: workspace.workspaceDir,
      },
    });

    expect(runtime.providers.map((provider) => provider.id)).not.toContain("vendor-alias");
    expect(runtime.config.enabledProviders).toEqual(["openai-Work"]);
    expect(runtime.configMeta.configIssues).toContainEqual(
      expect.objectContaining({ key: "enabledProviders" }),
    );
  });
});
