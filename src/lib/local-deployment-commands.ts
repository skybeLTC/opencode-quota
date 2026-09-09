import { getPackageVersion } from "./version.js";

export const LOCAL_DEPLOYMENT_OWNER = "local-ai";
export const LOCAL_PLUGIN_SPEC = "{env:HOME}/local-ai/opencode-satellites/opencode-quota";

type Log = (message: string) => void;

const NO_MUTATION_MESSAGE =
  "No network, npm, configuration, package-cache, or migration changes were made.";

export async function runManagedUpdateCommand(
  params: { argv?: string[]; log?: Log } = {},
): Promise<number> {
  const argv = params.argv ?? [];
  const log = params.log ?? console.log;
  const unknown = argv.filter((arg) => arg !== "--dry-run" && arg !== "--yes");
  if (unknown.length > 0) {
    log(`Unknown update option: ${unknown.join(", ")}`);
    return 1;
  }

  const identity = await getPackageVersion();
  log("OpenCode Quota update is informational-only in this local build.");
  log(`Local identity: ${identity ?? "(build metadata unavailable)"}`);
  log(`Deployment owner: ${LOCAL_DEPLOYMENT_OWNER}`);
  log(`Managed plugin path: ${LOCAL_PLUGIN_SPEC}`);
  log(NO_MUTATION_MESSAGE);
  return 0;
}

export function runManagedInitCommand(params: { argv?: string[]; log?: Log } = {}): number {
  const log = params.log ?? console.log;
  log("OpenCode Quota init is disabled in this local-only build.");
  log(`Deployment owner: ${LOCAL_DEPLOYMENT_OWNER}`);
  log(`Managed plugin path: ${LOCAL_PLUGIN_SPEC}`);
  log("Use the local-ai managed deployment instead of installing or registering this package.");
  log(NO_MUTATION_MESSAGE);
  return 1;
}
