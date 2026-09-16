import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OXLINT_BIN, PLUGIN_ENTRY, withOxlintConfig } from "./src/run-oxlint.js"

/**
 * `--fix` and `--fix-suggestions` rewrite files in place, so every case here
 * copies its fixture into a throwaway directory first — the checked-in
 * fixtures under fixtures/fixes/ must stay byte-identical between runs, or
 * every other test in this package would be linting a file it did not
 * expect.
 *
 * This is also where an alpha JS plugin API would most plausibly fall short:
 * `fix` and `suggest` are functions that call fixer methods and return
 * text-range edits, which is a much larger surface than `report()` alone.
 * Both turned out to work — see the package README for the full account.
 */

function copyFixture(name: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "oxlint-conformance-fix-"))
  const path = join(dir, name)
  writeFileSync(path, readFileSync(join(import.meta.dir, "fixtures", "fixes", name), "utf8"))
  return { dir, path }
}

async function runFix(configPath: string, file: string, extraArgs: string[]): Promise<void> {
  const proc = Bun.spawn([OXLINT_BIN, "-c", configPath, ...extraArgs, file], { stdout: "pipe", stderr: "pipe" })
  await proc.exited
}

describe("a rule's `fix` is a real, single-answer rewrite", () => {
  test("--fix rewrites <div> to <box> in place", async () => {
    const { dir, path } = copyFixture("rename.tsx")
    try {
      await withOxlintConfig(
        { jsPlugins: [PLUGIN_ENTRY], rules: { "opentui-lint/no-unknown-elements": "error" } },
        (configPath) => runFix(configPath, path, ["--fix"]),
      )
      const fixed = readFileSync(path, "utf8")
      expect(fixed).toContain("<box>")
      expect(fixed).not.toContain("<div>")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("a rule's `suggest` is not applied unless asked for", () => {
  test("plain --fix leaves a suggestion-only diagnostic untouched", async () => {
    const { dir, path } = copyFixture("typo.tsx")
    const before = readFileSync(path, "utf8")
    try {
      await withOxlintConfig(
        { jsPlugins: [PLUGIN_ENTRY], rules: { "opentui-lint/no-unknown-elements": "error" } },
        (configPath) => runFix(configPath, path, ["--fix"]),
      )
      expect(readFileSync(path, "utf8")).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("--fix-suggestions applies it: <boxx> becomes <box>", async () => {
    const { dir, path } = copyFixture("typo.tsx")
    try {
      await withOxlintConfig(
        { jsPlugins: [PLUGIN_ENTRY], rules: { "opentui-lint/no-unknown-elements": "error" } },
        (configPath) => runFix(configPath, path, ["--fix-suggestions"]),
      )
      const fixed = readFileSync(path, "utf8")
      expect(fixed).toContain("<box />")
      expect(fixed).not.toContain("<boxx")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
