/**
 * Inherited OpenAI-backed provider instances.
 *
 * OpenCode lets a user declare additional providers that inherit an existing
 * base provider. When such a provider inherits exactly `openai`, it is a real,
 * separately authenticated ChatGPT quota source, but it is not the canonical
 * `openai` provider: it owns its own exact configured id, its own auth.json
 * entry, and therefore its own result, cache and in-flight identity.
 *
 * Instances are materialized from runtime discovery only. Nothing here changes
 * the canonical static `openai` provider.
 */

import type { QuotaProvider, QuotaProviderContext, QuotaProviderResult } from "../lib/entries.js";
import {
  DEFAULT_OPENAI_AUTH_CACHE_MAX_AGE_MS,
  hasOpenAIOAuthCached,
  queryOpenAIQuota,
  resolveOpenAIAuthIdentity,
  resolveOpenAIOAuthForSourceKeys,
} from "../lib/openai.js";
import { readAuthFileCached } from "../lib/opencode-auth.js";
import { modelProviderIncludesAny } from "../lib/provider-model-matching.js";
import type { RuntimeProviderDescriptor } from "../lib/runtime-provider-ids.js";
import { mapOpenAIQuotaProviderResult } from "./openai.js";

/** Base provider id that an inherited instance must declare exactly. */
export const OPENAI_INHERITED_BASE_PROVIDER_ID = "openai";

/**
 * Builds one OpenAI-backed provider instance bound to an exact configured id.
 *
 * The id is the single identity used for the provider id, error labels, result
 * grouping, auth namespace, resolved-auth identity, cache key, cache file stem
 * and in-flight key. Auth resolution is exact: an instance never falls back to
 * the canonical OpenAI auth keys, so an alias that only holds API credentials
 * never becomes a ChatGPT quota source.
 */
export function createOpenAIInstanceProvider(params: { id: string }): QuotaProvider {
  const authSourceKeys: readonly string[] = [params.id];

  return {
    id: params.id,

    cachePolicy: {
      kind: "resolved-auth",
      resolveIdentity: () =>
        resolveOpenAIAuthIdentity({
          maxAgeMs: DEFAULT_OPENAI_AUTH_CACHE_MAX_AGE_MS,
          authSourceKeys,
          providerId: params.id,
        }),
    },

    async isAvailable(): Promise<boolean> {
      // Availability requires an exact OAuth auth entry for this instance id.
      // Runtime provider presence alone is not sufficient, because inherited
      // providers may carry API credentials that expose no ChatGPT quota.
      return hasOpenAIOAuthCached({
        maxAgeMs: DEFAULT_OPENAI_AUTH_CACHE_MAX_AGE_MS,
        authSourceKeys,
      });
    },

    matchesCurrentModel(model: string): boolean {
      return modelProviderIncludesAny(model, [params.id]);
    },

    async fetch(ctx: QuotaProviderContext): Promise<QuotaProviderResult> {
      const auth = resolveOpenAIOAuthForSourceKeys(
        await readAuthFileCached({ maxAgeMs: 5_000 }),
        authSourceKeys,
      );
      const result = await queryOpenAIQuota({
        requestTimeoutMs: ctx.config?.requestTimeoutMs,
        authSourceKeys,
      });
      return mapOpenAIQuotaProviderResult({
        result,
        auth,
        errorLabel: params.id,
        groupSuffix: params.id,
      });
    },
  };
}

/**
 * Appends inherited OpenAI-backed instances to the canonical provider list.
 *
 * Only descriptors whose `baseProviderID` is exactly `openai` are materialized.
 * Descriptors that collide with an already registered provider id (including
 * the canonical `openai` id itself) are ignored, so legacy canonical providers
 * and unknown non-OpenAI runtime providers are unaffected.
 */
export function materializeInheritedProviderInstances(params: {
  providers: readonly QuotaProvider[];
  descriptors: readonly RuntimeProviderDescriptor[];
}): QuotaProvider[] {
  const registeredIds = new Set(params.providers.map((provider) => provider.id));
  const instances: QuotaProvider[] = [];

  for (const descriptor of params.descriptors) {
    if (descriptor.baseProviderID !== OPENAI_INHERITED_BASE_PROVIDER_ID) continue;
    if (!descriptor.id || registeredIds.has(descriptor.id)) continue;

    registeredIds.add(descriptor.id);
    instances.push(createOpenAIInstanceProvider({ id: descriptor.id }));
  }

  return [...params.providers, ...instances];
}
