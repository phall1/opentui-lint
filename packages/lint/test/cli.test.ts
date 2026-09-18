import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The CLI's promise is `bunx opentui-lint` with nothing installed and nothing
 * configured, so these run the real entry point as a subprocess against a
 * fixture that has no eslint.config.mjs, no lint script and a tsconfig with
 * no jsxImportSource. Only `src/Import.tsx` carries evidence of OpenTUI.
 */
const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const FIXTURE = join(import.meta.dir, "fixtures", "cli-app");
const EXAMPLES = join(import.meta.dir, "..", "..", "..", "examples");

function run(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(["bun", CLI, ...args], { cwd, stdin: "ignore" });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** Total diagnostics in a `--format json` report. */
function count(stdout: string): number {
  return (JSON.parse(stdout) as { messages: unknown[] }[]).reduce(
    (n, r) => n + r.messages.length,
    0,
  );
}

/** A throwaway copy, so `--fix` can write without touching the fixture. */
function scratchCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "opentui-lint-cli-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

describe("opentui-lint (lint)", () => {
  test("without a flag, checks the file with evidence and says what it skipped", () => {
    const { code, stdout, stderr } = run(FIXTURE, "src");
    expect(code).toBe(1);
    expect(stdout).toContain("Import.tsx");
    expect(stdout).toContain("opentui/no-unknown-elements");
    expect(stdout).not.toContain("Plain.tsx");
    expect(stderr).toContain("checked 1 of 2 files (1 solid): 2 errors.");
    expect(stderr).toContain("1 file had no OpenTUI evidence");
    expect(stderr).toContain("pass --react or --solid");
  });

  test("a run that checks nothing exits 2 and says how to pick a binding", () => {
    const { code, stdout, stderr } = run(FIXTURE, "web");
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("checked 0 of 1 files: none gave evidence of OpenTUI");
    expect(stderr).toContain("--react <paths>");
    expect(stderr).toContain("--solid <paths>");
    // The package.json names the binding, so the hint names the flag.
    expect(stderr).toContain("@opentui/solid in package.json here, so probably --solid.");
  });

  test("--solid covers every file and --format json is ESLint's shape", () => {
    const { code, stdout, stderr } = run(FIXTURE, "--solid", "src", "--format", "json");
    expect(code).toBe(1);
    const results = JSON.parse(stdout) as Array<{
      filePath: string;
      messages: { ruleId: string }[];
    }>;
    const byFile = Object.fromEntries(
      results.map((r) => [r.filePath.split("/").pop(), r.messages.map((m) => m.ruleId)]),
    );
    expect(byFile).toEqual({
      "Import.tsx": ["opentui/no-unknown-elements", "opentui/text-must-be-wrapped"],
      "Plain.tsx": [
        "opentui/text-must-be-wrapped",
        "opentui/no-unknown-elements",
        "opentui/text-must-be-wrapped",
      ],
    });
    expect(stderr).toContain("checked 2 of 2 files (2 solid): 5 errors.");
    expect(stderr).not.toContain("no OpenTUI evidence");
  });

  test("--format compact is one greppable line per diagnostic", () => {
    const { stdout } = run(FIXTURE, "--solid", "src/Import.tsx", "--format", "compact");
    const lines = stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^src\/Import\.tsx:2:29: <div> is an HTML element .* \[opentui\/no-unknown-elements\]$/,
    );
  });

  test("--fix writes the safe fixes and a fully fixed run exits 0", () => {
    const dir = scratchCopy();
    try {
      const { code, stderr } = run(dir, "--solid", "src/Import.tsx", "--fix");
      expect(code).toBe(0);
      expect(stderr).toContain("checked 1 of 1 files (1 solid): 0 errors.");
      expect(readFileSync(join(dir, "src", "Import.tsx"), "utf8")).toContain(
        "<box><text>hi</text></box>",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--strict on the examples reports the numbers the READMEs promise", () => {
    const react = run(
      join(EXAMPLES, "dashboard-react"),
      "dashboard.tsx",
      "--strict",
      "--format",
      "json",
    );
    const solid = run(
      join(EXAMPLES, "dashboard-solid"),
      "dashboard.tsx",
      "--strict",
      "--format",
      "json",
    );
    expect(count(react.stdout)).toBe(15);
    expect(count(solid.stdout)).toBe(14);
  });

  test("no matching files exits 2 rather than reporting a clean run", () => {
    const dir = mkdtempSync(join(tmpdir(), "opentui-lint-empty-"));
    try {
      const { code, stderr } = run(dir);
      expect(code).toBe(2);
      expect(stderr).toContain('found no files in "."');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("with no arguments and no config file, lints . instead of printing init help", () => {
    expect(existsSync(join(FIXTURE, "eslint.config.mjs"))).toBe(false);
    const { code, stdout, stderr } = run(FIXTURE);
    expect(code).toBe(1);
    expect(stdout).toContain("Import.tsx");
    expect(stdout).toContain("opentui/no-unknown-elements");
    expect(stderr).toContain("checked 1 of 3 files (1 solid): 2 errors.");
    expect(stdout).not.toContain("Usage");
    expect(stderr).not.toContain("opentui-lint init");
  });

  test("a present eslint.config.mjs is optional and is not loaded", () => {
    const dir = scratchCopy();
    try {
      // If the CLI started using this file, every path would be ignored and
      // the run would exit 2 with nothing checked.
      writeFileSync(join(dir, "eslint.config.mjs"), "export default [{ ignores: ['**/*'] }];\n");
      const { code, stdout, stderr } = run(dir, "--solid", "src/Import.tsx", "--format", "compact");
      expect(code).toBe(1);
      expect(stdout).toContain("opentui/no-unknown-elements");
      expect(stderr).toContain("checked 1 of 1 files (1 solid): 2 errors.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an OpenTUI sample with no config is linted by a bare run", () => {
    const dir = mkdtempSync(join(tmpdir(), "opentui-lint-noconfig-"));
    try {
      for (const name of ["package.json", "tsconfig.json", "dashboard.tsx"]) {
        cpSync(join(EXAMPLES, "dashboard-react", name), join(dir, name));
      }
      expect(existsSync(join(dir, "eslint.config.mjs"))).toBe(false);
      const { code, stdout, stderr } = run(dir, "--format", "json");
      expect(code).toBe(1);
      expect(count(stdout)).toBe(12);
      expect(stderr).toContain("checked 1 of 1 files (1 react): 12 errors.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the same sample's eslint.config.mjs does not change the CLI's recommended run", () => {
    const { code, stdout, stderr } = run(
      join(EXAMPLES, "dashboard-react"),
      "dashboard.tsx",
      "--format",
      "json",
    );
    expect(code).toBe(1);
    // The file's config uses `strict` (15). The CLI keeps recommended (12)
    // unless `--strict` is passed; that flag is covered separately.
    expect(count(stdout)).toBe(12);
    expect(stderr).toContain("checked 1 of 1 files (1 react): 12 errors.");
  });
});

describe("opentui-lint (arguments)", () => {
  test("--help exits 0 and documents the exit codes", () => {
    const { code, stdout } = run(FIXTURE, "--help");
    expect(code).toBe(0);
    expect(stdout).toContain("bunx opentui-lint\n");
    expect(stdout).toContain("bunx opentui-lint --react src");
    expect(stdout).toContain("Exit codes");
  });

  test("--version prints the package version", () => {
    const { version } = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    );
    expect(run(FIXTURE, "--version").stdout.trim()).toBe(version);
  });

  test("an unknown flag exits 2 with the usage", () => {
    const { code, stderr } = run(FIXTURE, "--bogus");
    expect(code).toBe(2);
    expect(stderr).toContain("Unknown option '--bogus'");
    expect(stderr).toContain("Usage");
  });

  test("--react and --solid together is refused", () => {
    const { code, stderr } = run(FIXTURE, "--react", "--solid");
    expect(code).toBe(2);
    expect(stderr).toContain("--react, --solid and --framework are exclusive.");
  });

  test("--framework rejects anything but react or solid", () => {
    const { code, stderr } = run(FIXTURE, "--framework", "vue");
    expect(code).toBe(2);
    expect(stderr).toContain('--framework must be react or solid, not "vue".');
  });
});

describe("opentui-lint (init)", () => {
  test("init is still available and writes a config without becoming the default", () => {
    const dir = mkdtempSync(join(tmpdir(), "opentui-lint-init-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        `${JSON.stringify(
          {
            name: "init-app",
            private: true,
            devDependencies: { "@opentui/react": "^0.5.11" },
          },
          null,
          2,
        )}\n`,
      );
      const bare = run(dir);
      expect(bare.code).toBe(2);
      expect(bare.stderr).toContain('found no files in "."');
      expect(existsSync(join(dir, "eslint.config.mjs"))).toBe(false);

      const inited = run(dir, "init");
      expect(inited.code).toBe(0);
      expect(inited.stdout).toContain(`wrote eslint.config.mjs`);
      expect(readFileSync(join(dir, "eslint.config.mjs"), "utf8")).toContain(
        'import { plugin as opentui, recommended } from "opentui-lint"',
      );
      expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain("opentui-lint");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
