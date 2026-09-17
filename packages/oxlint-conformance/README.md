# opentui-lint-conformance-oxlint

Proves the root README's Oxlint claim against a real `oxlint` process, not by
reading the claim and agreeing with it.

> The rule objects work unmodified as an **oxlint** JS plugin, which matters
> because OpenTUI's own repo uses oxlint.

Nothing else in this repo tested that until now: `packages/conformance` and
`packages/conformance-solid` run the rules through ESLint's `Linter` class,
which is a different program from oxlint's JS plugin runtime. A rule that
reached into an ESLint-only corner of `context` would pass every existing test
and silently break the moment OpenTUI's own lint config picked it up.

## Run it

```bash
bun install
bun run build                                       # this package consumes packages/lint/dist
bun run --filter opentui-lint-conformance-oxlint test
```

It shells out to the real `oxlint` binary (the repo root's devDependency,
resolved via `Bun.resolveSync`, currently **1.83.0**, which matches the version
the root README says it was verified against) and asserts on its actual JSON
output. There is no mock of oxlint anywhere in this package.

## What is covered

- **`coverage.test.ts`** — every rule `packages/lint/src/plugin.ts` exports,
  read from the built package's `rules` object at test time (never a
  hand-maintained list), reports under oxlint with the right message. The seven
  rules whose logic reads `context.framework` (`no-unknown-elements`,
  `text-must-be-wrapped`, `no-orphan-text-nodes`, `no-web-props`,
  `no-unsupported-values`, `require-registration`, `no-magic-density`) get a
  React **and** a Solid fixture; the other five (`valid-colors`,
  `no-raw-stdout`, `no-website-spacing`, `use-theme-tokens`, `no-restyle`) don't
  branch on the binding, so one fixture proves their oxlint behavior. A
  dedicated test diffs the plugin's rule list against `src/rule-fixtures.ts`'s
  coverage table and fails if they don't match: adding a rule without an oxlint
  case is a red test, not a silent gap.
- **`channels.test.ts`** — the four parts of `context` a rule can depend on
  beyond `report()`: `settings.opentui` (a fixture with zero other framework
  evidence only reports when settings supply it), rule **options** (`allow`
  silencing `no-unknown-elements` on an otherwise-reported element),
  `context.filename` (`no-raw-stdout`'s `allowInFiles` regex only matches
  when the filename oxlint hands the rule is the real one), and **per-file
  isolation** of a rule's closure state (`require-registration` tracks
  per-file `registerQRCode()` calls in a `Set` inside `create()`; linting two
  files in one oxlint process proves file B doesn't inherit file A's call).
- **`fixes.test.ts`** — `fix` and `suggest` both work for real: `--fix`
  rewrites `<div>` to `<box>` in place; a suggestion-only diagnostic
  (`<boxx>` → did-you-mean `<box>`) is left alone by plain `--fix` and only
  applied by `--fix-suggestions`, matching ESLint's own fix/suggest split.
- **`readme-example.test.ts`** — the exact JSON block from the root README's
  Oxlint section (module path aside, see the file's own comment) reports
  `<div>` the way the README says it will.

## What did _not_ work

Nothing. Every channel above worked identically to ESLint on the first attempt:
`settings`, rule `options`, `context.filename`, `context.sourceCode.getScope()`
(used by the style-aware rules to resolve a `style={hoisted}` object back to its
`const` declaration), `node:fs` calls from inside a rule (the tsconfig walk in
`project/framework.ts`), real `fix` edits, and `suggest` applied via
`--fix-suggestions`. That is a stronger result than the root README claims:
"verified against oxlint 1.83" turns out to mean _everything the rules touch_
survived the port, not just the one `no-unknown-elements` case that was
hand-checked before this package existed.

One portability nuance, not a bug. **oxlint's rule-id namespace is always the
plugin's own `meta.name`** (`"opentui-lint"`), regardless of what key a
config's `jsPlugins` array or an ESLint `plugins: {}` object gives it. The
package's `recommended` and `strict` exports are keyed `"opentui/<rule>"`
(the alias the ESLint README example happens to choose), so they cannot be
spread directly into an oxlint config's `rules` block; every key has to be
written `"opentui-lint/<rule>"` by hand, exactly as the root README's own
example already does. `allRulesConfig()` in `src/run-oxlint.ts` builds oxlint
rule keys this way for the same reason.

## Files

- `src/run-oxlint.ts` — spawns the real binary, resolves it via
  `Bun.resolveSync("oxlint/package.json", …)` so hoisting doesn't matter,
  parses its JSON output, and filters to this plugin's own diagnostics
  (`oxlint`'s default rule set, `no-unused-vars` and friends, is noise here).
- `src/rule-fixtures.ts` — the rule → fixture → expected-substring table
  `coverage.test.ts` drives and drift-checks.
- `fixtures/react/*.tsx`, `fixtures/solid/*.tsx` — one violation per rule.
- `fixtures/channels/*` — the settings/options/filename/state cases.
- `fixtures/fixes/*.tsx` — copied to a temp dir before `--fix` runs, so the
  checked-in fixtures are never mutated by the tests that exercise them.

This package is private and is never published; it exists to keep the README
honest, not to ship.
