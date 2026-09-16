# `opentui/no-orphan-text-nodes`

Require text modifier elements to sit inside `<text>`.

## Why

`span`, `b`, `strong`, `i`, `em`, `u`, `br` and `a` are not renderables. They
build a `TextNodeRenderable`, which only a `TextRenderable` knows how to lay
out, so neither binding will place one anywhere else.

**React** refuses at construction, by name:

```ts
if (textNodeKeys.includes(type) && !hostContext.isInsideText) {
  throw new Error(`Component of type "${type}" must be created inside of a text node`)
}
```

**Solid** builds it and then fails on insert, with the same message it uses for
stray strings:

```text
Orphan text error: "" must have a <text> as a parent: box-3 above renderable-13
```

React's ErrorBoundary turns that into a stack trace over your app; Solid has no
boundary and the render throws. The diagnostic quotes the one your file will hit.

The names overlap with HTML, which is the trap. `<span className="badge">` gets
a type error on the prop and no warning at all about placement, and a bare
`<b>Total</b>` typechecks perfectly before taking down the render.

Unlike [`text-must-be-wrapped`](text-must-be-wrapped.md), this check is fully
decidable — element names are static — so it reports every case it can see.

## Examples

Incorrect:

```tsx
<box><b>Total</b></box>
<box><span fg="gray">hint</span></box>
<scrollbox><a href="https://example.com">docs</a></scrollbox>
```

Correct:

```tsx
<text><b>Total</b></text>
<text>Hi <span fg="gray">there</span></text>
<text><a href="https://example.com">docs</a></text>
<text>line<br />break</text>
```

## What it does not report

A modifier returned straight from a component, where the `<text>` may well be at
the call site:

```tsx
const Label = () => <b>bold</b>        // not reported
```
