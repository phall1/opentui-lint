# `opentui/no-unknown-elements`

Disallow JSX elements OpenTUI cannot render.

## Why

Both bindings declare `JSX.IntrinsicElements` with a string index signature so
that `extend()` can add custom renderables:

```ts
export interface OpenTUIComponents {
  [componentName: string]: RenderableConstructor
}
```

That signature makes every lowercase tag typecheck. The React binding goes
further and extends `React.JSX.IntrinsicElements`, so all 164 HTML element
names are in scope with their DOM prop types.

At render, the reconciler looks the tag up in its catalogue:

```ts
if (!components[type]) {
  throw new Error(`Unknown component type: ${type}`)
}
```

The binding wraps the tree in an ErrorBoundary, so the failure never reaches
your terminal's scrollback. Your entire app is replaced by a red React stack
trace, with no file and no line number.

## Examples

Incorrect:

```tsx
<div><text>Ready</text></div>          // Unknown component type: div
<p>Ready</p>                           // Unknown component type: p
<ascii_font text="HI" />               // Solid's spelling in a React file
<bax />                                // typo
```

Correct:

```tsx
<box><text>Ready</text></box>
<text>Ready</text>
<ascii-font text="HI" />               // React spelling
```

## Three kinds of message

The rule distinguishes the mistakes, because the fixes differ:

- **An HTML element.** Reports the OpenTUI equivalent: `div` → `box`,
  `p` → `text`, `img` → `image`, `pre` → `code`.
- **The other binding's spelling.** React hyphenates compound names
  (`ascii-font`, `tab-select`, `line-number`); Solid uses underscores
  (`ascii_font`, `tab_select`, `line_number`). Copying a snippet between the two
  is a common and silent mistake.
- **A typo.** Reports the nearest catalogue entry within an edit-distance
  budget, or lists the catalogue when nothing is close.

## Custom renderables

An `extend()` call in the same file registers its keys automatically:

```tsx
import { extend } from "@opentui/react"
extend({ sparkline: SparklineRenderable })

<sparkline series={data} />            // fine
```

When registration happens elsewhere, list the names once:

```js
settings: { opentui: { extendedElements: ["sparkline"] } }
```

## Options

```js
"opentui/no-unknown-elements": ["error", { allow: ["my-element"] }]
```

## When not to use it

If your project registers elements dynamically from data the linter cannot read,
prefer `allow` or `extendedElements` over disabling the rule: it is the only
thing standing between `<div>` and a blank terminal.
