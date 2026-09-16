# `opentui/text-must-be-wrapped`

Require string and number children to sit inside `<text>`.

## Why

This is the most common way an OpenTUI app dies:

```tsx
<box>Hello</box>
```

Both bindings refuse it, by different routes.

**React** checks the host context before building the node, in
`createTextInstance`:

```ts
createTextInstance(text, rootContainerInstance, hostContext) {
  if (!hostContext.isInsideText) {
    throw new Error("Text must be created inside of a text node")
  }
  return TextNodeRenderable.fromString(text)
}
```

The binding's ErrorBoundary catches that and paints a stack trace over your app.

**Solid** has no such check. `createTextNode` builds the node happily, and the
failure surfaces later, on insert:

```text
Orphan text error: "Hello" must have a <text> as a parent: box-1 above text-node-1
```

There is no error boundary in the Solid binding, so the render throws outright.
Louder, and arguably better — but still at runtime, in a terminal, with no file
or line number.

The diagnostic quotes whichever of these your file will actually hit.

TypeScript cannot help with either. `children` is `React.ReactNode` /
`JSX.Element`, both of which include `string` and `number` — as they must, since
that is each framework's own contract.

## Examples

Incorrect:

```tsx
<box>Hello</box>
<box>{count}</box>
<box>{" "}</box>                       // an explicit JSX space still counts
<scrollbox>{`${count} items`}</scrollbox>
<box>{"Total: " + count}</box>
<box>{parts.join(", ")}</box>
```

Correct:

```tsx
<box><text>Hello</text></box>
<text>Total: {count}</text>
<box>{items.map((i) => <text key={i.id}>{i.label}</text>)}</box>
```

Whitespace between elements is fine — JSX drops whitespace-only text that spans
a newline, so it never reaches the reconciler:

```tsx
<box>
  <text>one</text>
  <text>two</text>
</box>
```

## What it deliberately does not report

Only text the rule can *prove* is text. An identifier could just as easily hold
an element:

```tsx
<box>{label}</box>                     // not reported
<box>{renderRow()}</box>               // not reported
<box>{items.map((i) => i.label)}</box> // not reported: `i.label` is not provably a string
```

Reporting those would need type information, and a rule that guesses wrong on
ordinary code is a rule people turn off. What *is* reported: literals, template
literals, string concatenation, conditionals whose branches are all text,
`&&` with a text right-hand side, and the string-returning methods
(`toString`, `toFixed`, `join`, `padStart`, `trim`, …).

If you want the stricter check, a typed lint pass (`@typescript-eslint` with
type information) is the right tool — this rule stays in the zero-config lane.

## How the context is decided

The *nearest enclosing JSX element* settles it, because that element is the
runtime parent. An outer `<text>` cannot reach through an intervening `<box>`:

```tsx
<text><box>Hello</box></text>          // still reported, and still throws
```

When the walk reaches a function without finding any enclosing element, the JSX
is a component's return value and where it gets mounted decides the answer —
unknowable, so the rule stays quiet:

```tsx
const Label = () => <>{"hi"}</>        // not reported
```

## Suggestion

The rule offers an editor suggestion that wraps the offending child in `<text>`.
It is not an autofix: wrapping is usually right, but sometimes the real fix is
to move the string into a sibling `<text>` with its own styling.
