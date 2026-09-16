# opentui-lint

**The OpenTUI mistakes TypeScript can't see.**

`opentui-lint` is an agent-first linter for [OpenTUI](https://github.com/anomalyco/opentui)
terminal apps. It catches the class of bug that typechecks cleanly, runs without
an error, and leaves you with a blank screen or a magenta panel.

It is to OpenTUI roughly what [`@shadcn/lint`](https://github.com/shadcn-ui/lint)
is to Tailwind design systems — with one difference in emphasis. shadcn's rules
mostly restate policies TypeScript *could* express, with better error messages.
Most of the rules here cover things TypeScript **cannot express at all**.

## Why TypeScript doesn't catch this

`JSX.IntrinsicElements` in both OpenTUI bindings carries a string index
signature — it has to, so `extend()` can register custom renderables:

```ts
export interface OpenTUIComponents {
  [componentName: string]: RenderableConstructor
}
```

The effect is that **every lowercase tag typechecks**. On top of that, the React
binding's interface extends `React.JSX.IntrinsicElements`, pulling in all 164
HTML element names with their full DOM prop types.

So this compiles:

```tsx
<div className="flex gap-4">
  <p>Ready</p>
</div>
```

and at runtime the reconciler throws `Unknown component type: div`, the binding's
ErrorBoundary catches it, and your app is replaced by a red React stack trace.

Here is the same measurement across 20 realistic mistakes, checked with
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

Six of twenty. Every failure in the top half is invisible until someone looks at
a running terminal — which, for an agent editing a TUI it never renders, is
never.

[`examples/dashboard`](examples/dashboard) is the same comparison on one
realistic file: a deploy dashboard written with web reflexes. `tsc` reports a
single error — `Property 'className' does not exist on type 'BoxProps'`, which
does not even mention the dead `onClick` on the same element. `opentui-lint`
reports fifteen, six of which stop the render outright.

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
is correct in one and fatal in the other. Every rule stays completely silent
unless the file gives positive evidence that its JSX compiles to a terminal:

1. `settings.opentui.framework`, if you set it
2. a `/** @jsxImportSource @opentui/react */` pragma in the file
3. an import from `@opentui/react` or `@opentui/solid`
4. `compilerOptions.jsxImportSource` in the nearest `tsconfig.json`, following
   `extends`

No evidence, no diagnostics. The plugin never guesses from the presence of JSX.

## Rules

| Rule | Catches | In `recommended` |
| --- | --- | --- |
| [`no-unknown-elements`](docs/rules/no-unknown-elements.md) | `<div>`, `<p>`, wrong-binding spellings, typos | error |
| [`text-must-be-wrapped`](docs/rules/text-must-be-wrapped.md) | strings and numbers outside `<text>` | error |
| [`no-orphan-text-nodes`](docs/rules/no-orphan-text-nodes.md) | `<b>`, `<span>`, `<a>` outside `<text>` | error |
| [`valid-colors`](docs/rules/valid-colors.md) | color values that render magenta | error |
| [`no-web-props`](docs/rules/no-web-props.md) | `className`, `onClick`, `boxShadow`, `data-*` | error |
| [`no-website-spacing`](docs/rules/no-website-spacing.md) | web-sized padding, margin and gap | off (in `strict`) |

`strict` is `recommended` plus `no-website-spacing`.

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
gives the replacement. That is the whole design brief: an agent should be able
to fix the code from the error text alone, without opening the OpenTUI docs.

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

Every fact the rules rely on — the element catalogue per binding, each element's
prop list, the 28 color names `parseColor()` accepts — is read out of a real
OpenTUI install by [`scripts/sync-catalog.ts`](packages/lint/scripts/sync-catalog.ts):

```bash
bun run catalog:sync            # regenerate from @opentui/*@latest
bun run catalog:check           # fail CI if the checked-in catalog is stale
```

It reads the JSX declarations with the TypeScript compiler API, asks each
binding's `getComponentCatalogue()` which tags it will really construct, and
probes the real `parseColor()` to find out which color names survive.

That last pair matters: at 0.5.11 Solid's runtime renders `<diff>` and
`<line_number>` that its own `.d.ts` never declares. A hand-written list would
report both as errors.

## Conformance

`packages/conformance` runs every diagnostic against an actual OpenTUI renderer
and asserts both halves of each claim: that the rule reports the snippet, and
that OpenTUI really does the thing the message describes.

```bash
bun run --filter opentui-lint-conformance test
```

If a future OpenTUI starts validating colors, or gives `<div>` a meaning, these
tests fail instead of the linter quietly lying to people.

## Status

Early. The rules and their messages are stable enough to use; the API may still
move. See [docs/roadmap.md](docs/roadmap.md) for what is planned — chiefly the
design-system half: `no-restyle` and theme-token rules for component libraries
like [tuiparts](https://github.com/tuiparts/tuiparts).

Not affiliated with OpenTUI or shadcn.

## License

MIT
