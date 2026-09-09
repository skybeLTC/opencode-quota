import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cachedVersion: string | undefined;
let cachedPromise: Promise<string | undefined> | null = null;

export type QuotaBuildMetadata = {
  releaseLine: string;
  commit: string;
  shortCommit: string;
  displayVersion: string;
};

const DISPLAY_VERSION_RE =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?-sky\.g[0-9a-f]{10}$/;
const FULL_COMMIT_RE = /^[0-9a-f]{40}$/;
const SHORT_COMMIT_RE = /^[0-9a-f]{10}$/;

export function parseQuotaBuildMetadata(value: unknown): QuotaBuildMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.releaseLine !== "string" ||
    typeof metadata.commit !== "string" ||
    typeof metadata.shortCommit !== "string" ||
    typeof metadata.displayVersion !== "string"
  ) {
    return null;
  }
  if (!FULL_COMMIT_RE.test(metadata.commit) || !SHORT_COMMIT_RE.test(metadata.shortCommit)) {
    return null;
  }
  if (!metadata.commit.startsWith(metadata.shortCommit)) return null;
  if (metadata.displayVersion !== `${metadata.releaseLine}-sky.g${metadata.shortCommit}`) {
    return null;
  }
  if (!DISPLAY_VERSION_RE.test(metadata.displayVersion)) return null;

  return {
    releaseLine: metadata.releaseLine,
    commit: metadata.commit,
    shortCommit: metadata.shortCommit,
    displayVersion: metadata.displayVersion,
  };
}

export async function getPackageVersion(): Promise<string | undefined> {
  if (cachedVersion) return cachedVersion;
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    try {
      const here = dirname(fileURLToPath(import.meta.url));
      const metadataPath = join(here, "..", "build-metadata.json");
      const raw = await readFile(metadataPath, "utf-8");
      const metadata = parseQuotaBuildMetadata(JSON.parse(raw) as unknown);
      if (!metadata) return undefined;
      cachedVersion = metadata.displayVersion;
      return metadata.displayVersion;
    } catch {
      return undefined;
    } finally {
      cachedPromise = null;
    }
  })();

  return cachedPromise;
}
