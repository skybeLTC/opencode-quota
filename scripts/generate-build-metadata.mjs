import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distDir = path.join(repoRoot, "dist");
const metadataPath = path.join(distDir, "build-metadata.json");

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read build identity from Git: ${reason}`);
  }
}

function releaseLineFromTag(tag) {
  const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/.exec(tag);
  if (!match?.[1]) {
    throw new Error(`Unable to derive a release line from Git tag: ${tag}`);
  }
  return match[1];
}

const tag = git(["describe", "--tags", "--match", "v[0-9]*", "--abbrev=0"]);
const releaseLine = releaseLineFromTag(tag);
const commit = git(["rev-parse", "HEAD"]);
const shortCommit = git(["rev-parse", "--short=10", "HEAD"]);

if (!/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error(`Git HEAD is not a full lowercase SHA-1: ${commit}`);
}
if (!/^[0-9a-f]{10}$/.test(shortCommit) || !commit.startsWith(shortCommit)) {
  throw new Error(`Git short SHA is not exactly the first 10 characters of HEAD: ${shortCommit}`);
}

const metadata = {
  releaseLine,
  commit,
  shortCommit,
  displayVersion: `${releaseLine}-sky.g${shortCommit}`,
};

await mkdir(distDir, { recursive: true });
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(`Build identity generated: ${metadata.displayVersion} (${metadata.commit})`);
