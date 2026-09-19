import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { plugin, recommended, rules, strict } from "../src/index.js";

/**
 * The CLI builds a config in memory, but the published package is still an
 * ESLint 9 plugin and an oxlint JS plugin. These imports are the surface
 * `eslint.config.mjs` and `.oxlintrc.json` consume; a CLI change must not
 * rename or drop them.
 */
describe("package exports", () => {
  test("plugin, recommended and strict remain the public surface", () => {
    expect(plugin.meta.name).toBe("opentui-lint");
    expect(plugin.rules).toBe(rules);
    expect(recommended["opentui/no-unknown-elements"]).toBe("error");
    expect(recommended["opentui/no-website-spacing"]).toBeUndefined();
    expect(strict["opentui/no-website-spacing"]).toBe("error");
    expect(Object.keys(rules)).toEqual(expect.arrayContaining(Object.keys(plugin.rules)));
  });

  test("an eslint.config-shaped setup using those exports still reports", async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.tsx"],
          languageOptions: {
            parser: tsParser,
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          plugins: { opentui: plugin as never },
          rules: recommended,
          settings: { opentui: { framework: "react" } },
        },
      ],
    });
    const [result] = await eslint.lintText("export const X = () => <div>hi</div>;\n", {
      filePath: "App.tsx",
    });
    expect(result!.messages.some((m) => m.ruleId === "opentui/no-unknown-elements")).toBe(true);
  });
});
