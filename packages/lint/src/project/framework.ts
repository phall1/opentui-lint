import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Framework } from "../catalog/index.js";
import type { Node, RuleContext } from "./types.js";

/**
 * Deciding whether a file renders to a terminal is the whole safety story for
 * this plugin. `<div>` is correct in a web app and fatal in an OpenTUI app, and
 * the two live side by side in the same repo all the time — an OpenTUI CLI with
 * a Next.js dashboard, or a React app that embeds a terminal pane.
 *
 * So every rule stays silent unless the file gives positive evidence that its
 * JSX is compiled by an OpenTUI runtime. We never guess from the presence of
 * JSX alone.
 */

const REACT_PKG = /^@opentui\/react(\/|$)/;
const SOLID_PKG = /^@opentui\/solid(\/|$)/;
const PRAGMA = /@jsxImportSource\s+(\S+)/;

/** tsconfig lookups are hot and the answer never changes within a run. */
const tsconfigCache = new Map<string, Framework | null>();

function frameworkFromSpecifier(specifier: string): Framework | null {
  if (REACT_PKG.test(specifier)) return "react";
  if (SOLID_PKG.test(specifier)) return "solid";
  return null;
}

/** Strips comments and trailing commas so `JSON.parse` can read a tsconfig. */
function parseJsonc(text: string): unknown {
  const stripped = text
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm, (match, line, block) =>
      line || block ? "" : match,
    )
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(stripped);
  } catch {
    return undefined;
  }
}

function readJsxImportSource(configPath: string, seen: Set<string>): string | undefined {
  if (seen.has(configPath) || !existsSync(configPath)) return undefined;
  seen.add(configPath);

  const config = parseJsonc(readFileSync(configPath, "utf8")) as
    | { compilerOptions?: { jsxImportSource?: string }; extends?: string | string[] }
    | undefined;
  if (!config) return undefined;

  const own = config.compilerOptions?.jsxImportSource;
  if (own) return own;

  // A monorepo's `tsconfig.base.json` usually holds the real jsxImportSource.
  const parents = typeof config.extends === "string" ? [config.extends] : (config.extends ?? []);
  for (const parent of parents) {
    const candidate = parent.startsWith(".")
      ? resolve(dirname(configPath), parent)
      : resolve(dirname(configPath), "node_modules", parent);
    const resolved = candidate.endsWith(".json") ? candidate : `${candidate}.json`;
    const found = readJsxImportSource(resolved, seen);
    if (found) return found;
  }
  return undefined;
}

/**
 * Walks up from the file to the nearest tsconfig/jsconfig and reads
 * `compilerOptions.jsxImportSource`, which is how most OpenTUI projects are
 * wired — the framework is configured once and never mentioned again in the
 * component files themselves.
 *
 * The walk deliberately does not stop at a `package.json`. A workspace package
 * frequently has no tsconfig of its own and inherits the repo root's, and
 * stopping early there meant every rule went silent across a whole package —
 * the worst possible failure for a linter, because it looks like a clean run.
 * Nearest-config-wins is also how `tsc` itself resolves, so a web package that
 * needs different settings still gets them from its own tsconfig.
 */
function frameworkFromTsconfig(filename: string): Framework | null {
  let dir = dirname(resolve(filename));
  const visited: string[] = [];

  for (;;) {
    const cached = tsconfigCache.get(dir);
    if (cached !== undefined) {
      for (const seen of visited) tsconfigCache.set(seen, cached);
      return cached;
    }
    visited.push(dir);

    for (const name of ["tsconfig.json", "jsconfig.json"]) {
      const source = readJsxImportSource(join(dir, name), new Set());
      const framework = source ? frameworkFromSpecifier(source) : null;
      if (framework) {
        for (const seen of visited) tsconfigCache.set(seen, framework);
        return framework;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const seen of visited) tsconfigCache.set(seen, null);
  return null;
}

function frameworkFromPragma(context: RuleContext): Framework | null {
  // The pragma must precede the code, so only leading comments count.
  for (const comment of context.sourceCode.getAllComments?.() ?? []) {
    const match = PRAGMA.exec(comment.value);
    if (match) {
      const framework = frameworkFromSpecifier(match[1]!);
      if (framework) return framework;
    }
  }
  return null;
}

function frameworkFromImports(program: Node): Framework | null {
  for (const statement of (program.body ?? []) as Node[]) {
    const specifier =
      statement.type === "ImportDeclaration" || statement.type === "ExportNamedDeclaration"
        ? statement.source?.value
        : undefined;
    if (typeof specifier !== "string") continue;
    const framework = frameworkFromSpecifier(specifier);
    if (framework) return framework;
  }
  return null;
}

export interface OpenTuiSettings {
  /** Skip detection and treat every linted file as this framework. */
  framework?: Framework;
  /** Appended to every diagnostic — a pointer to your own house rules. */
  note?: string;
  /** Element names registered at runtime with `extend()`. */
  extendedElements?: string[];
}

export function readSettings(context: RuleContext): OpenTuiSettings {
  const settings = context.settings?.["opentui"];
  return (settings && typeof settings === "object" ? settings : {}) as OpenTuiSettings;
}

export type DetectionSignal = "settings" | "pragma" | "import" | "tsconfig" | "none";

export interface Detection {
  framework: Framework | null;
  /** Which signal decided it — surfaced by `opentui-lint doctor`. */
  via: DetectionSignal;
}

/**
 * Resolves the OpenTUI framework for one file, reporting which signal decided.
 *
 * The signal matters as much as the answer: a file that resolves to `null` is
 * silently exempt from every rule, and without a way to see *why*, a clean run
 * is indistinguishable from a run that checked nothing.
 */
export function explainFramework(context: RuleContext, program: Node): Detection {
  const configured = readSettings(context).framework;
  if (configured) return { framework: configured, via: "settings" };

  const pragma = frameworkFromPragma(context);
  if (pragma) return { framework: pragma, via: "pragma" };

  const imported = frameworkFromImports(program);
  if (imported) return { framework: imported, via: "import" };

  const config = frameworkFromTsconfig(context.filename);
  if (config) return { framework: config, via: "tsconfig" };

  return { framework: null, via: "none" };
}

/**
 * Resolves the OpenTUI framework for one file, or `null` when the file has no
 * OpenTUI evidence at all and every rule should stand down.
 */
export function detectFramework(context: RuleContext, program: Node): Framework | null {
  return explainFramework(context, program).framework;
}

/** Exposed so tests can reset the per-directory tsconfig memoization. */
export function clearFrameworkCache(): void {
  tsconfigCache.clear();
}
