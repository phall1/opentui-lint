# `opentui/use-theme-tokens`

A raw color where the theme owns colors.

Not in `recommended`. It needs a design system to check against — see
[Requires a design system](#requires-a-design-system) — and enable it directly,
or use the `strict` preset.

This is the color half of the pairing with [`no-magic-density`](./no-magic-density.md),
which covers `density`, `borders` and `glyphs`. Colors get their own rule
because they need their own honesty about what can and cannot be proven — see
[Two tiers](#two-tiers) below.

## Why

A recipe that reads its colors through a token follows the theme store when
the project switches modes or swaps in another preset:

```tsx
<box backgroundColor={tokens.colors.primary} />   // re-reads on every theme change
<box backgroundColor="#4b7bec" />                  // renders identically today, forever after
```

`components/ui/theme.ts` (the shape [tuiparts](https://github.com/tuiparts/tuiparts)
installs) builds its store with `createThemeStore`, and every consumer of it —
`useTheme()` in React, the accessor in Solid — subscribes through
`theme.subscribe`. A literal has nothing in it for a theme change to re-read:
it typechecks identically to a token read, because `ColorInput` is just
`string | RGBA`, and it renders correctly right up until someone calls
`theme.setActive(...)` or flips light/dark mode, at which point this one
instance stops moving while the rest of the app does.

## Two tiers

tuiparts' default theme is built entirely from `RGBA.fromIndex(8)` and
`RGBA.defaultBackground()` — values that only resolve once a terminal decides
its own palette. Read `readThemeTokens` in `src/project/design-system.ts` and
its tests: on a stock install, `tokens.colors` comes back `{}`. There is
usually nothing to reverse-match a hex literal against, and even a project
that ships a preset with real hex in `themes/*.ts` only proves that value sits
in that file — not that `theme.setActive()` has ever pointed at it.

So the rule reports two different things, and says which one it's doing:

- **Tier 1 — the theme owns colors here.** No token is named, because none can
  be proven:

  ```text
  backgroundColor="#123456" is a raw color literal, but this project's theme
  (../../components/ui/theme.ts) owns colors. ColorInput is just
  `string | RGBA`, so a literal typechecks exactly like a token read and
  nothing catches the difference. The theme re-reads its colors through
  `theme.subscribe` on every change; a literal here pins this instance so a
  theme switch never reaches it. Read the color from a token in the theme
  instead.
  ```

- **Tier 2 — the exact token, named.** Only when the literal is an exact,
  case-insensitive match for a color that really is spelled out somewhere —
  the active theme, or a preset under a sibling `themes/` directory:

  ```text
  backgroundColor="#3C3836" is a raw color literal, but #3C3836 is
  tokens.colors.surface under the gruvbox theme. ... Use `colors.surface`
  from the theme instead of the literal.
  ```

  "under the gruvbox theme" means exactly what it says: this value is
  `tokens.colors.surface` in `themes/gruvbox.ts`. It is not a claim that
  gruvbox is the theme running right now — the rule has no way to know that,
  and does not pretend to.

There is no nearest-color matching, on purpose. With roughly half the default
palette resolved from the terminal's own ANSI colors, "closest" is not a fact,
it is a guess dressed up as one, and this plugin does not ship those.

If a literal matches more than one token — two colors landing on the same
white is ordinary — every match is named instead of picking one:

```text
backgroundColor="#112233" is a raw color literal that equals more than one
token — tokens.colors.accentA under the duplicate theme and
tokens.colors.accentB under the duplicate theme are all #112233, and a
literal does not distinguish which one was meant. ...
```

## Examples

Incorrect, given the gruvbox preset from the examples above:

```tsx
<box backgroundColor="#123456" />
<box backgroundColor="red" />
<box backgroundColor="#3C3836" />

const panel = { backgroundColor: "#83A598" }
<box style={panel} />
```

Correct:

```tsx
<box backgroundColor={tokens.colors.primary} />
<box backgroundColor={tokens().colors.primary} />           // Solid's accessor
<box backgroundColor={theme.get().colors.primary} />        // Core, direct store read
<box style={{ backgroundColor: tint(tokens.colors.focus, tokens.colors.foreground, 0.3) }} />
<box backgroundColor="transparent" />
```

## What it does not report

- **No design system in scope.** If `components/ui/theme.ts` (or wherever
  `settings.opentui.theme` points) cannot be found, there is nothing to check
  against, so the rule reports nothing at all.
- **The design system's own source.** A recipe under `components/ui` setting
  `backgroundColor={tokens.colors.primary}` is doing its job, and a preset
  theme file is forty lines of raw hex that is also entirely correct — it has
  no JSX in it for this rule to visit in the first place. Both are excluded.
- **`"transparent"`.** It is a structural value ("nothing here"), not a color
  choice, and recipes use it constantly.
- **An expression with a token reference anywhere in it.** `tokens.colors.primary`,
  `tokens().colors.primary`, `theme.get().colors.primary`, and
  `tint(tokens.colors.focus, tokens.colors.foreground, 0.3)` are all left
  alone — a computed value is still a token if a token went into computing it.
  This is deliberately generous: `tokens.colors.primary ?? "#3366ff"` is not
  reported either, because the presence of a token elsewhere in the same
  expression is not proof the fallback is wrong, and guessing that it is would
  be exactly the kind of claim this rule exists to avoid.
- **A value `valid-colors` already owns.** `backgroundColor="slate"` or
  `backgroundColor="#GGGGGG"` render magenta — that is `valid-colors`'
  diagnostic, not this rule's. This rule only ever looks at colors that parse
  successfully; reporting the same line twice for two different reasons would
  be worse than reporting it once.
- **Anything that isn't a static string.** `backgroundColor={pickColor()}` is
  a call this rule cannot evaluate, and it is left alone rather than guessed
  at — the same scope `valid-colors` uses for the same reason.

## Requires a design system

This rule discovers `components/ui/theme.ts` by walking up from the linted
file (or reads `settings.opentui.theme`, if configured) — the same discovery
every design-system rule shares, outlined in [the roadmap](../roadmap.md).
Tier 2 adds one more walk of its own, from that theme's directory upward,
looking for a sibling `themes/` folder to check literal colors against; that
part is specific to this rule, since colors are the one token category the
default theme ships with none of.
