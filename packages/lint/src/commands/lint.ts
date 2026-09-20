/**
 * `opentui-lint [paths]`: lint with nothing installed and nothing configured.
 *
 * The config ESLint needs is built in memory here, so `bunx opentui-lint`
 * works in a project with no eslint.config.mjs, no lint script and no ESLint
 * of its own. ESLint and the parser arrive as peer dependencies, which bunx
 * and npx install alongside the package.
 *
 * The one thing the plugin refuses to do on its own, guess the framework, is
 * still refused here. A run that checked nothing says so and exits 2 rather
 * than printing a clean report.
 */

import { relative } from "node:path";
import type { ESLint as ESLintClass, Linter } from "eslint";
import type { Framework } from "../catalog/index.js";
import { plugin, recommended, strict } from "../plugin.js";
import { explainFramework } from "../project/framework.js";
import type { Detection } from "../project/framework.js";
import type { Node, RuleContext } from "../project/types.js";
import { inspect, runBinary } from "./project.js";

export type Format = "stylish" | "json" | "compact";

export interface LintOptions {
  paths: string[];
  /** Set from `--react` / `--solid`; `null` means per-file detection. */
  framework: Framework | null;
  fix: boolean;
  strict: boolean;
  types: boolean;
  format: Format;
}

type Results = ESLintClass.LintResult[];

/** Every extension the TypeScript parser reads; JSX may hide in any of them. */
const FILES = ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];
const IGNORES = ["**/dist/**", "**/build/**", "**/*.d.ts"];

const log = (line = "") => console.error(line);

/**
 * A rule that never reports. It records, per file, which signal decided the
 * framework, so the run can say how many files it really checked. Without it
 * a clean report is indistinguishable from one that looked at nothing.
 */
function coverageRule(seen: Map<string, Detection>) {
  return {
    meta: { type: "problem", docs: { description: "records framework detection per file" } },
    create(context: RuleContext) {
      return {
        Program(node: Node) {
          seen.set(context.filename, explainFramework(context, node));
        },
      };
    },
  };
}

function buildConfig(
  options: LintOptions,
  parser: unknown,
  seen: Map<string, Detection>,
): Linter.Config[] {
  const rules: Linter.RulesRecord = {
    ...(options.strict ? strict : recommended),
    "opentui-cli/coverage": "error",
  };
  if (options.types) rules["opentui/text-must-be-wrapped"] = ["error", { checkTypes: true }];

  return [
    { ignores: IGNORES },
    {
      files: FILES,
      languageOptions: {
        parser: parser as Linter.Parser,
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: {
          ecmaFeatures: { jsx: true },
          ...(options.types ? { projectService: true } : {}),
        },
      },
      linterOptions: { reportUnusedDisableDirectives: "off" },
      // The rules are typed against the structural slice in project/types.ts
      // rather than ESLint's own types, so ESLint and oxlint can both host
      // them. ESLint accepts the shape; only its types cannot tell.
      plugins: {
        opentui: plugin as unknown as ESLintClass.Plugin,
        "opentui-cli": { rules: { coverage: coverageRule(seen) } } as unknown as ESLintClass.Plugin,
      },
      rules,
      settings: options.framework ? { opentui: { framework: options.framework } } : {},
    },
  ];
}

interface Linting {
  ESLint: typeof ESLintClass;
  parser: unknown;
}

/**
 * Both are peer dependencies, so a normal install has them. The failure mode
 * this guards is a hand-copied `node_modules` or a package manager told to
 * skip peers, and the fix is one command either way.
 */
async function loadLinting(): Promise<Linting | null> {
  try {
    const [{ ESLint }, parser] = await Promise.all([
      import("eslint"),
      import("@typescript-eslint/parser"),
    ]);
    return { ESLint, parser: (parser as { default?: unknown }).default ?? parser };
  } catch {
    return null;
  }
}

