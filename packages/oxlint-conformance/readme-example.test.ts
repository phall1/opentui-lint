import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { PLUGIN_ENTRY, runOxlint, withOxlintConfig } from "./src/run-oxlint.js"

/**
 * The exact JSON block from the root README's "Oxlint" section, reproduced
 * here so a real oxlint process runs it rather than a human eyeballing it.
 * `jsPlugins` is the only line that differs from the README verbatim: a real
 * install points it at `./node_modules/opentui-lint/dist/index.js`, and this
 * repo checkout has no such node_modules entry to point at — it points at the
 * same dist/index.js directly instead. Everything oxlint does with that
 * string once it resolves is identical either way; module resolution is
 * Node's concern, not this plugin's.
 *
 * If the README's snippet changes, this constant has to change with it by
 * hand — this package does not read README.md, on purpose: a plugin that
 * parses its own marketing copy to decide what to test would be circular.
 */
const README_CONFIG = {
  jsPlugins: [PLUGIN_ENTRY],
  settings: { opentui: { framework: "react" } },
  rules: { "opentui-lint/no-unknown-elements": "error" },
}

describe("the README's Oxlint config block works verbatim", () => {
  test("reports <div> the same way the README claims", async () => {
    // No pragma, no @opentui/* import — settings.opentui.framework is doing
    // all the work here, exactly as the README's snippet implies it will.
    const fixture = join(import.meta.dir, "fixtures", "channels", "no-pragma-div.tsx")
    const diagnostics = await withOxlintConfig(README_CONFIG, (configPath) => runOxlint(configPath, [fixture]))
    const own = diagnostics.filter((d) => d.code === "opentui-lint(no-unknown-elements)")
    expect(own).toHaveLength(1)
    expect(own[0]!.message).toContain("Unknown component type: div")
  })
})
