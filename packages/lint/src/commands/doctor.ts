/**
 * `opentui-lint doctor`: proves a setup is checking something. A linter that
 * looks installed but covers no files is the failure this exists for, because
 * its clean run is indistinguishable from a real one.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CATALOG_VERSION } from "../catalog/index.js";
import { CONFIG_FILE, inspect, readJson, runBinary } from "./project.js";
import type { Project } from "./project.js";

const PAD = " ".repeat(14);
const ok = (label: string, detail: string) => console.log(`  ok    ${label.padEnd(14)} ${detail}`);
const info = (label: string, detail: string) =>
  console.log(`  info  ${label.padEnd(14)} ${detail}`);
const more = (line: string) => console.log(`        ${PAD} ${line}`);

type Warn = (label: string, detail: string) => void;

function checkOpenTui(project: Project, warn: Warn): void {
  if (!project.installedOpenTui) {
    warn("opentui", "@opentui/core not installed here — cannot compare versions");
    return;
  }
  if (project.installedOpenTui === CATALOG_VERSION) {
    ok("opentui", `${project.installedOpenTui} matches the catalog`);
    return;
  }
  // The single most likely source of a wrong diagnostic, so it is called out
  // loudly rather than left for someone to discover from a false positive.
  warn("opentui", `installed ${project.installedOpenTui}, catalog built from ${CATALOG_VERSION}`);
  more(`Elements or props added since ${CATALOG_VERSION} may be reported`);
  more(`as unknown. Upgrade opentui-lint, or add the names to the`);
  more(`rule's \`allow\` option until a release catches up.`);
}

function checkTheme(project: Project): void {
  if (!project.theme) {
    info("theme", "none found — the design-system rules stay silent");
    more("Only relevant if you use the `strict` preset.");
    return;
  }
  const { file, density, glyphs, colors } = project.theme;
  ok("theme", `${file} — ${density} density, ${glyphs} glyph, ${colors} literal color tokens`);
  if (colors === 0) {
    // Not a fault: a default tuiparts theme is ANSI-indexed, and those values
    // only exist once a terminal resolves its palette. But it does change what
    // use-theme-tokens can say, so it should not come as a surprise later.
    more("No literal colors, so the theme is terminal-palette based.");
    more("use-theme-tokens can flag raw colors but cannot name a token.");
  }
}

function agentsMentionLinter(root: string): boolean {
  const agentsPath = join(root, "AGENTS.md");
  return (
    existsSync(agentsPath) &&
    /opentui-lint|run `npm run lint`/.test(readFileSync(agentsPath, "utf8"))
  );
}

export function doctor(cwd: string): number {
  const project = inspect(cwd);
  const bunx = runBinary(project.packageManager, "");
  console.log(`opentui-lint doctor — ${project.root}\n`);

  let problems = 0;
  const warn: Warn = (label, detail) => {
    problems += 1;
    console.log(`  warn  ${label.padEnd(14)} ${detail}`);
  };

  if (project.framework) ok("framework", `${project.framework} (${project.via})`);
  else {
    warn("framework", "not detected — every rule will stay silent");
    more("Set compilerOptions.jsxImportSource in tsconfig.json, pass");
    more(`--react or --solid to \`${bunx}\`, or set settings.opentui.framework`);
    more(`in ${CONFIG_FILE}.`);
  }

  checkOpenTui(project, warn);

  if (project.hasConfig) ok("config", CONFIG_FILE);
  else {
    info("config", `no ${CONFIG_FILE} — \`${bunx}\` needs none`);
    more(`Run \`${runBinary(project.packageManager, "init")}\` to wire ESLint permanently.`);
  }

  checkTheme(project);

  const pkg = readJson(join(project.root, "package.json"));
  if (pkg?.scripts?.lint) ok("lint script", pkg.scripts.lint);
  else info("lint script", `none — agents can run \`${bunx}\` directly`);

  if (agentsMentionLinter(project.root)) ok("AGENTS.md", "instructs agents to run the linter");
  else warn("AGENTS.md", "does not tell agents to run the linter");

  console.log(
    problems === 0
      ? `\nAll good. ${relative(process.cwd(), project.root) || "."} is covered.`
      : `\n${problems} thing${problems === 1 ? "" : "s"} to fix. A clean lint run means nothing until these are resolved.`,
  );
  return problems === 0 ? 0 : 1;
}
