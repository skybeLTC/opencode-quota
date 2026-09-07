import type { QuotaProviderContext } from "./entries.js";

export type RuntimeProviderIdResolver = () => Promise<ReadonlySet<string>>;

/**
 * Exact runtime provider descriptor as reported by OpenCode.
 *
 * `id` is the exact configured provider id and is the only guaranteed field.
 * `baseProviderID` and `name` are optional because generated SDK typings may
 * omit them; they are accepted only when they are present and are strings.
 */
export interface RuntimeProviderDescriptor {
  id: string;
  baseProviderID?: string;
  name?: string;
}

export type RuntimeProviderDescriptorResolver = () => Promise<readonly RuntimeProviderDescriptor[]>;

/**
 * Narrows one runtime provider value to the descriptor contract.
 *
 * Shared by SDK-backed discovery and by the TUI state fallback so that both
 * preserve the optional runtime fields even when generated typings omit them.
 * Returns null for values that carry no usable exact id.
 */
export function narrowRuntimeProviderDescriptor(value: unknown): RuntimeProviderDescriptor | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as { id?: unknown; baseProviderID?: unknown; name?: unknown };
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;

  return {
    id: raw.id,
    ...(typeof raw.baseProviderID === "string" && raw.baseProviderID.length > 0
      ? { baseProviderID: raw.baseProviderID }
      : {}),
    ...(typeof raw.name === "string" && raw.name.length > 0 ? { name: raw.name } : {}),
  };
}

export interface RuntimeProviderResolvers {
  resolveRuntimeProviderIds: RuntimeProviderIdResolver;
  resolveRuntimeProviderDescriptors: RuntimeProviderDescriptorResolver;
}

/**
 * Creates both runtime provider views over a single memoized discovery call, so
 * descriptor-aware callers never add an extra provider discovery round trip.
 */
export function createRuntimeProviderResolvers(
  client: QuotaProviderContext["client"],
): RuntimeProviderResolvers {
  let pending: Promise<readonly RuntimeProviderDescriptor[]> | undefined;

  const resolveRuntimeProviderDescriptors: RuntimeProviderDescriptorResolver = () => {
    pending ??= client.config.providers().then((response) =>
      (response.data?.providers ?? []).flatMap((provider) => {
        const descriptor = narrowRuntimeProviderDescriptor(provider);
        return descriptor ? [descriptor] : [];
      }),
    );
    return pending;
  };

  return {
    resolveRuntimeProviderDescriptors,
    resolveRuntimeProviderIds: async () =>
      new Set((await resolveRuntimeProviderDescriptors()).map((descriptor) => descriptor.id)),
  };
}

export function createRuntimeProviderIdResolver(
  client: QuotaProviderContext["client"],
): RuntimeProviderIdResolver {
  return createRuntimeProviderResolvers(client).resolveRuntimeProviderIds;
}
