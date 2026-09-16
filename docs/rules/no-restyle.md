# `opentui/no-restyle`

A component from your `components/ui` owns its color, border, typography,
padding and internal layout; a call site may only place it.

Not in `recommended`. Enable it directly, or use the `strict` preset.

This is the flagship design-system rule, the OpenTUI analogue of
`@shadcn/lint`'s `no-restyle`.

## Why it is `strict`, not `recommended`

[tuiparts](https://github.com/tuiparts/tuiparts) **deliberately permits
instance overrides**. Most recipes spread `{...props}` *after* applying their
themed defaults, and the Badge recipe's own README says so outright:

> Native root properties and `labelOptions` are applied after those defaults,
> so applications can customize an instance.

So nothing this rule reports is broken. `<Button backgroundColor="#22c55e" />`
works exactly as tuiparts intends it to. This rule is a **house policy a project
opts into on top of that**, not a repair for a defect, which is why it lives in
`strict` and not `recommended`: `recommended` is reserved for real defects, and
a style preference does not belong there however strongly a team wants it
enforced.

One thing is lost, and it is the only claim this rule makes as fact: a recipe
reads its theme values through `theme.subscribe`, re-rendering itself whenever
`theme.setActive(...)` runs. A color set directly at the call site is a plain
prop, not a subscription, so it does not move when the theme does. Overriding
`Button`'s `backgroundColor` pins that one instance outside the theme switch for
the rest of the app's life. That is the trade a project accepts when it enables
this rule.

## Examples

```tsx
<Button size="lg" marginTop={1} />          // fine — placement
<Button backgroundColor="#22c55e" />        // reported — the recipe owns this
```

Incorrect, with no `contracts` configured (the default: every owned category
is reported everywhere):

```tsx
<Button backgroundColor="#22c55e" />
<Panel border borderStyle="rounded" />
<Card font="tiny" showUnderline />
<Badge paddingX={2} />
<Toolbar gap={1} flexDirection="row" />

const boxStyle = { backgroundColor: "red" }
<Button style={boxStyle} />
```

Correct:

```tsx
<Button marginTop={1} width={20} alignSelf="center" />
<Button onPress={submit} content="Go" value="x" focused id="submit-btn" />
<Dialog.Content marginTop={1} />                       // flattens to "DialogContent"
```

## How a component is recognized as design-system-owned

Two things both have to be true:

1. **Capitalized JSX name.** `<box>` and `<text>` never qualify: every other
   rule in this package bails on those via `isHostElement`, and this rule is
   the one exception that looks the other way, at capitalized names instead.
2. **Imported from the project's `components/ui` directory**, resolved from
   the import specifier (`designSystemImports`), not from the name. A
   `Button` imported from `components/ui/button` is in scope under any local
   alias; a `Button` imported from anywhere else (`<For>` from `solid-js`,
   your own unrelated `<Card>`) is never in scope, however familiar the name
   looks.

`<Dialog.Content>` is flattened to `DialogContent` before it is checked
against a contract, so one `{ pattern: "^DialogContent$" }` entry covers both
that and a hypothetical plain `<DialogContent>` export. Which import owns it
is still resolved from the base identifier, `Dialog`, before the dot.

The rule is silent with no design system in the project at all, and silent
inside the design system's own source (`components/ui/**`, the theme module, and
anything that imports `./theme` relatively). See
[`design-system.ts`](../../packages/lint/src/project/design-system.ts) for what
"own source" means precisely.

### What this misses

Resolving ownership from the import specifier is textual, not a real module
resolver: the published package has zero runtime dependencies, so there is
no compiler API available at lint time. A design-system component
re-exported through a barrel this scan cannot see through (`export * from
"./ui"` two directories away from the literal `components/ui` path) will not
be recognized, and nothing is reported for it. That is a false negative, not
a false positive, and is the trade this package always makes when it cannot
prove something.

## Prop categories

Only five categories are ever reported. Everything else is always the call
site's and is never classified at all: placement (`marginTop`, `width`,
`height`, `position`, `top`/`right`/`bottom`/`left`, `zIndex`, `alignSelf`,
`flexGrow`/`flexShrink`/`flexBasis`, `min*`/`max*`) and behaviour (`onPress`
and friends, `content`, `value`, `focused`, `id`, `ref`, `children`, …).

