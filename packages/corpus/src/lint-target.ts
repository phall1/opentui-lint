/**
 * Runs opentui-lint over one corpus target and returns every finding.
 *
 * A single pass with the `strict` rule set (which is `recommended` plus the
 * four design-system rules — see `packages/lint/src/plugin.ts`) is exactly
 * equivalent to running `recommended` and `strict` separately and taking their
 * union: ESLint rules do not interact, so no rule's output depends on which
 * other rules are also enabled. Each finding is tagged with which preset(s)
 * would have reported it, and `report.ts` / the test suite present the two
 * counts separately from that one tag, rather than re-linting twice for a
 * distinction that cannot change the result.
 */

import { ESLint, type Linter } from "eslint"
import tsParser from "@typescript-eslint/parser"
import { plugin as opentui, recommended, strict } from "opentui-lint"
import type { OpenTuiSettings } from "opentui-lint"

const RECOMMENDED_RULES = new Set(Object.keys(recommended).map((id) => id.replace(/^opentui\//, "")))

export interface Finding {
  ruleId: string
  /** Path relative to the target's own root — stable across machines and cache locations. */
  file: string
  line: number
  column: number
  message: string
  /** Whether `opentui/recommended` alone would also have reported this. */
  inRecommended: boolean
}

export interface LintTarget {
  id: string
  /** Absolute directory findings' `file` paths are made relative to. */
  rootDir: string
  /** Absolute paths of every file to lint. */
  files: string[]
  /** Rare escape hatch — only used where detection genuinely cannot resolve the framework; see README. */
  settingsOverride?: OpenTuiSettings
}

export interface LintOutcome {
  findings: Finding[]
  /** ESLint messages with no `ruleId` — a parse/config failure, never expected on real corpus source. */
  toolingErrors: string[]
}

export async function lintTarget(target: LintTarget): Promise<LintOutcome> {
  if (target.files.length === 0) return { findings: [], toolingErrors: [] }

  const config: Linter.Config = {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { opentui },
    rules: strict,
    ...(target.settingsOverride ? { settings: { opentui: target.settingsOverride } } : {}),
  }

  const eslint = new ESLint({
    cwd: target.rootDir,
    overrideConfigFile: true,
    overrideConfig: config,
  })

  const results = await eslint.lintFiles(target.files)

  const findings: Finding[] = []
  const toolingErrors: string[] = []

  for (const result of results) {
    const relFile = result.filePath.startsWith(target.rootDir)
      ? result.filePath.slice(target.rootDir.length).replace(/^\/+/, "")
      : result.filePath

    for (const message of result.messages) {
      if (!message.ruleId) {
        toolingErrors.push(`${relFile}:${message.line} — ${message.message}`)
        continue
      }
      const bareRule = message.ruleId.replace(/^opentui\//, "")
      findings.push({
        ruleId: bareRule,
        file: relFile,
        line: message.line,
        column: message.column,
        message: message.message,
        inRecommended: RECOMMENDED_RULES.has(bareRule),
      })
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
  return { findings, toolingErrors }
}
