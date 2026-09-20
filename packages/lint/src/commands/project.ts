/**
 * What the CLI can learn about a project from disk alone: where its root is,
 * which binding it depends on, which package manager it uses, and whether it
 * has a theme the design-system rules would read.
 *
 * `init`, `doctor` and the lint command's "nothing was checked" hint all read
 * the same picture, so it lives in one place.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Framework } from "../catalog/index.js";
import { readThemeTokens } from "../project/design-system.js";

export const CONFIG_FILE = "eslint.config.mjs";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export interface Project {
  root: string;
  framework: Framework | null;
  /** How the framework was determined, for the report. */
  via: string;
  /** A workspace package that declares a binding when the root does not. */
  workspaceFramework: { framework: Framework; manifest: string } | null;
  installedOpenTui: string | null;
  hasConfig: boolean;
  packageManager: PackageManager;
  theme: { file: string; density: number; colors: number; glyphs: number } | null;
}

export function readJson(path: string): any | undefined {
  try {
    // tsconfig files are JSONC in practice; strip what JSON.parse will not take.
    const raw = readFileSync(path, "utf8")
      .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm, (m, line, block) =>
        line || block ? "" : m,
      )
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function findRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

/** `bun run lint`, `npm run lint`, `pnpm lint`: what a script invocation looks like here. */
export function runScript(manager: PackageManager, script: string): string {
  return manager === "npm" || manager === "bun"
    ? `${manager} run ${script}`
    : `${manager} ${script}`;
}

/** `bunx opentui-lint`, `npx opentui-lint`: the no-install way to run the CLI here. */
export function runBinary(manager: PackageManager, args: string): string {
  const runner = manager === "bun" ? "bunx" : manager === "pnpm" ? "pnpm dlx" : "npx";
  return `${runner} opentui-lint ${args}`.trim();
}

function frameworkFromDeps(deps: Record<string, string>): Framework | null {
  if (deps["@opentui/react"]) return "react";
  if (deps["@opentui/solid"]) return "solid";
  return null;
}

function frameworkFromProject(
  root: string,
  deps: Record<string, string>,
): Pick<Project, "framework" | "via"> {
  const tsconfig = readJson(join(root, "tsconfig.json"));
  const jsxImportSource: string | undefined = tsconfig?.compilerOptions?.jsxImportSource;

  if (jsxImportSource?.startsWith("@opentui/react")) {
    return { framework: "react", via: "tsconfig.json jsxImportSource" };
  }
  if (jsxImportSource?.startsWith("@opentui/solid")) {
    return { framework: "solid", via: "tsconfig.json jsxImportSource" };
  }
  const declared = frameworkFromDeps(deps);
  if (declared) return { framework: declared, via: `@opentui/${declared} in package.json` };
  return { framework: null, via: "nothing found" };
}

/** Directories a workspace scan never descends into. */
const WORKSPACE_SKIP = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".cache",
  "coverage",
  "out",
  ".next",
  ".turbo",
  ".output",
]);

/**
 * Every nested `package.json` that is a package boundary. Order does not
 * matter — the question is only which binding some sibling package declares.
 * A directory with a manifest is a package and is not descended into, so a
 * package's own source and test fixtures are not mistaken for more packages.
 */
function workspaceManifests(root: string, depth = 3): string[] {
  const found: string[] = [];
  const visit = (dir: string, remaining: number): void => {
    if (remaining < 0) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (dir !== root && entries.some((e) => e.isFile() && e.name === "package.json")) {
      found.push(join(dir, "package.json"));
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !WORKSPACE_SKIP.has(entry.name)) {
        visit(join(dir, entry.name), remaining - 1);
      }
    }
  };
  visit(root, depth);
  return found.toSorted();
}

/**
 * A monorepo root often declares no binding at all — the dependency lives in
 * the workspace package. The zero-config run detects each file through its own
 * package, so `init` and `doctor` have to look there too or they would call a
 * fully covered repo uncovered.
 */
function findWorkspaceFramework(root: string): Project["workspaceFramework"] {
  for (const manifest of workspaceManifests(root)) {
    const pkg = readJson(manifest) ?? {};
    const framework = frameworkFromDeps({ ...pkg.dependencies, ...pkg.devDependencies });
    if (framework) return { framework, manifest: relative(root, manifest) };
  }
  return null;
}

export function inspect(cwd: string, options: { workspaces?: boolean } = {}): Project {
  const root = findRoot(cwd);
  const pkg = readJson(join(root, "package.json")) ?? {};
  const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

  const corePkg = readJson(join(root, "node_modules", "@opentui", "core", "package.json"));

  return {
    root,
    ...frameworkFromProject(root, deps),
    // The scan is only worth it for `init` and `doctor`, which report on the
    // whole repo; a lint run reaches it only when it has already checked
    // nothing and is about to explain why.
    workspaceFramework: options.workspaces ? findWorkspaceFramework(root) : null,
    installedOpenTui: corePkg?.version ?? null,
    hasConfig: existsSync(join(root, CONFIG_FILE)),
    packageManager: detectPackageManager(root),
    theme: findTheme(root),
  };
}

/** Mirrors the discovery the design-system rules do, so `doctor` agrees with them. */
function findTheme(root: string): Project["theme"] {
  for (const dir of ["components/ui", "src/components/ui", "app/components/ui"]) {
    for (const base of ["theme.ts", "theme.tsx"]) {
      const file = join(root, dir, base);
      if (!existsSync(file)) continue;
      const tokens = readThemeTokens(readFileSync(file, "utf8"));
      return {
        file: join(dir, base),
        density: Object.keys(tokens.density).length,
        colors: Object.keys(tokens.colors).length,
        glyphs: Object.keys(tokens.glyphs).length,
      };
    }
  }
  return null;
}
