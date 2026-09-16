# `opentui/no-unsupported-values`

Disallow values OpenTUI's types accept but its runtime ignores or rejects.

These are all `@opentui/core` behaviours, so they apply identically to React and
Solid — only the negative-dimension message differs, because the two bindings
surface a throw differently.

## Why

OpenTUI's option interfaces are wider than the validators that gate the
assignments. `PositionTypeString` includes `"static"`, but:

```ts
export function isPositionTypeType(value: any): value is PositionTypeString {
  return value === "relative" || value === "absolute"   // "static" is missing
}
```

An unvalidated value falls off the end of an `if` with no `else`. Nothing is
assigned, nothing is logged, and the type checker already told you it was fine.

Every case below was confirmed by rendering it and comparing computed geometry
against a control tree that differs in exactly one prop. See
`packages/conformance/unsupported-values.test.tsx`.

## `position="static"`

Silently becomes `"relative"` at construction — and on a *change* the setter
returns early instead of assigning, so it is **sticky**:

```
initial position="absolute"  -> _positionType: "absolute"
update  position="static"    -> _positionType: "absolute"   ← unchanged
update  position="relative"  -> _positionType: "relative"
```

So a component that toggles between `"absolute"` and `"static"` never leaves
absolute positioning. Use `"relative"`, or drop the prop.

## `"auto"` on `minWidth` / `minHeight` / `maxWidth` / `maxHeight`

Typed as `number | "auto" | \`${number}%\``, but `isSizeType` rejects `"auto"`
for these four, so the constraint is dropped entirely. Verified: the computed
box is identical to omitting the prop, while `minWidth={12}` and `maxWidth={1}`
are both honored.

Note `"auto"` **does** work on `width`, `height`, `margin*` and `flexBasis` —
those are different validators. Only the four min/max dimensions drop it.

## `alignItems="space-between"` (and `space-around`, `space-evenly`)

These are members of `AlignString`, so they typecheck, and they are not ignored
— they are just not what they look like. `alignItems` positions children on the
cross axis, where there is nothing to distribute, so Yoga puts the child flush
to the end. Verified: identical geometry to `alignItems="flex-end"`.

Use `justifyContent` for distribution along the main axis.

## Negative dimensions

`width={-1}` typechecks, because the option is `number`. At render it throws:

```text
Invalid width for Renderable box-3: -1
```

In React that throw happens inside the reconciler's commit, so it never reaches
your code — the ErrorBoundary catches it and paints a TypeError where your app
should be. Solid has no boundary, so the render throws.

## What it does not report

Enum values that are outside the union entirely — `flexWrap="nowrap"`,
`overflow="auto"`, `justifyContent="stretch"`. Those fall back silently at
runtime too, but **TypeScript already rejects them**, on direct attributes,
through a hoisted style object, *and* through a spread. (Excess *unknown* props
still slip through a hoisted object — that is a different mechanism, and
[`no-web-props`](no-web-props.md) covers it.) Reporting what `tsc` already
reports would be noise.

The one exception worth knowing: `borderStyle="dashed"` is the only enum in the
codebase that warns rather than failing silently —
`Invalid borderStyle "dashed", falling back to "single".` — and `tsc` rejects it
anyway.
