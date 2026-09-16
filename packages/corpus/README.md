# opentui-lint-corpus

The strongest evidence a linter does not cry wolf is not a synthetic test —
it is running every rule over **real, working, expert-written OpenTUI code**
and finding nothing wrong with the code itself. This package does exactly
that, against two real sources pinned to an exact revision each:

- **OpenTUI's own examples** — `packages/examples` (Core), plus
  `packages/react/examples` and `packages/solid/examples`, from
  [`anomalyco/opentui`](https://github.com/anomalyco/opentui).
- **tuiparts' component registry** — `registry/`, from
  [`tuiparts/tuiparts`](https://github.com/tuiparts/tuiparts), installed
  exactly the way tuiparts' own CLI would install it into a consumer project
  (see [How the tuiparts corpus is built](#how-the-tuiparts-corpus-is-built)).
  This is also the corpus that exercises `isDesignSystemSource`: every
  installed file is design-system source, so the design-system rules
  (`no-restyle`, `use-theme-tokens`, `no-magic-density`) are expected to be
  completely silent on it, by design.

If `opentui-lint` reports something here, either a rule is wrong or the
corpus code is wrong — and this package's job is to tell you which, not just
count how many.

## Running it

```bash
bun install
bun run --filter opentui-lint build      # the corpus lints the real published dist, via the workspace link
bun run --filter opentui-lint-corpus fetch    # clone + materialize the pinned corpus (optional — test does this too)
bun run --filter opentui-lint-corpus report   # print every finding with its baseline classification
bun run --filter opentui-lint-corpus test     # bun:test — fails if live findings and baseline.json disagree
```

`fetch` and `test` both clone into `packages/corpus/.cache/` (gitignored) the
first time they run and reuse it after that; `CORPUS_CACHE_DIR` overrides the
location, which is how CI points this at an `actions/cache`-restored
directory instead of re-cloning on every run.

## What each piece is

| File | Purpose |
| --- | --- |
| `src/pins.ts` | The two pinned revisions, in one place. Bump these deliberately. |
| `src/cache.ts` | Clones a pin into a keyed, persistent cache directory. |
| `src/materialize-tuiparts.ts` | Installs the tuiparts registry into three consumer roots, from `registry.json`'s own manifest. |
| `src/targets.ts` | The corpus itself — every directory this package lints, and why. |
| `src/lint-target.ts` | Runs `opentui-lint`'s `strict` rule set (a superset of `recommended`) over one target. |
| `src/baseline.ts` | Reads/keys `baseline.json`. |
| `src/report.ts` | `bun run report` — prints every finding with its classification, for triage. |
| `test/corpus.test.ts` | Asserts live findings and `baseline.json` are identical, target by target. |
| `baseline.json` | Every finding this package has ever seen, classified. See below. |

## Why `strict` alone, reported as two numbers

`recommended` and `strict` are rule sets, not separate passes — `strict` is
literally `{ ...recommended, ...four more rules }` (see
`packages/lint/src/plugin.ts`). ESLint rules do not interact with each other,
so linting once with `strict` and then partitioning the results by whether a
rule is also in `recommended` produces the exact same findings, in the exact
same locations, as running the two rule sets separately and taking their
union — just without paying for two lint passes over the same files. Every
finding below is tagged `recommended` or `strict-only` on that basis.

## The triage

Every finding gets exactly one classification, with a reason a reviewer can
check without re-deriving it:

- **`true-positive`** — the corpus code is really wrong, and the rule caught
  a real bug. These are gold: they mean the rule is doing its job on code a
  human trusted enough to ship as an example or a package.
- **`false-positive`** — the *rule* is wrong. This is the whole reason this
  package exists. A false positive is never silently added to the baseline
  and left there as if that settled it — every one in `baseline.json` is
  also called out loudly below, because fixing it is a `packages/lint`
  change this package cannot make itself (see [Files this package
  owns](#files-this-package-does-not-own)).
- **`acceptable`** — a real, intentional deviation the rule correctly
  reports, but that is a deliberate choice rather than a defect (an example
  demonstrating generous spacing for readability, say). The rule is working
  as designed; the code just isn't optimizing for what the rule checks.

`baseline.json` is a flat array. Each entry:

```json
{
  "target": "opentui-react-examples",
  "ruleId": "no-web-props",
  "file": "basic.tsx",
  "line": 50,
  "column": 12,
  "classification": "false-positive",
  "reason": "one line, specific, checkable"
}
```

The key is `target + ruleId + file + line + column` — not a hash of the
message text, so a rule's wording is free to improve without silently
orphaning a classified finding. A genuinely new location or rule always
forces a fresh triage decision; `test/corpus.test.ts` fails loudly on both a
new, unclassified finding and a baseline entry that no longer reproduces
(the latter means the baseline has gone stale and needs updating, not that
something is broken).

**There is no auto-writer for `baseline.json`.** `bun run report` shows you
every current finding and whether it already has a baseline entry; turning
an `[UNCLASSIFIED]` finding into a baseline entry is a judgment call made by
a person (or an agent that has actually read the code and the rule), and
hand-editing the JSON is the only way to add one. A script that classified
findings automatically would defeat the point of the exercise.

## Current results (pinned corpus, checked in)

Zero true positives. 235 real files, 85 findings, all triaged:

| Classification | Count | Rules |
| --- | --- | --- |
| `true-positive` | **0** | — |
| `false-positive` | 64 | `no-web-props` (45), `text-must-be-wrapped` (8), `no-orphan-text-nodes` (11) |
| `acceptable` | 21 | `no-website-spacing` (21, all `strict-only`) |

All 85 findings are in `packages/examples`/`packages/react/examples`/
`packages/solid/examples`. **The entire tuiparts corpus — 108 installed
recipe files across Core/React/Solid, plus 34 of tuiparts' own smoke
tests — produces zero findings**, under both `recommended` and `strict`.
That is the headline result for the design-system rules specifically: not
"no theme was discovered so the rules had nothing to check" (verified —
see the note in `src/targets.ts` and the manual check described in the PR
this package shipped in) but "a theme *was* discovered, from the exact
`components/ui/theme.ts` a real install produces, and the design-system
rules correctly stayed silent on every file `isDesignSystemSource` says is
theirs."

### The two false-positive bugs, in full

Both are real bugs in `packages/lint`, found by running the rules over code
neither rule's author wrote. Fixing them is out of scope for this package —
see [Files this package does not own](#files-this-package-does-not-own) — but
they are reported here in the detail `AGENTS.md` asks for: not a count, a
reason.

#### 1. `no-web-props` flags `title` on `<box>`, which the catalog says is real

45 occurrences, e.g. `packages/react/examples/animation.tsx:52`:

```tsx
<box
  title="System Monitor"
  style={{ margin: 1, padding: 1, border: true, ... }}
>
```

The rule reports:

> `title` does nothing on `<box>`. OpenTUI assigns unknown props straight
> onto the renderable, so there is no error at runtime — the value is simply
> never read. On `<box>` this sets the border title; elsewhere it does
> nothing.

That message is self-contradicting: it says `title` does nothing while also
saying what it does. `packages/lint/src/catalog/generated.ts` — generated
from `@opentui/react`'s real `.d.ts`, not hand-written — lists `title`,
`titleAlignment` and `titleColor` as real, typed props of `box`. The
renderable uses `title` to draw the border title; `<box title="System
Monitor">` is not a mistake, it is the documented way to put a title on a
bordered box, used throughout OpenTUI's own examples.

Root cause, in `packages/lint/src/rules/no-web-props.ts`'s `report()`: the
`PROP_RENAME` branch checks `accepts.has(rename)` — whether the *target*
element actually has the renamed prop — before firing. The `WEB_ONLY_PROPS`
branch (which is what fires for `title`) has no equivalent check against
`knownProps(element)`; it reports purely because `title` is a key in the
`WEB_ONLY_PROPS` table in `packages/lint/src/catalog/index.ts`, regardless of
whether the current element's own catalog entry lists `title` as a real prop.

#### 2. `text-must-be-wrapped` / `no-orphan-text-nodes` stop at a custom component instead of seeing through it

19 occurrences (8 + 11) across both bindings, all following one shape —
`packages/react/examples/keymap.tsx:257-259` and `:446`:

```tsx
function KeyLabel({ children }: { children: ReactNode }) {
  return <span style={{ fg: palette.key, attributes: TextAttributes.BOLD }}>{children}</span>
}
// ...
<text height={1}>
  <KeyLabel>j</KeyLabel>
  ...
</text>
```

and the Solid equivalent, a built-in control-flow component instead of a
custom one — `packages/solid/examples/session.tsx:141-144`:

```tsx
<text fg="#666666">
  Messages: {messages.data.length} |{" "}
  <Show when={isChunkingActive()} fallback="Waiting for next message...">
    Receiving message...
  </Show>
</text>
```

Both render correctly: `<KeyLabel>` resolves to `<span>`, and Solid's
`<Show>` is transparent to reconciliation — in both cases the string ends up
exactly where the JSX already shows it, nested inside a real `<text>`. But
`opentui-lint` reports `"j"` and `"Receiving message..."` as text outside
`<text>`, and the `<span>`s inside `<Show>` (`session.tsx:173-184`) as orphan
text nodes.

Root cause, in `packages/lint/src/project/jsx.ts`'s `textContext()`: the
function's own doc comment says "a component boundary makes the answer
unknowable, and the caller must treat that as 'do not report'" — and both
calling rules correctly check for that (`no-orphan-text-nodes` even has a
comment: *"Through a component boundary we cannot see the `<text>` that may
well be wrapping this, so stay quiet rather than guess"*). But the walk only
detects a component boundary when it reaches a `FunctionDeclaration` /
`FunctionExpression` / `ArrowFunctionExpression` / `Program` node — i.e. when
walking *outward from inside* a component's own return statement. When the
*immediate enclosing JSX element* is itself a custom component or a
non-host control-flow component (`<KeyLabel>`, `<Show>`, presumably `<For>`
and `<Switch>` too), the walk treats that element exactly like a host element
that "settles the question on its own" — it never calls `isHostElement()` to
tell the two cases apart. So `<Show>` gets treated the same as `<box>` would:
a definite non-text boundary, when in fact (like any custom component) it is
exactly the unknowable case both rules already know to stay quiet about —
this is the AGENTS.md example verbatim: *"a text modifier returned from a
component could be wrapped at the call site."* One fix in `textContext()`
(check `isHostElement(name)` before deciding the walk is settled) would
resolve both rules' false positives at once, since both call the same
function.

### The `acceptable` findings

All 21 are `no-website-spacing` (`strict-only`), on real `padding`/`margin`/
`gap` values of 2 or 3 in OpenTUI's own interactive demos (`animation.tsx`,
`scroll.tsx`, `keymap.tsx`, and their Solid equivalents). This rule enforces
a house *policy*, not a defect — see `packages/lint/src/plugin.ts`'s own
comment on why the design-system rules sit in `strict` and not
`recommended`. OpenTUI's examples were written for readability, not to a
1-cell spacing budget, and nothing about them is broken. Correct rule,
deliberate code.

## How the tuiparts corpus is built

`registry.json` (tuiparts' shadcn-compatible registry manifest) names, for
every recipe, the exact `target` path its own CLI writes — always
`components/ui/<name>.tsx` for a recipe or `components/ui/theme.ts` /
`components/ui/use-theme.tsx` for the shared theme, one set per framework
(`core`, `react`, `solid`), plus five framework-agnostic theme presets under
`themes/`. `src/materialize-tuiparts.ts` reads that manifest and copies each
file to its declared target, once per framework it applies to — this is
*exactly* what running the tuiparts CLI three times (once per framework)
against an empty project would produce, read from the manifest rather than
guessed at.

That matters for one reason: it makes `components/ui/theme.ts` land exactly
where `opentui-lint`'s own `CONVENTIONAL_UI_DIRS` discovery in
`packages/lint/src/project/design-system.ts` already looks for it, with no
`settings.opentui.theme` override anywhere in this package's config — a real
consumer project would not have one either, and testing the escape hatch
instead of the default path would prove nothing about the default path. It
was confirmed, with a throwaway file placed next to (not inside)
`components/ui/`, that the theme really is discovered this way — the same
sibling file that draws `paddingX={2}` (which equals the theme's
`comfortablePaddingX` token) and a raw hex color matching a theme token *is*
flagged by `no-magic-density`/`use-theme-tokens`/`no-restyle`, proving these
rules are active and watching, not just silent because nothing was found.
Every file actually inside `components/ui/` triggers none of them.

tuiparts also ships its own smoke tests (`registry/*/smoke/{react,solid}.
test.tsx`) that render every recipe with real props. These are not install
targets (no `target` in the manifest), so they are linted straight from the
checkout with no materialization, as a second independent sample of expert
Solid/React OpenTUI code. They also produced zero findings.

## Framework detection

Every target relies on `opentui-lint`'s own detection — import, pragma, or
`tsconfig.json` `jsxImportSource` — with **no `settings.opentui.framework`
override anywhere in this package**. That was checked file by file while
building the corpus (see the exploration notes in the PR this package
shipped in): a handful of files in OpenTUI's own `examples/` directories
(`packages/react/examples/.plugin/slot-components.tsx`,
`packages/solid/examples/components/mouse-demo.tsx`, and a few others) carry
no direct `@opentui/react`/`@opentui/solid` import or pragma of their own —
but every one of them lives under a directory whose own `tsconfig.json` sets
`compilerOptions.jsxImportSource`, which `opentui-lint`'s tsconfig walk-up
finds correctly. No file in the corpus needed an override; if one had, that
would itself have been worth reporting as a detection gap.

## Files this package does not own

This package's job is to find and prove problems, not fix
`packages/lint`. The two false positives above are `packages/lint` bugs and
need a `packages/lint` change (plus new `packages/conformance` /
`packages/conformance-solid` cases per `AGENTS.md`'s rule for adding rule
behavior) — that is out of scope here by design, the same way a test suite
does not patch the code it tests.