| Category        | Props                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| `color`          | Every prop the catalog generates as color-carrying (`backgroundColor`, `bg`, `fg`, `color`, `borderColor`, `titleColor`, `selectionBg`, …) |
| `border`         | `border`, `borderStyle`, `customBorderChars`                          |
| `typography`     | `font`, `showUnderline`                                               |
| `spacing`        | `padding`, `paddingX`/`paddingY`, `paddingTop`/`Right`/`Bottom`/`Left` |
| `internalLayout` | `gap`, `rowGap`, `columnGap`, `flexDirection`, `alignItems`, `justifyContent`, `flexWrap` |

`margin*` is placement, not `spacing`: it is the call site placing the
component, not the component's own box model. `borderColor` is `color` rather
than `border`, because the catalog's generated `COLOR_PROPS` list is the source
of truth for which props carry a color and a hand-split would drift from it.
`title` and `titleAlignment` are content, not `border`; `<Panel title="Logs">`
is an ordinary, expected use of a recipe and is never reported.

Both surfaces are checked: a direct attribute (`<Button backgroundColor="red" />`)
and a `style={{ … }}` object, inline or hoisted to a `const` (`resolveObjectExpression`
follows the identifier back to its declaration the same way every other
style-aware rule in this package does).

## Options

```js
"opentui/no-restyle": ["error", {
  contracts: [
    { pattern: "^Badge$", allow: ["color"] },
    { pattern: "^Panel$", deny: ["border"], message: "Panel's border is load-bearing; use a different component." },
  ],
  message: "Restyle Button by adding a variant, not a raw prop.",
}]
```

### `contracts`

An ordered list of `{ pattern, allow, deny, message }`. Ported from
`@shadcn/lint`'s contract engine, whose semantics already solved this well;
only the vocabulary changes, from Tailwind class categories to the five prop
categories above.

- **`pattern`** is a regex tested against the *resolved* (dot-flattened)
  component name. `^Button$` matches only `Button`; `Button` (no anchors)
  also matches `IconButton`.
- **`allow`/`deny`** are lists drawn from `color`, `border`, `typography`,
  `spacing`, `internalLayout`.
- **Contracts are tried last-to-first; the first match wins outright.**
  Nothing merges across two matching contracts: the most specific rule you
  wrote last is the one that applies, in full, on its own.
- **Deny beats allow** within whichever single contract wins.
- **The omitted-vs-empty table**, applied to whichever contract matched (or
  to the built-in baseline when none did):
  - neither `allow` nor `deny` → every owned category is reported. This is
    the rule's default posture for any component with no contract at all.
  - `deny` alone → everything *except* what is denied is allowed
    (deny-by-exception).
  - `allow` alone → only the listed categories are allowed.
- **`message`** on a contract replaces the built-in explanation for
  components it matches. A top-level `message` (sibling to `contracts`) is
  the fallback for a matching contract that sets none of its own.

### Config errors

An invalid regex in `pattern`, or an `allow`/`deny` entry that names no real
category (a typo like `"colour"`), is a **config error**: reported once, at
line 1, naming exactly what is wrong. The rule then enforces nothing else for
that file. This is deliberate: a config mistake must never be silently
downgraded into "enforce less than the author wrote," because that failure
mode is invisible until someone goes looking for it.

## What it does not report

- Anything on a host element (`<box>`, `<text>`, …), because the selector only
  fires on capitalized JSX names.
- Anything on a component not imported from the project's `components/ui`
  directory, including a same-named component from an unrelated source.
- Placement and behaviour props, on any component, always: they are never
  classified into a category in the first place.
- A prop whose value cannot be reasoned about is still reported by presence,
  not by value: `no-restyle` does not need to know *what* color
  `backgroundColor="red"` sets, only that the call site set it. There is no
  "if the value happens to match a token" carve-out: the design-system half
  of this package that resolves a raw value back to its token is
  `use-theme-tokens`, a different rule with a different job.
- Anything inside the design system's own source, and anything at all when
  the project has no design system.
