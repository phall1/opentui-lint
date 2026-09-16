# `opentui/no-website-spacing`

Keep padding, margin and gap within a terminal-sized budget.

Not in `recommended`. Enable it directly, or use the `strict` preset.

Terminal cells are terminal cells, so this rule behaves identically in React
and Solid.

## Why

OpenTUI's own agent skill opens with this instruction:

> Design for a terminal app, not a browser. Use the available columns and rows
> efficiently.
>
> - Do not use gaps between adjacent UI panels.
> - Do not add unnecessary margins or padding.
> - Prefer compact, information-dense layouts over website-style card spacing.

Models trained on web UI do not follow it, and prose in a skill file cannot
enforce it. `padding={4}` reads as a comfortable 16px in Tailwind muscle memory.
Here it is four whole rows and four whole columns — on the 80x24 terminal that
is still the safe assumption, one such box spends a sixth of the vertical space
on nothing, and a page of them is unusable.

Nothing about this is a runtime error, which is exactly why it needs a linter:
the app works, it just looks like a web page that wandered into a terminal, and
the reviewer notices long after the agent has moved on.

This is the design-system half of `opentui-lint` — the part that corresponds to
`@shadcn/lint`'s `no-restyle`. See [the roadmap](../roadmap.md) for the rest.

## Examples

With the defaults (`padding`, `margin` and `gap` capped at `1`):

Incorrect:

```tsx
<box padding={4} />
<box marginTop={3} />
<box gap={2} flexDirection="row" />

const card = { padding: 4 }
<box style={card} />
```

Correct:

```tsx
<box padding={1} />
<box border><text>Logs</text></box>       // a border, not empty space
<box paddingX={tokens.density.paddingX} />
```

Only numeric literals are budgeted. A value read from a theme is the outcome
this rule is pushing you toward, so it is never reported.

## Options

```js
"opentui/no-website-spacing": ["error", {
  maxPadding: 1,
  maxMargin: 1,
  maxGap: 1,
  message: "Use the density tokens from components/ui/theme.ts.",
}]
```

`message` replaces the built-in explanation entirely, so a project with its own
density scale can point at it instead:

```text
Use the density tokens from components/ui/theme.ts.
```

## Tuning it

`1` is deliberately tight. A full-screen app with one outer chrome box often
wants `padding={1}` on that box and `0` everywhere inside. If your house style
allows a roomier shell, raise the cap rather than disabling the rule — the value
is in the cap existing at all.
