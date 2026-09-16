# opentui-lint

**The OpenTUI mistakes TypeScript can't see.**

[![npm](https://img.shields.io/npm/v/opentui-lint?label=npm&color=cb3837)](https://www.npmjs.com/package/opentui-lint)
[![CI](https://github.com/phall1/opentui-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/phall1/opentui-lint/actions/workflows/ci.yml)
[![runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](https://github.com/phall1/opentui-lint/blob/main/AGENTS.md#the-dependency-boundary)
[![license](https://img.shields.io/npm/l/opentui-lint?color=blue)](https://github.com/phall1/opentui-lint/blob/main/LICENSE)

`opentui-lint` is an agent-first linter for [OpenTUI](https://github.com/anomalyco/opentui)
terminal apps. It catches the class of bug that typechecks cleanly, runs without
an error, and leaves you with a blank screen or a magenta panel.

**React and Solid are equal first-class targets.** They are not the same program
and they do not fail the same way, so the diagnostics differ. See
[Solid](#solid-is-not-react-with-different-spelling).

It is to OpenTUI roughly what [`@shadcn/lint`](https://github.com/shadcn-ui/lint)
is to Tailwind design systems, with one difference in emphasis. shadcn's rules
mostly restate policies TypeScript *could* express, with better error messages.
Most of the rules here cover things TypeScript **cannot express at all**.

## Why TypeScript doesn't catch this

`JSX.IntrinsicElements` in both OpenTUI bindings carries a string index
signature. It has to, so `extend()` can register custom renderables:

```ts
export interface OpenTUIComponents {
  [componentName: string]: RenderableConstructor
}
```

The effect is that **every lowercase tag typechecks**, in React and in Solid
alike. On top of that, the React binding's interface extends
`React.JSX.IntrinsicElements`, pulling in all 164 HTML element names with their
full DOM prop types.

OpenTUI's own `.oxlintrc.json` shows the shape of the gap from the other side.
It turns off the one generic rule that could have flagged unknown JSX props,
because OpenTUI's elements are not DOM elements:

```json
"rules": {
  "react/react-in-jsx-scope": "off",
  "react/no-unknown-property": "off"
}
```

That config is repo hygiene for OpenTUI's own source, and it is the right call
there. But it means the standard JSX lint rules have nothing to say about an app
built on OpenTUI. The escape hatch is a blunt "off", and the whole space
behind it is uncovered.

So this compiles:

```tsx
<div className="flex gap-4">
  <p>Ready</p>
</div>
```

and at runtime the reconciler throws `Unknown component type: div`, the binding's
ErrorBoundary catches it, and your app is replaced by a red React stack trace.

The same measurement across 20 realistic mistakes, checked with
`tsc --noEmit` against `@opentui/core@0.5.11`:

| Mistake | `tsc` | Runtime |
| --- | --- | --- |
| `<div>hello</div>` | passes | throws `Unknown component type: div` |
| `<box>Hello</box>` | passes | throws `Text must be created inside of a text node` |
| `<box>{count}</box>` | passes | same throw |
| `<box>{" "}</box>` | passes | same throw |
| `<b>bold</b>` outside `<text>` | passes | throws `must be created inside of a text node` |
| `<ascii_font>` in a React file | passes | throws `Unknown component type` |
| `backgroundColor="slate"` | passes | **renders magenta** |
| `backgroundColor="rgb(34,197,94)"` | passes | **renders magenta** |
| `fg="#GGGGGG"` | passes | **renders magenta** |
| `position="static"` | passes | silently ignored |
| `style={hoistedObject}` with `borderRadius` | passes | silently ignored |
| `padding={8} gap={4}` | passes | a third of an 80x24 screen on whitespace |
| `className="flex-1"` | **caught** | — |
| `onClick={…}` | **caught** | — |
| `flexWrap="nowrap"` | **caught** (`"no-wrap"`) | — |
| `width="100px"` | **caught** | — |
| `borderRadius={2}` inline | **caught** | — |
| `overflow="auto"` | **caught** | — |

Six of twenty. Every failure in the top half is invisible until someone looks
at a running terminal. An agent editing a TUI it never renders never looks.

[`examples/dashboard-react`](examples/dashboard-react) and
[`examples/dashboard-solid`](examples/dashboard-solid) are the same comparison on
one realistic file: a deploy dashboard written with web reflexes. `tsc` reports a
single error in each: `Property 'className' does not exist on type 'BoxProps'`,
which does not even mention the dead `onClick` on the same element.
`opentui-lint` reports fifteen and fourteen, six of which stop the render
outright.

## Solid is not React with different spelling

Both bindings reject the same code, by different routes and with different
errors. The linter quotes whichever one your file will hit.

| | React | Solid |
| --- | --- | --- |
| Unknown element | `Unknown component type: div` | `[Reconciler] Unknown component type: div` |
| Text outside `<text>` | `Text must be created inside of a text node` | `Orphan text error: "…" must have a <text> as a parent` |
| Where it fails | `createTextInstance`, before mount | `insertNode`, after the node is built |
| What you see | ErrorBoundary paints a stack trace over your app | no boundary — the render throws |
| Compound names | `ascii-font`, `tab-select`, `line-number` | `ascii_font`, `tab_select`, `line_number` |
| Events | `onMouseDown` | `onMouseDown`, plus `on:mousedown` |
| DOM elements in JSX | inherited from `React.JSX.IntrinsicElements` | not inherited, but the index signature lets them through anyway |

Writing `<div>` is the same mistake in both, so it gets the same answer,
`Use <box>`, with a different explanation of why the checker stayed quiet.
Copying a snippet between the two bindings is its own mistake, and
`no-unknown-elements` names it in both directions.

[`examples/dashboard-react`](examples/dashboard-react) and
[`examples/dashboard-solid`](examples/dashboard-solid) are the same file in both
bindings, and neither is the "main" one.

## Install

Requires Bun 1.4.1+ (or Node 20.19+) and ESLint 9.30+.

```bash
bun add -d opentui-lint eslint @typescript-eslint/parser
```

`eslint.config.mjs`:

```js
import tsParser from "@typescript-eslint/parser"
import { plugin as opentui, recommended } from "opentui-lint"

export default [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { opentui },
    rules: recommended,
  },
]
```

Then in `AGENTS.md`:

```md
After changing any TUI code, run `bun run lint` and fix every error.
```

## It only lints terminal code

A repo with an OpenTUI CLI *and* a web dashboard is the normal case, and `<div>`
is correct in one and fatal in the other. Every rule stays silent
unless the file gives positive evidence that its JSX compiles to a terminal:

1. `settings.opentui.framework`, if you set it
2. a `/** @jsxImportSource @opentui/react */` pragma in the file
3. an import from `@opentui/react` or `@opentui/solid`
4. `compilerOptions.jsxImportSource` in the nearest `tsconfig.json`, following
   `extends`

No evidence, no diagnostics. The plugin never guesses from the presence of JSX.

## Rules

**Correctness** — every one reports something a typecheck cannot see. All in `recommended`, all errors.

| Rule | Catches | Fixes |
| --- | --- | --- |
| [`no-unknown-elements`](docs/rules/no-unknown-elements.md) | `<div>`, `<p>`, wrong-binding spellings, typos | ✅ |
| [`text-must-be-wrapped`](docs/rules/text-must-be-wrapped.md) | strings and numbers outside `<text>` | ✅ |
| [`no-orphan-text-nodes`](docs/rules/no-orphan-text-nodes.md) | `<b>`, `<span>`, `<a>` outside `<text>` | ✅ |
| [`valid-colors`](docs/rules/valid-colors.md) | color values that render magenta | ✅ |
| [`no-web-props`](docs/rules/no-web-props.md) | `className`, `onClick`, `boxShadow`, `data-*` | ✅ |
| [`no-unsupported-values`](docs/rules/no-unsupported-values.md) | `position="static"`, `minWidth="auto"`, `width={-1}` | — |
| [`require-registration`](docs/rules/require-registration.md) | `<qr-code>` without `registerQRCode()` | — |
| [`no-raw-stdout`](docs/rules/no-raw-stdout.md) | `process.stdout.write` corrupting the frame | — |

**Design system** — in `strict`, not `recommended`. Each reports code that *works*; they enforce where styling decisions live, which is a policy a project chooses rather than a defect.

| Rule | Catches |
| --- | --- |
| [`no-restyle`](docs/rules/no-restyle.md) | a call site restyling a component its library owns |
| [`use-theme-tokens`](docs/rules/use-theme-tokens.md) | a raw color where the theme owns colors |
| [`no-magic-density`](docs/rules/no-magic-density.md) | a literal that is really `tokens.density.paddingX` |
| [`no-website-spacing`](docs/rules/no-website-spacing.md) | web-sized padding, margin and gap |

The three that need a theme go quiet on their own in a project without one, so
`strict` costs nothing extra there.

Three of the correctness rules come from values the types actively bless.
`position="static"` is in `PositionTypeString` but `isPositionTypeType` rejects
it, so it silently becomes `"relative"`. On a *change* the setter returns early,
so a renderable toggled from `"absolute"` to `"static"` **stays absolute**.
`minWidth="auto"` is in the option type and dropped by `isSizeType`.
`alignItems="space-between"` typechecks and lays out identically to
`"flex-end"`. All three confirmed by rendering them against a control tree.

## `{label}`: the opt-in type-aware tier

`text-must-be-wrapped` reports text it can *prove* is text. `<box>{label}</box>`
is the most common real crash and syntax alone cannot judge it: `label` could
equally be an element. Turn on the type checker and it can.

```js
"opentui/text-must-be-wrapped": ["error", { checkTypes: true }]
```

It decides on TypeScript's type flags, never a printed name: a union is text
only if every non-nullish member is a string/number/literal type. So
`string | undefined` reports and `ReactNode` does not. With no
`parserOptions.project` configured it degrades to the syntactic result rather
than throwing. Trying the option before wiring a tsconfig is the obvious first
move and must not explode.

It costs no dependency. The checker is reached structurally through the parser
services, so the package still installs nothing.

## What the errors look like

```text
<div> is an HTML element and OpenTUI has no renderable for it. It only
typechecks because @opentui/react's JSX namespace extends React's DOM elements;
at render it throws "Unknown component type: div" and the ErrorBoundary replaces
your app with a stack trace. Use <box>.
```

```text
backgroundColor="slate" will render magenta. "slate" is not one of OpenTUI's
color names, so it resolves to opaque magenta. This never fails typecheck —
ColorInput is just `string | RGBA` — and at runtime it only warns.
Use a hex string such as "#22c55e", or one of: aqua, black, blue, brightBlack, …
```

```text
padding={4} on <box> spends 4 rows and columns of empty cells inside the box.
OpenTUI measures in whole terminal cells, not pixels — on an 80x24 terminal that
is 17% of the height. Terminal UIs are information-dense; keep padding at 1 or
less, and separate panels with a border rather than empty space.
```

Each one names the runtime failure, says why the type checker was quiet, and
gives the replacement. An agent should be able to fix the code from the error
text alone, without opening the OpenTUI docs.

## Settings

```js
settings: {
  opentui: {
    framework: "react",              // skip detection
    extendedElements: ["sparkline"], // registered via extend() elsewhere
    note: "See DESIGN.md for our terminal layout rules.",
  },
}
```

`note` is appended to every diagnostic, so house rules travel with the error.

Elements registered with `extend({ sparkline: SparklineRenderable })` **in the
linted file** are picked up automatically; `extendedElements` is only needed
when registration happens somewhere the linter cannot see.

## The catalog is generated, not transcribed

Every fact the rules rely on (the element catalogue per binding, each element's
prop list, the 28 color names `parseColor()` accepts) is read out of a real
OpenTUI install by [`scripts/sync-catalog.ts`](packages/lint/scripts/sync-catalog.ts):

```bash
bun run catalog:sync            # regenerate from @opentui/*@latest
bun run catalog:check           # fail CI if the checked-in catalog is stale
```

It reads the JSX declarations with the TypeScript compiler API, asks each
binding's `getComponentCatalogue()` which tags it will really construct, and
probes the real `parseColor()` to find out which color names survive.

At 0.5.11 Solid's runtime renders `<diff>` and `<line_number>` that its own
`.d.ts` never declares. A hand-written list would report both as errors.

## Conformance

Two packages run every diagnostic against a real OpenTUI renderer and assert
both halves of each claim: that the rule reports the snippet, and that OpenTUI
really does the thing the message describes.

```bash
bun run --filter 'opentui-lint-conformance*' test
```

They are separate packages because the two JSX pipelines cannot share a process:
`@opentui/solid` compiles JSX through its own Bun preload. The Solid suite
additionally asserts that no Solid diagnostic quotes React's wording, which is
how the messages stay honest as the bindings drift apart.

Two more suites guard the claims on this page. `packages/oxlint-conformance`
runs every rule under the real oxlint binary and fails if a rule ships without
an oxlint case. `packages/examples-conformance` pins the numbers the example
READMEs quote (the totals, the per-rule breakdowns, what `--fix` resolves, and
the verbatim diagnostics), so a rule change cannot quietly turn them into
fiction.

If a future OpenTUI starts validating colors, or gives `<div>` a meaning, these
tests fail instead of the linter quietly lying to people.

## Oxlint

The rule objects work unmodified as an Oxlint JS plugin, which matters because
OpenTUI's own repo uses oxlint:

```json
{
  "jsPlugins": ["./node_modules/opentui-lint/dist/index.js"],
  "settings": { "opentui": { "framework": "react" } },
  "rules": { "opentui-lint/no-unknown-elements": "error" }
}
```

Verified against oxlint 1.83. Its JS plugin API is still alpha, so treat this as
working-but-young; ESLint is the better-tested path today.

## Status

Early. The rules and their messages are stable enough to use; the API may still
move. See [docs/roadmap.md](docs/roadmap.md) for what shipped, what was
rejected, and what is left.

Not affiliated with OpenTUI or shadcn.

## License

MIT
