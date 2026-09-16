#!/usr/bin/env node
/**
 * `opentui-lint init` and `opentui-lint doctor`.
 *
 * Two commands, both aimed at the same failure: a linter nobody finishes
 * installing, and a linter that looks installed but is checking nothing.
 * `init` removes the setup, `doctor` proves the setup worked.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { CATALOG_VERSION } from "./catalog/index.js"
import type { Framework } from "./catalog/index.js"

const CONFIG_FILE = "eslint.config.mjs"

interface Project {
  root: string
  framework: Framework | null
  /** How the framework was determined, for the report. */
  via: string
  installedOpenTui: string | null
  hasConfig: boolean
  packageManager: "bun" | "pnpm" | "yarn" | "npm"
}

function readJson(path: string): any | undefined {
  try {
    // tsconfig files are JSONC in practice; strip what JSON.parse will not take.
    const raw = readFileSync(path, "utf8")
      .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm, (m, line, block) => (line || block ? "" : m))
      .replace(/,(\s*[}\]])/g, "$1")
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function findRoot(start: string): string {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return resolve(start)
    dir = parent
  }
}

function detectPackageManager(root: string): Project["packageManager"] {
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun"
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm"
  if (existsSync(join(root, "yarn.lock"))) return "yarn"
  return "npm"
}

function inspect(cwd: string): Project {
  const root = findRoot(cwd)
  const pkg = readJson(join(root, "package.json")) ?? {}
  const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies }

  const tsconfig = readJson(join(root, "tsconfig.json"))
  const jsxImportSource: string | undefined = tsconfig?.compilerOptions?.jsxImportSource

  let framework: Framework | null = null
  let via = "nothing found"
  if (jsxImportSource?.startsWith("@opentui/react")) {
    framework = "react"
    via = "tsconfig.json jsxImportSource"
  } else if (jsxImportSource?.startsWith("@opentui/solid")) {
    framework = "solid"
    via = "tsconfig.json jsxImportSource"
  } else if (deps["@opentui/react"]) {
    framework = "react"
    via = "@opentui/react in package.json"
  } else if (deps["@opentui/solid"]) {
    framework = "solid"
    via = "@opentui/solid in package.json"
  }

  let installedOpenTui: string | null = null
  const corePkg = readJson(join(root, "node_modules", "@opentui", "core", "package.json"))
  if (corePkg?.version) installedOpenTui = corePkg.version

  return {
    root,
    framework,
    via,
    installedOpenTui,
    hasConfig: existsSync(join(root, CONFIG_FILE)),
    packageManager: detectPackageManager(root),
  }
}

function configSource(framework: Framework | null): string {
  const settings = framework
    ? `\n    // Detection also works from tsconfig, a pragma, or an @opentui/* import;\n` +
      `    // this is here so a file with none of those is still covered.\n` +
      `    settings: { opentui: { framework: ${JSON.stringify(framework)} } },`
    : ""
  return `import tsParser from "@typescript-eslint/parser"
import { plugin as opentui, recommended } from "opentui-lint"

export default [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { opentui },
    // \`recommended\` is crashes and silently-wrong renders only.
    // Swap for \`strict\` to add the terminal design-system rules.
    rules: recommended,${settings}
  },
]
`
}

const AGENTS_LINE = "After changing any TUI code, run `npm run lint` and fix every error."

