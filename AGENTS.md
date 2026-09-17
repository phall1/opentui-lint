# Working in this repo

`opentui-lint` reports OpenTUI mistakes that TypeScript cannot see. Its only
asset is being right, so accuracy beats coverage everywhere.

## Toolchain

Bun 1.4.2. `bun install` at the root; every package script runs through Bun.

```bash
bun run test        # every package
bun run typecheck
bun run lint        # oxlint over this repo's own source
bun run build       # builds packages/lint
```

The CLI is `packages/lint/src/cli.ts` with one module per command under
`src/commands/`. `bun packages/lint/src/cli.ts --react <dir>` runs it from
source; `packages/lint/test/cli.test.ts` runs it as a subprocess the way a
user would, including the exit codes.

## The dependency boundary

**The published package has zero runtime dependencies and keeps them.** It lands
in every consumer's devDependencies; anything added here is a cost every
OpenTUI app pays for a dev tool.

`eslint` and `@typescript-eslint/parser` are **required peer dependencies**,
not dependencies, and that distinction is what makes `bunx opentui-lint` work
with nothing installed: bunx and npx install a package's non-optional peers
beside it (checked against Bun 1.4.2 and npm 11), while a consumer's own
install still records them as peers rather than paying for them twice.
`src/commands/lint.ts` imports both lazily, so `init` and `doctor` run without
them and a missing pair is reported with the command that fixes it. Do not
mark them optional again; the one-shot run would fail with a module-not-found.

Effect is used in `scripts/sync-catalog.ts` and belongs in `devDependencies`
only. Never import it from `src/`, not for convenience and not "just this once".
Two reasons, both concrete:

- ESLint's rule API is synchronous and callback-driven, with `context.report()`
  as the only output. There is no error channel, no concurrency and no resource
  to manage, so `Effect.runSync` at every visitor boundary would buy nothing.
- The rules work unmodified as **oxlint** JS plugins because they are
  plain objects with plain functions. That is a tested capability, not an
  accident.

The generator is the opposite on every count (subprocesses, a temp directory
that must survive Ctrl-C, four distinct failure modes), which is why it uses
`Effect.acquireRelease`, a typed error channel and `BunRuntime.runMain`. That
choice is load-bearing and measured: a plain `try/finally` **leaks the temp
directory on SIGINT**; `acquireRelease` under `runMain` does not.

After touching the package manifest, confirm the boundary held:

```bash
npm pack --dry-run --workspace opentui-lint   # expect ~60 kB, dependencies: {}
```

## The two rules that matter

**Never assert something about OpenTUI you have not verified against the real
package.** Every fact the rules use lives in `packages/lint/src/catalog/generated.ts`
and is produced by `packages/lint/scripts/sync-catalog.ts`, which installs
OpenTUI into a temp directory and reads it. Do not hand-edit the generated file.
After bumping the supported version:

```bash
bun run catalog:sync
bun run --filter opentui-lint-conformance test
```

**Never report something you cannot prove.** A false positive costs more than a
missed case: the first thing a person does with a noisy linter is turn it off.
When an AST cannot decide (`{label}` could be a string or an element, a text
modifier returned from a component could be wrapped at the call site), the rule
stays quiet and the limitation gets documented in the rule's doc page.

## Autofix discipline

A fix is applied only when there is exactly one correct answer: `<div>` → `<box>`,
`rgb(34, 197, 94)` → `#22c55e`, `onMouseEnter` → `onMouseOver`. Anything that
involves a judgement (which Tailwind shade `slate` meant, whether a dead prop
should be deleted, whether `<button>` wants `onMouseDown` or a recipe) is a
`suggest`, never a `fix`.

Two traps that already bit once each:

- **Fix the narrowest node.** `staticStrings` returns the node each string came
  from so a fix on `bg={active ? "indigo" : "transparent"}` rewrites
  the branch and not the ternary. An autofix that deletes logic is worse than no
  autofix.
- **Group text runs.** A box lays out as a column, so wrapping each stray child
  separately silently moves them onto different lines. `textRuns` exists for
  this, and a run with an untypeable expression beside it downgrades to a
  suggestion rather than shipping half a fix.

