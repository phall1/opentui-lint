/**
 * `opentui-lint init`: the permanent ESLint setup, for a project that wants
 * the rules in its editor and its own `lint` script rather than through
 * `bunx opentui-lint` each time.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Framework } from "../catalog/index.js";
import { CONFIG_FILE, inspect, readJson, runBinary, runScript } from "./project.js";

function configSource(framework: Framework | null): string {
  const settings = framework
    ? `\n    // Detection also works from tsconfig, a pragma, or an @opentui/* import;\n` +
      `    // this is here so a file with none of those is still covered.\n` +
      `    settings: { opentui: { framework: ${JSON.stringify(framework)} } },`
    : "";
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
`;
}

/** The sentence `doctor` looks for; "opentui-lint" is the part it matches on. */
export function agentsLine(run: string): string {
  return `After changing any TUI code, run \`${run}\` (opentui-lint) and fix every error.`;
}

export function init(cwd: string): number {
  const project = inspect(cwd);
  const run = runScript(project.packageManager, "lint");
  console.log(`opentui-lint init — ${project.root}\n`);

  if (project.framework) {
    console.log(`  framework   ${project.framework}  (${project.via})`);
  } else {
    console.log(`  framework   not detected`);
    console.log(`              No @opentui/react or @opentui/solid found. Install one first,`);
    console.log(`              or the rules will stay silent on every file — by design.`);
  }
  console.log(`  manager     ${project.packageManager}`);

  if (project.hasConfig) {
    console.log(`\n  ${CONFIG_FILE} already exists — not overwriting it.`);
    console.log(`  Add these three lines to the config object for your TUI files:\n`);
    console.log(`    import { plugin as opentui, recommended } from "opentui-lint"`);
    console.log(`    plugins: { opentui },`);
    console.log(`    rules: recommended,`);
  } else {
    writeFileSync(join(project.root, CONFIG_FILE), configSource(project.framework));
    console.log(`\n  wrote ${CONFIG_FILE}`);
  }

  // A lint script is what an agent will actually run, so it matters more than
  // the config file.
  const pkgPath = join(project.root, "package.json");
  const pkg = readJson(pkgPath);
  if (pkg && !pkg.scripts?.lint) {
    pkg.scripts = { ...pkg.scripts, lint: "eslint ." };
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`  added "lint" script to package.json`);
  }

  const agentsPath = join(project.root, "AGENTS.md");
  const hadAgents = existsSync(agentsPath);
  const agents = hadAgents ? readFileSync(agentsPath, "utf8") : "";
  if (!agents.includes("opentui-lint")) {
    writeFileSync(
      agentsPath,
      `${agents}${agents && !agents.endsWith("\n") ? "\n" : ""}\n${agentsLine(run)}\n`,
    );
    console.log(`  ${hadAgents ? "appended to" : "created"} AGENTS.md`);
  }

  const add = project.packageManager === "npm" ? "npm i -D" : `${project.packageManager} add -D`;
  console.log(`\nNext:`);
  console.log(`  ${add} opentui-lint    # brings eslint and @typescript-eslint/parser with it`);
  console.log(`  ${run}`);
  console.log(
    `  ${runBinary(project.packageManager, "doctor")}    # confirm it is actually checking your files`,
  );
  return 0;
}
