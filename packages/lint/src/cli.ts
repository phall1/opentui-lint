#!/usr/bin/env node
/**
 * The `opentui-lint` binary.
 *
 *   opentui-lint [paths] [--react|--solid] [--fix] [--strict] [--format json]
 *   opentui-lint init
 *   opentui-lint doctor
 *
 * The first form is the point: one `bunx opentui-lint` with no config file,
 * no ESLint install and no lint script. `init` and `doctor` are for a project
 * that wants the rules wired in permanently.
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { doctor } from "./commands/doctor.js";
import { init } from "./commands/init.js";
import { lint } from "./commands/lint.js";
import type { Format, LintOptions } from "./commands/lint.js";

const FORMATS: Format[] = ["stylish", "json", "compact"];

const USAGE = `opentui-lint — the OpenTUI mistakes TypeScript can't see

Usage
  opentui-lint [paths...] [options]   lint (paths default to .)
  opentui-lint init                   write eslint.config.mjs, a lint script and an AGENTS.md line
  opentui-lint doctor                 check that a setup actually covers its files

Options
  --react, --solid                    treat every file as this binding, skipping detection
  --framework <react|solid>           the same, as a value
  --fix                               write the safe autofixes back to disk
  --strict                            add the design-system rules to the correctness ones
  --types                             type-aware text-must-be-wrapped (needs a tsconfig)
  --format <stylish|json|compact>     stylish for people; json or compact for tools
  -h, --help                          this text
  -v, --version                       the version

Exit codes
  0  no errors
  1  errors reported (or fixed some and others remain)
  2  nothing was checked, bad arguments, or eslint is missing

Without --react or --solid, a file is checked only when it shows evidence of
OpenTUI: a @jsxImportSource pragma, an @opentui/* import, or jsxImportSource in
its nearest tsconfig.json. A run that checks no files exits 2 and says so.

  bunx opentui-lint
  bunx opentui-lint --react src
  bunx opentui-lint --solid . --fix
  bunx opentui-lint --format json > lint.json

https://github.com/phall1/opentui-lint`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  return pkg.version as string;
}

class UsageError extends Error {}

function pickFramework(values: {
  react?: boolean;
  solid?: boolean;
  framework?: string;
}): LintOptions["framework"] {
  const flags = [values.react && "react", values.solid && "solid", values.framework].filter(
    (value): value is string => typeof value === "string",
  );
  if (flags.length > 1) throw new UsageError("--react, --solid and --framework are exclusive.");
  const [framework] = flags;
  if (framework === undefined) return null;
  if (framework === "react" || framework === "solid") return framework;
  throw new UsageError(`--framework must be react or solid, not ${JSON.stringify(framework)}.`);
}

function pickFormat(value: string | undefined): Format {
  if (value === undefined) return "stylish";
  if ((FORMATS as string[]).includes(value)) return value as Format;
  throw new UsageError(
    `--format must be one of ${FORMATS.join(", ")}, not ${JSON.stringify(value)}.`,
  );
}

function parse(
  argv: string[],
): { command: "help" | "version" | "init" | "doctor" } | { command: "lint"; options: LintOptions } {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      react: { type: "boolean" },
      solid: { type: "boolean" },
      framework: { type: "string" },
      fix: { type: "boolean" },
      strict: { type: "boolean" },
      types: { type: "boolean" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) return { command: "help" };
  if (values.version) return { command: "version" };
  if (positionals[0] === "init" || positionals[0] === "doctor") return { command: positionals[0] };

  return {
    command: "lint",
    options: {
      paths: positionals.length ? positionals : ["."],
      framework: pickFramework(values),
      fix: values.fix ?? false,
      strict: values.strict ?? false,
      types: values.types ?? false,
      format: pickFormat(values.format),
    },
  };
}

async function main(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    console.error(`opentui-lint: ${(error as Error).message}\n`);
    console.error(USAGE);
    return 2;
  }

  const cwd = process.cwd();
  switch (parsed.command) {
    case "help":
      console.log(USAGE);
      return 0;
    case "version":
      console.log(version());
      return 0;
    case "init":
      return init(cwd);
    case "doctor":
      return doctor(cwd);
    case "lint":
      return lint(parsed.options, cwd);
  }
}

process.exitCode = await main(process.argv.slice(2));