function init(cwd: string): number {
  const project = inspect(cwd)
  const run = project.packageManager === "npm" ? "npm run" : project.packageManager === "bun" ? "bun run" : project.packageManager
  console.log(`opentui-lint init — ${project.root}\n`)

  if (project.framework) {
    console.log(`  framework   ${project.framework}  (${project.via})`)
  } else {
    console.log(`  framework   not detected`)
    console.log(`              No @opentui/react or @opentui/solid found. Install one first,`)
    console.log(`              or the rules will stay silent on every file — by design.`)
  }
  console.log(`  manager     ${project.packageManager}`)

  if (project.hasConfig) {
    console.log(`\n  ${CONFIG_FILE} already exists — not overwriting it.`)
    console.log(`  Add these three lines to the config object for your TUI files:\n`)
    console.log(`    import { plugin as opentui, recommended } from "opentui-lint"`)
    console.log(`    plugins: { opentui },`)
    console.log(`    rules: recommended,`)
  } else {
    writeFileSync(join(project.root, CONFIG_FILE), configSource(project.framework))
    console.log(`\n  wrote ${CONFIG_FILE}`)
  }

  // A lint script is what an agent will actually run, so it matters more than
  // the config file.
  const pkgPath = join(project.root, "package.json")
  const pkg = readJson(pkgPath)
  if (pkg && !pkg.scripts?.lint) {
    pkg.scripts = { ...pkg.scripts, lint: "eslint ." }
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    console.log(`  added "lint" script to package.json`)
  }

  const agentsPath = join(project.root, "AGENTS.md")
  const hadAgents = existsSync(agentsPath)
  const agents = hadAgents ? readFileSync(agentsPath, "utf8") : ""
  if (!agents.includes("run `npm run lint`") && !agents.includes("opentui-lint")) {
    writeFileSync(agentsPath, `${agents}${agents && !agents.endsWith("\n") ? "\n" : ""}\n${AGENTS_LINE}\n`)
    console.log(`  ${hadAgents ? "appended to" : "created"} AGENTS.md`)
  }

  console.log(`\nNext:`)
  console.log(`  ${project.packageManager === "npm" ? "npm i" : `${project.packageManager} add`} -D eslint @typescript-eslint/parser`)
  console.log(`  ${run} lint`)
  console.log(`  npx opentui-lint doctor    # confirm it is actually checking your files`)
  return 0
}

const ok = (label: string, detail: string) => console.log(`  ok    ${label.padEnd(14)} ${detail}`)

function doctor(cwd: string): number {
  const project = inspect(cwd)
  console.log(`opentui-lint doctor — ${project.root}\n`)

  let problems = 0
  const warn = (label: string, detail: string) => {
    problems += 1
    console.log(`  warn  ${label.padEnd(14)} ${detail}`)
  }

  if (project.framework) ok("framework", `${project.framework} (${project.via})`)
  else {
    warn("framework", "not detected — every rule will stay silent")
    console.log(`        ${" ".repeat(14)} Set compilerOptions.jsxImportSource in tsconfig.json,`)
    console.log(`        ${" ".repeat(14)} or settings.opentui.framework in ${CONFIG_FILE}.`)
  }

  if (!project.installedOpenTui) {
    warn("opentui", "@opentui/core not installed here — cannot compare versions")
  } else if (project.installedOpenTui === CATALOG_VERSION) {
    ok("opentui", `${project.installedOpenTui} matches the catalog`)
  } else {
    // The single most likely source of a wrong diagnostic, so it is called out
    // loudly rather than left for someone to discover from a false positive.
    warn(
      "opentui",
      `installed ${project.installedOpenTui}, catalog built from ${CATALOG_VERSION}`,
    )
    console.log(`        ${" ".repeat(14)} Elements or props added since ${CATALOG_VERSION} may be reported`)
    console.log(`        ${" ".repeat(14)} as unknown. Upgrade opentui-lint, or add the names to the`)
    console.log(`        ${" ".repeat(14)} rule's \`allow\` option until a release catches up.`)
  }

  if (project.hasConfig) ok("config", CONFIG_FILE)
  else warn("config", `no ${CONFIG_FILE} — run \`npx opentui-lint init\``)

  const pkg = readJson(join(project.root, "package.json"))
  if (pkg?.scripts?.lint) ok("lint script", pkg.scripts.lint)
  else warn("lint script", "none — agents will not know how to check their work")

  const agentsPath = join(project.root, "AGENTS.md")
  if (existsSync(agentsPath) && /opentui-lint|run `npm run lint`/.test(readFileSync(agentsPath, "utf8"))) {
    ok("AGENTS.md", "instructs agents to run the linter")
  } else {
    warn("AGENTS.md", "does not tell agents to run the linter")
  }

  console.log(
    problems === 0
      ? `\nAll good. ${relative(process.cwd(), project.root) || "."} is covered.`
      : `\n${problems} thing${problems === 1 ? "" : "s"} to fix. A clean lint run means nothing until these are resolved.`,
  )
  return problems === 0 ? 0 : 1
}

function usage(): number {
  console.log(`opentui-lint — the OpenTUI mistakes TypeScript can't see

  opentui-lint init      set up ESLint with the recommended rules
  opentui-lint doctor    check that the setup actually covers your files

https://github.com/phall1/opentui-lint`)
  return 0
}

const command = process.argv[2]
const cwd = process.cwd()
process.exit(
  command === "init" ? init(cwd)
  : command === "doctor" ? doctor(cwd)
  : usage(),
)
