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
That is louder and arguably better, but it still happens at runtime, in a
terminal, with no file or line number.

The diagnostic quotes whichever of these your file will hit.

TypeScript cannot help with either. `children` is `React.ReactNode` /
`JSX.Element`, both of which include `string` and `number`, as they must, since
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

Whitespace between elements is fine: JSX drops whitespace-only text that spans
a newline, so it never reaches the reconciler:

```tsx
<box>
  <text>one</text>
  <text>two</text>
</box>
```

## What it does not report

Only text the rule can *prove* is text. An identifier could equally hold an
element:

```tsx
<box>{label}</box>                     // not reported
<box>{renderRow()}</box>               // not reported
<box>{items.map((i) => i.label)}</box> // not reported: `i.label` is not provably a string
```

Reporting those needs type information, which
[`checkTypes`](#checktypes-closing-the-gap-with-type-information) below adds.
Without it the rule stays quiet: a rule that guesses wrong on ordinary code is a
rule people turn off. What *is* reported: literals, template literals, string
concatenation, conditionals whose branches are all text, `&&` with a text
right-hand side, and the string-returning methods (`toString`, `toFixed`,
`join`, `padStart`, `trim`, …).

## `checkTypes`: closing the gap with type information

```jsonc
{ "opentui/text-must-be-wrapped": ["error", { "checkTypes": true }] }
```

Off by default. With it on, and only when your ESLint config already resolves
types (`parserOptions.project` or `parserOptions.projectService` pointing at
a real tsconfig), the rule also reports an expression whose *resolved type* is
definitely text, even where the syntax alone could not prove it:

```tsx
declare const label: string
declare const count: number
declare const total: string | undefined

<box>{label}</box>                     // reported — resolved type is `string`
<box>{count}</box>                     // reported — resolved type is `number`
<box>{total}</box>                     // reported — `undefined` renders nothing,
                                        // but the `string` branch still crashes
```

It stays quiet on the case the syntactic rule was built to leave alone: a
value whose type could be an element:

```tsx
declare const child: ReactNode

<box>{child}</box>                     // not reported — ReactNode includes elements
```

The rule for "definitely text" is a type, not its printed name: a union is
text only when every member that isn't `undefined`/`null` is itself text
(`string`, `number`, a string/number literal, or a template literal type).
One element, object, `any`, or `unknown` member anywhere in the union aborts
the whole check, which is what keeps `ReactNode` (and any union shaped like
it) unreported.

Solid signals work the same way despite being accessors rather than plain
values: `<box>{count()}</box>` is checked against the *call's* return type,
so `count: Accessor<string>` is reported and `count: Accessor<JSX.Element>`
is not.

If `checkTypes` is on but there is no type checker to ask (no `project` /
`projectService` configured, a non-TypeScript parser, or oxlint, which has no
type information at all), this tier does nothing. It never reports, and it
never crashes; the rule behaves exactly as it does with the option off.

One gap: a diagnostic from this tier has no `<text>`-wrapping fix or
suggestion attached, unlike the syntactic tier. Grouping stray children into
one `<text>` run (so a fix does not silently split one line into several) is
itself syntactic, so a catch that only type information could prove has no
run to attach a fix to.

## How the context is decided

The *nearest enclosing JSX element* settles it, because that element is the
runtime parent. An outer `<text>` cannot reach through an intervening `<box>`:

```tsx
<text><box>Hello</box></text>          // still reported, and still throws
```

When the walk reaches a function without finding any enclosing element, the JSX
is a component's return value and where it gets mounted decides the answer.
That is unknowable, so the rule stays quiet:

```tsx
const Label = () => <>{"hi"}</>        // not reported
```

## Suggestion

The rule offers an editor suggestion that wraps the offending child in `<text>`.
It is not an autofix: wrapping is usually right, but sometimes the real fix is
to move the string into a sibling `<text>` with its own styling.
