import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { PLUGIN_ENTRY, runOxlint, withOxlintConfig } from "./src/run-oxlint.js"

/**
 * The rules lean on four channels of `context` beyond `report()`:
 * `settings`, `options`, `filename`, and per-file isolation of whatever state
 * a rule's `create()` closes over. ESLint guarantees all four; oxlint's JS
 * plugin API is alpha and says nothing about any of them. Each test below
 * proves one channel actually crosses the boundary, using a fixture that only
 * reports correctly if it did.
 */

const FIXTURES_DIR = join(import.meta.dir, "fixtures", "channels")

describe("settings.opentui reaches the rule", () => {
  // no-pragma-div.tsx has no @jsxImportSource pragma, no @opentui/* import,
  // and sits in a directory with no tsconfig.json — every other detection
  // signal in project/framework.ts is absent on purpose. If this file reports
  // at all, `settings` is the only channel that could have supplied it.
  const fixture = join(FIXTURES_DIR, "no-pragma-div.tsx")

  test("with settings.opentui.framework set, the rule fires", async () => {
    const diagnostics = await withOxlintConfig(
      { jsPlugins: [PLUGIN_ENTRY], settings: { opentui: { framework: "react" } }, rules: { "opentui-lint/no-unknown-elements": "error" } },
      (configPath) => runOxlint(configPath, [fixture]),
    )
    expect(diagnostics.some((d) => d.code === "opentui-lint(no-unknown-elements)")).toBe(true)
  })

  test("without it, the same file is exempt — proving the first result wasn't a fluke", async () => {
    const diagnostics = await withOxlintConfig(
      { jsPlugins: [PLUGIN_ENTRY], rules: { "opentui-lint/no-unknown-elements": "error" } },
      (configPath) => runOxlint(configPath, [fixture]),
    )
    expect(diagnostics).toHaveLength(0)
  })
})

describe("rule options reach the rule", () => {
  // <sparkline> is not in the default catalogue, so this fixture reports by
  // default — the `allow` option is the only thing that can silence it.
  const fixture = join(FIXTURES_DIR, "options-target.tsx")

  test("without the allow option, the element is reported", async () => {
    const diagnostics = await withOxlintConfig(
      { jsPlugins: [PLUGIN_ENTRY], rules: { "opentui-lint/no-unknown-elements": "error" } },
      (configPath) => runOxlint(configPath, [fixture]),
    )
    expect(diagnostics.some((d) => d.code === "opentui-lint(no-unknown-elements)")).toBe(true)
  })

  test("with allow: ['sparkline'], the same element is silent", async () => {
    const diagnostics = await withOxlintConfig(
      {
        jsPlugins: [PLUGIN_ENTRY],
        rules: { "opentui-lint/no-unknown-elements": ["error", { allow: ["sparkline"] }] },
      },
      (configPath) => runOxlint(configPath, [fixture]),
    )
    expect(diagnostics).toHaveLength(0)
  })
})

describe("context.filename reaches the rule", () => {
  // Both files contain the exact same violation. no-raw-stdout's allowInFiles
  // option matches file paths against context.filename directly (see
  // rules/no-raw-stdout.ts), so only a real, correct filename — not "<input>"
  // or some other placeholder — makes this pair come out different.
  const cliEntry = join(FIXTURES_DIR, "cli-entry.ts")
  const component = join(FIXTURES_DIR, "component.ts")
  const config = {
    jsPlugins: [PLUGIN_ENTRY],
    rules: { "opentui-lint/no-raw-stdout": ["error", { allowInFiles: ["cli-entry\\.ts$"] }] },
  }

  test("a file matching allowInFiles is exempt", async () => {
    const diagnostics = await withOxlintConfig(config, (configPath) => runOxlint(configPath, [cliEntry]))
    expect(diagnostics).toHaveLength(0)
  })

  test("byte-for-byte the same code at a non-matching filename still reports", async () => {
    const diagnostics = await withOxlintConfig(config, (configPath) => runOxlint(configPath, [component]))
    expect(diagnostics.some((d) => d.code === "opentui-lint(no-raw-stdout)")).toBe(true)
  })
})

describe("per-file rule state does not leak across one oxlint run", () => {
  // require-registration tracks which registration functions a *file* calls
  // in module-level `Set`s inside its own create() closure (see
  // rules/require-registration.ts). Linting both fixtures in the same process
  // checks that oxlint gives each file its own closure rather than reusing
  // one `create()` call's state across files — the failure mode would be
  // register-b.tsx going quiet because register-a.tsx called
  // registerQRCode() first.
  test("register-a.tsx registering the element does not silence register-b.tsx", async () => {
    const diagnostics = await withOxlintConfig(
      { jsPlugins: [PLUGIN_ENTRY], rules: { "opentui-lint/require-registration": "error" } },
      (configPath) =>
        runOxlint(configPath, [join(FIXTURES_DIR, "register-a.tsx"), join(FIXTURES_DIR, "register-b.tsx")]),
    )
    const own = diagnostics.filter((d) => d.code === "opentui-lint(require-registration)")
    expect(own).toHaveLength(1)
    expect(own[0]!.filename).toContain("register-b.tsx")
  })
})
