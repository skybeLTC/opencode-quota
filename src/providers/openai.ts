/**
 * OpenAI (Plus/Pro) provider wrapper.
 */

import type { QuotaProvider, QuotaProviderContext, QuotaProviderResult } from "../lib/entries.js";
import type { OpenAIResult, ResolvedOpenAIOAuth } from "../lib/openai.js";
import {
  DEFAULT_OPENAI_AUTH_CACHE_MAX_AGE_MS,
  hasOpenAIOAuthCached,
  queryOpenAIQuota,
  resolveOpenAIOAuth,
} from "../lib/openai.js";
import { readAuthFileCached } from "../lib/opencode-auth.js";
import { isCanonicalProviderAvailable } from "../lib/provider-availability.js";
import { modelProviderIncludesAny } from "../lib/provider-model-matching.js";
import {
  attemptedResult,
  groupedPercentWindowEntries,
  mapNullableProviderResult,
  statusDetailsFromRecord,
  withStatusDetails,
} from "./result-helpers.js";

/**
 * Shared OpenAI quota projection.
 *
 * The canonical `openai` provider and every inherited OpenAI-backed provider
 * instance render identical accounting semantics; only their identity labels
 * differ. Keeping this mapping here avoids duplicating the window projection
 * per instance.
 */
export function mapOpenAIQuotaProviderResult(params: {
  result: OpenAIResult;
  auth: ResolvedOpenAIOAuth;
  /** Exact identity used for error labels; never a normalized alias. */
  errorLabel: string;
  /** Exact configured provider id appended to group labels for instances. */
  groupSuffix?: string;
}): QuotaProviderResult {
  const providerResult = mapNullableProviderResult(params.result, {
    errorLabel: params.errorLabel,
    onSuccess: (result) => {
      const group = params.groupSuffix ? `${result.label} (${params.groupSuffix})` : result.label;
      return attemptedResult(
        groupedPercentWindowEntries({
          group,
          accounting: {
            resultType: "rate_limit",
            acquisitionMethod: "remote_api",
            ownership: "maintained",
            authority: "provider_reported",
          },
          windows: [
            { window: result.windows.hourly, suffix: "5h", label: "5h:" },
            { window: result.windows.weekly, suffix: "Weekly", label: "Weekly:" },
            { window: result.windows.monthly, suffix: "Monthly", label: "Monthly:" },
            { window: result.windows.codeReview, suffix: "Code Review", label: "Code Review:" },
          ],
        }),
        [],
        {
          singleWindowDisplayName: group,
        },
      );
    },
  });
  const configuredAuth = params.auth.state === "configured" ? params.auth : undefined;
  const configured = configuredAuth !== undefined;
  const expiresAt = configuredAuth?.expiresAt;
  return withStatusDetails(
    providerResult,
    statusDetailsFromRecord({
      auth_configured: configured ? "true" : "false",
      auth_source: configuredAuth?.sourceKey ?? "(none)",
      token_status: !configured
        ? "(none)"
        : expiresAt && expiresAt < Date.now()
          ? "expired"
          : "valid",
      token_expires_at: expiresAt ? new Date(expiresAt).toISOString() : "(none)",
    }),
  );
}

export const openaiProvider: QuotaProvider = {
  id: "openai",

  async isAvailable(ctx: QuotaProviderContext): Promise<boolean> {
    // Best-effort: if provider lookup errors, preserve current permissive fallback.
    const availableByProviderId = await isCanonicalProviderAvailable({
      ctx,
      providerId: "openai",
      fallbackOnError: true,
    });

    if (availableByProviderId) {
      return true;
    }

    return hasOpenAIOAuthCached({ maxAgeMs: DEFAULT_OPENAI_AUTH_CACHE_MAX_AGE_MS });
  },

  matchesCurrentModel(model: string): boolean {
    return modelProviderIncludesAny(model, ["openai", "chatgpt", "codex"]);
  },

  async fetch(ctx: QuotaProviderContext): Promise<QuotaProviderResult> {
    const auth = resolveOpenAIOAuth(await readAuthFileCached({ maxAgeMs: 5_000 }));
    const result = await queryOpenAIQuota({ requestTimeoutMs: ctx.config?.requestTimeoutMs });
    return mapOpenAIQuotaProviderResult({ result, auth, errorLabel: "OpenAI" });
  },
};
