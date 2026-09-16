import tsParser from "@typescript-eslint/parser"
import { plugin as opentui, strict } from "opentui-lint"

// No `settings.opentui.framework` here on purpose: the framework is read from
// this directory's tsconfig, exactly as it would be in a real project.
export default [
  {
    files: ["**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { opentui },
    rules: strict,
  },
]
