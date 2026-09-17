import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runOxlint, withOxlintConfig } from "./src/run-oxlint.js";

/**
 * The two JSON blocks from the root README's "Oxlint" section, reproduced
 * here so a real oxlint process runs them rather than a human eyeballing
 * them. Both are byte-for-byte what the README tells people to write,
 * bare `"opentui-lint"` specifier included: `withOxlintConfig` writes its
 * scratch config inside this package so that specifier resolves through
 * node_modules the same way it does from a project root.
 *
 * If the README's snippets change, these constants have to change with them
 * by hand. This package does not read README.md, on purpose: a plugin that
 * parses its own marketing copy to decide what to test would be circular.
 */
const README_CONFIG = {
  jsPlugins: ["opentui-lint"],
  rules: { "opentui-lint/no-unknown-elements": "error" },
};

/** The README's second block: the same plugin under the `opentui` alias. */
const README_ALIAS_CONFIG = {
  jsPlugins: [{ name: "opentui", specifier: "opentui-lint" }],
  rules: { "opentui/no-unknown-elements": "error" },
};

// No pragma and no settings block, matching the README's snippets: the
// fixture's `@opentui/react` import is the only framework evidence there is.
const FIXTURE = join(import.meta.dir, "fixtures", "channels", "import-div.tsx");

describe("the README's Oxlint config blocks work verbatim", () => {
  test("a bare package specifier resolves and reports <div>", async () => {
    const diagnostics = await withOxlintConfig(README_CONFIG, (configPath) =>
      runOxlint(configPath, [FIXTURE]),
    );
    const own = diagnostics.filter((d) => d.code === "opentui-lint(no-unknown-elements)");
    expect(own).toHaveLength(1);
    expect(own[0]!.message).toContain("Unknown component type: div");
  });

  /**
   * The nuance this package's README got wrong until it was tested: oxlint's
   * rule-id namespace is the plugin's own `meta.name` for a plain string
   * specifier, but the `{ name, specifier }` form overrides it. That is the
   * only way an oxlint config can use the same `opentui/` prefix the ESLint
   * setup uses, so the README offers it and this proves it.
   */
  test("the { name, specifier } form renames the rule namespace to opentui", async () => {
    const diagnostics = await withOxlintConfig(README_ALIAS_CONFIG, (configPath) =>
      runOxlint(configPath, [FIXTURE]),
    );
    expect(diagnostics.map((d) => d.code)).toContain("opentui(no-unknown-elements)");
    expect(diagnostics.map((d) => d.code)).not.toContain("opentui-lint(no-unknown-elements)");
  });
});
