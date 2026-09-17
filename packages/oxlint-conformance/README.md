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
- **`readme-example.test.ts`** — both JSON blocks from the root README's Oxlint
  section, byte-for-byte as published, bare `"opentui-lint"` specifier and
  absent `settings` block included. One proves the default namespace reports
  `<div>` the way the README says; the other proves the
  `{ name, specifier }` form renames it to `opentui`.

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

Two portability nuances, neither a bug.

**The rule-id namespace follows the specifier form.** A plain string in
`jsPlugins` reports under the plugin's own `meta.name` (`"opentui-lint"`); the
`{ "name": "opentui", "specifier": "opentui-lint" }` form reports under `name`,
which is how an oxlint config gets the same `opentui/` prefix the ESLint setup
uses. An earlier version of this file claimed the namespace was always
`meta.name` regardless of config, which was wrong and is now pinned by a test
in `readme-example.test.ts` rather than asserted here. `allRulesConfig()` in
`src/run-oxlint.ts` uses the plain form and so writes `"opentui-lint/<rule>"`
keys; the package's `recommended` and `strict` exports are keyed
`"opentui/<rule>"` and still cannot be spread into an oxlint config, since the
prefix has to match whichever form that config chose.

**A plugin specifier resolves relative to the config file, not the working
directory.** A bare `"opentui-lint"` is resolved through `node_modules` the way
Node would, starting from the directory holding `.oxlintrc.json`. That is why
`withOxlintConfig` writes its scratch config inside this package instead of the
OS temp directory: from `/tmp` the bare name resolves to nothing, and the
README test could only have run a rewritten config rather than the published
one.

## Files

- `src/run-oxlint.ts` — spawns the real binary, resolves it via
  `Bun.resolveSync("oxlint/package.json", …)` so hoisting doesn't matter,
  parses its JSON output, and filters to this plugin's own diagnostics
  (`oxlint`'s default rule set, `no-unused-vars` and friends, is noise here).
- `src/rule-fixtures.ts` — the rule → fixture → expected-substring table
  `coverage.test.ts` drives and drift-checks.
- `fixtures/react/*.tsx`, `fixtures/solid/*.tsx` — one violation per rule.
- `fixtures/channels/*` — the settings/options/filename/state cases, plus
  `import-div.tsx`, whose `@opentui/react` import is the only framework
  evidence the README's settings-free config gets.
- `fixtures/fixes/*.tsx` — copied to a temp dir before `--fix` runs, so the
  checked-in fixtures are never mutated by the tests that exercise them.

This package is private and is never published; it exists to keep the README
honest, not to ship.
