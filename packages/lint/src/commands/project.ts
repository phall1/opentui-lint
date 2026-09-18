/**
 * What the CLI can learn about a project from disk alone: where its root is,
 * which binding it depends on, which package manager it uses, and whether it
 * has a theme the design-system rules would read.
 *
 * `init`, `doctor` and the lint command's "nothing was checked" hint all read
 * the same picture, so it lives in one place.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Framework } from "../catalog/index.js";
import { readThemeTokens } from "../project/design-system.js";

export const CONFIG_FILE = "eslint.config.mjs";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export interface Project {
  root: string;
  framework: Framework | null;
  /** How the framework was determined, for the report. */
  via: string;
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
  if (deps["@opentui/react"]) return { framework: "react", via: "@opentui/react in package.json" };
  if (deps["@opentui/solid"]) return { framework: "solid", via: "@opentui/solid in package.json" };
  return { framework: null, via: "nothing found" };
}

export function inspect(cwd: string): Project {
  const root = findRoot(cwd);
  const pkg = readJson(join(root, "package.json")) ?? {};
  const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

  const corePkg = readJson(join(root, "node_modules", "@opentui", "core", "package.json"));

  return {
    root,
    ...frameworkFromProject(root, deps),
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
