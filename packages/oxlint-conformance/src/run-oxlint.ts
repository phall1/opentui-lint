import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The whole point of this package: shell out to the real `oxlint` binary
 * rather than the ESLint `Linter` class the other conformance packages use.
 * ESLint's `Linter.verify()` and oxlint's JS plugin runtime are two different
 * programs consuming the same rule objects, and only one of them is the one
 * OpenTUI itself runs — a mock of oxlint's behavior would just be testing our
 * own assumptions about it.
 *
 * `Bun.resolveSync` walks node_modules the same way `require` would, so this
 * finds the binary whether bun hoisted `oxlint` to the workspace root (the
 * common case) or installed it locally in this package.
 */
const OXLINT_PACKAGE_JSON = Bun.resolveSync("oxlint/package.json", import.meta.dir);
export const OXLINT_BIN = join(dirname(OXLINT_PACKAGE_JSON), "bin", "oxlint");

/** The plugin entry this whole package exists to exercise — see AGENTS.md. */
export const PLUGIN_ENTRY = join(import.meta.dir, "..", "..", "lint", "dist", "index.js");

export interface OxlintDiagnostic {
  message: string;
  /** `"<plugin-name>(<rule-name>)"`, e.g. `"opentui-lint(no-unknown-elements)"`. */
  code: string;
  severity: string;
  filename: string;
}

interface OxlintReport {
  diagnostics: OxlintDiagnostic[];
}

/**
 * Every fixture directory also gets linted by oxlint's own default rule set
 * (`no-unused-vars` and friends), which is noise for these tests: they exist
 * to check what *our* plugin reports, not to keep fixtures spotless by some
 * other linter's standards. Filtering on the code prefix is more robust than
 * trying to silence every default rule in every config, and it is exactly
 * what a consumer's own tooling would filter on too.
 */
function ownDiagnostics(report: OxlintReport): OxlintDiagnostic[] {
  return report.diagnostics.filter((d) => d.code.startsWith("opentui-lint("));
}

/**
 * Runs the real oxlint binary against `paths` under `configPath` and returns
 * only this plugin's diagnostics.
 *
 * oxlint exits 1 when it finds any diagnostic (ours or its own defaults), so
 * the exit code is not a useful success signal here — only the parsed JSON is.
 */
export async function runOxlint(
  configPath: string,
  paths: string[],
  extraArgs: string[] = [],
): Promise<OxlintDiagnostic[]> {
  const proc = Bun.spawn([OXLINT_BIN, "-c", configPath, "-f", "json", ...extraArgs, ...paths], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  let report: OxlintReport;
  try {
    report = JSON.parse(stdout) as OxlintReport;
  } catch (cause) {
    throw new Error(`oxlint did not print valid JSON.\nstdout:\n${stdout}\nstderr:\n${stderr}`, {
      cause,
    });
  }
  return ownDiagnostics(report);
}

/**
 * Writes an oxlintrc to a throwaway directory and hands back its path.
 *
 * A fresh temp dir per config — rather than one shared scratch file — means
 * parallel `bun test` workers never race each other writing the same path.
 */
export async function withOxlintConfig<T>(
  config: object,
  run: (configPath: string) => T | Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "oxlint-conformance-"));
  const configPath = join(dir, ".oxlintrc.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  try {
    // `run` spawns oxlint asynchronously, so the temp dir must survive until
    // that finishes — awaiting here (rather than returning the bare promise)
    // is what keeps `finally` from deleting the config out from under it.
    return await run(configPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Config that turns on every rule the plugin currently exports, by name. */
export function allRulesConfig(
  ruleNames: readonly string[],
  settings?: Record<string, unknown>,
): object {
  const rules: Record<string, "error"> = {};
  for (const name of ruleNames) rules[`opentui-lint/${name}`] = "error";
  return {
    jsPlugins: [PLUGIN_ENTRY],
    ...(settings ? { settings } : {}),
    rules,
  };
}