function compact(results: Results, cwd: string): string {
  const lines: string[] = [];
  for (const result of results) {
    const file = relative(cwd, result.filePath) || result.filePath;
    for (const m of result.messages) {
      lines.push(`${file}:${m.line}:${m.column}: ${m.message} [${m.ruleId ?? "parse"}]`);
    }
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

async function print(eslint: ESLintClass, results: Results, format: Format, cwd: string) {
  const text =
    format === "compact"
      ? compact(results, cwd)
      : (await eslint.loadFormatter(format)).format(results, { cwd, rulesMeta: {} } as never);
  if (typeof text === "string" && text.length > 0)
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

/** The message a run that checked nothing prints instead of a clean report. */
function explainNothingChecked(total: number, cwd: string): void {
  const project = inspect(cwd);
  const bunx = runBinary(project.packageManager, "");
  log(`opentui-lint checked 0 of ${total} files: none gave evidence of OpenTUI.`);
  log();
  log(`  A file counts as OpenTUI when it carries a \`@jsxImportSource @opentui/react\``);
  log(`  (or @opentui/solid) pragma, imports from @opentui/react or @opentui/solid,`);
  log(`  sits under a tsconfig.json whose compilerOptions.jsxImportSource names one,`);
  log(`  or belongs to a package.json that depends on one. Otherwise every rule`);
  log(`  stays silent, so <div> in a web app is never reported.`);
  log();
  log(`  Say which binding these files render with:`);
  log();
  log(`    ${bunx} --react <paths>`);
  log(`    ${bunx} --solid <paths>`);
  if (project.framework) {
    log();
    log(`  ${project.via} here, but these paths are not under it.`);
    log(`  Pass --${project.framework} to check them anyway.`);
  }
}

function summarize(seen: Map<string, Detection>, forced: boolean, errors: number): void {
  const counts = { react: 0, solid: 0, skipped: 0 };
  for (const { framework } of seen.values()) counts[framework ?? "skipped"] += 1;
  const checked = counts.react + counts.solid;
  const bindings = [
    counts.react && `${counts.react} react`,
    counts.solid && `${counts.solid} solid`,
  ]
    .filter(Boolean)
    .join(", ");

  log(
    `opentui-lint checked ${checked} of ${seen.size} files (${bindings}): ${errors} error${errors === 1 ? "" : "s"}.`,
  );
  if (counts.skipped > 0 && !forced) {
    const files = counts.skipped === 1 ? "file had" : "files had";
    log(`  ${counts.skipped} ${files} no OpenTUI evidence and went unchecked. If they render to a`);
    log(`  terminal, pass --react or --solid to check them too.`);
  }
}

export async function lint(options: LintOptions, cwd: string): Promise<number> {
  const linting = await loadLinting();
  if (!linting) {
    log(`opentui-lint needs eslint and @typescript-eslint/parser and found neither next to it.`);
    log(`  Both are peer dependencies; bunx and npx install them with the package.`);
    log(`  In a project: bun add -d eslint @typescript-eslint/parser`);
    return 2;
  }

  const seen = new Map<string, Detection>();
  const eslint = new linting.ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: buildConfig(options, linting.parser, seen),
    fix: options.fix,
    errorOnUnmatchedPattern: false,
  });

  const results = await eslint.lintFiles(options.paths);
  if (options.fix) await linting.ESLint.outputFixes(results);

  if (results.length === 0) {
    log(
      `opentui-lint found no files in ${options.paths.map((p) => JSON.stringify(p)).join(", ")}.`,
    );
    log(`  It looks for ${FILES[0]} outside node_modules, dist and build.`);
    return 2;
  }

  const checked = [...seen.values()].filter((d) => d.framework !== null).length;
  if (checked === 0) {
    explainNothingChecked(results.length, cwd);
    return 2;
  }

  await print(eslint, results, options.format, cwd);
  const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
  summarize(seen, options.framework !== null, errors);
  return errors > 0 ? 1 : 0;
}
