/**
 * Clones a pinned `CorpusSource` into a persistent, keyed cache directory so
 * repeat runs (`bun test`, `bun run report`) do not re-clone every time.
 *
 * Unlike `packages/lint/scripts/sync-catalog.ts` — which deliberately uses a
 * throwaway `mkdtemp` removed on every exit, because it installs a full
 * `node_modules` it never needs again — this package clones source trees it
 * expects to re-read on every run in a tight loop while triaging findings.
 * The cache key is the repo name plus the pinned ref, so bumping a pin in
 * `src/pins.ts` fetches fresh rather than silently reusing stale source.
 */

import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { CorpusSource } from "./pins.js";

/** Overridable so CI can point this at an `actions/cache`-restored directory. */
const CACHE_ROOT = process.env.CORPUS_CACHE_DIR ?? join(import.meta.dir, "..", ".cache");

function repoDir(source: CorpusSource): string {
  return join(CACHE_ROOT, `${source.name}-${source.ref}`);
}

function run(command: string[], cwd: string): void {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(
      `\`${command.join(" ")}\` (cwd ${cwd}) exited ${result.exitCode}\n${result.stderr.toString()}`,
    );
  }
}

/**
 * Returns the checked-out working directory for `source`, cloning it first if
 * the cache does not already hold it at this exact ref.
 *
 * Both a tag and a bare commit SHA go through the same `fetch --depth 1
 * origin <ref>` + `checkout FETCH_HEAD` path: GitHub serves shallow fetches by
 * commit SHA for public repos, so there is no need for a full clone even when
 * the pin (tuiparts') is a commit rather than a release tag.
 */
export async function ensureRepo(source: CorpusSource): Promise<string> {
  const dir = repoDir(source);
  const marker = join(dir, ".corpus-fetched");
  if (existsSync(marker)) return dir;

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  run(["git", "init", "-q"], dir);
  run(["git", "remote", "add", "origin", source.repo], dir);
  run(["git", "fetch", "--depth", "1", "origin", source.ref], dir);
  run(["git", "checkout", "-q", "FETCH_HEAD"], dir);

  await Bun.write(marker, `${new Date().toISOString()}\n`);
  return dir;
}
