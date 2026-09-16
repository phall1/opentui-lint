import tsParser from "@typescript-eslint/parser"
import { plugin as opentui, strict } from "opentui-lint"

export default [
  {
    files: ["**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { opentui },
    rules: strict,
    settings: {
      opentui: {
        note: "See docs/roadmap.md for the house terminal-layout rules.",
      },
    },
  },
]