## Adding a rule

1. Write it in `packages/lint/src/rules/`, built with `defineRule` from
   `src/project/rule.ts` so framework gating and the `note` setting come for
   free. Rules never detect the framework themselves.
2. Register it in `src/plugin.ts`, and in `recommended` only if it reports a
   genuine defect rather than a style preference.
3. Test it in `packages/lint/test/`, including a case under `undetectedTester()`
   proving it stays silent in a non-OpenTUI file.
4. Add a conformance case in **both** bindings (`packages/conformance/cases.tsx`
   for React, `packages/conformance-solid/conformance.test.tsx` for Solid),
   pairing the snippet with what OpenTUI really does with it. A rule with no
   conformance case is a claim nobody checked.
5. Write `docs/rules/<name>.md`, including a "what it does not report" section.

## React and Solid are equal targets

They are different programs. Solid's reconciler has no text-context check, no
ErrorBoundary, and its own error strings; its compound elements use underscores;
`on:mousedown` is real event syntax there and nowhere else. Anything a message
says about "what OpenTUI does" belongs in `src/catalog/runtime.ts`, keyed by
framework, and gets asserted against a real render of that binding. Never write
a runtime error string inline in a rule.

A message that quotes the wrong error is worse than a vague one: it sends the
reader searching the codebase for a string that is not there.

## Message style

The error is the product. An agent should be able to fix the code from the
message alone, without opening the OpenTUI docs. Each one says what breaks, why
the type checker was quiet, and what to write instead, in that order.

## Releasing

Releases are automated by `.github/workflows/publish.yml`. release-please and
the `npm publish` job live in that one file because npm's trusted publishing
validates the workflow _filename_ carried in the OIDC token, and it does not
follow `workflow_call` into a reusable workflow.

Commit subjects decide the version, so they have to be conventional commits from
here on. `feat:` bumps the minor, `fix:` bumps the patch, and a breaking change
bumps the minor too while the package is pre-1.0. Anything else (`docs:`,
`ci:`, `refactor:`, `chore:`) ships no release at all.

What a release looks like:

1. release-please keeps a release PR open against `main` carrying the version
   bump, `packages/lint/CHANGELOG.md`, and `.release-please-manifest.json`.
2. Merging that PR tags the commit `vX.Y.Z` and cuts the GitHub release.
3. The publish job on the same workflow run builds, re-runs the package's tests
   and `catalog:check` against the exact commit being shipped, and publishes.

There is no npm token anywhere in the repo or in the Actions secrets. The
publish job holds `id-token: write`, npm trades that OIDC token for a
short-lived credential, and the tarball lands with a provenance attestation
pointing back at the run. The npm side is a trusted publisher on the package
naming this repository and `publish.yml`.

The release path is the repo root, not `packages/lint`. Release-please decides
what to release by splitting commits on that path, and the README it publishes
to npm lives at the root, so a docs fix under `packages/lint` would never have
counted. `extra-files` keeps `packages/lint/package.json` as the version that
ships, `exclude-paths` keeps the private conformance and example packages from
cutting releases on their own, and the root `package.json` carries a version
field it never had before, which nothing installs and nothing reads.

Three things worth knowing when it misbehaves:

- A release whose publish job failed is recoverable without a new commit. Run
  the workflow by hand (`gh workflow run publish.yml`); it publishes whatever
  version `packages/lint/package.json` is at, and npm rejects a version it
  already has, so there is nothing to overwrite.
- A release that reports `Considering: 0 commits` did not see your commit as
  touching the release path. Check `exclude-paths` before assuming the commit
  message was the problem.
- A release-please release cannot trigger a separate workflow. The tag and the
  release are created with `GITHUB_TOKEN`, and GitHub suppresses the events that
  token produces, which is why the publish job hangs off `needs` rather than a
  `release: published` trigger.

Before anything reaches the registry, the dependency boundary check still
applies: `npm pack --dry-run --workspace opentui-lint`, expecting
`dependencies: {}`.
