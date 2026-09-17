# `opentui/no-magic-density`

A literal that equals a theme token should be the token.

Not in `recommended`. It needs a design system to check against (see
[Requires a design system](#requires-a-design-system)). Enable it directly, or
use the `strict` preset.

## Why

`components/ui/theme.ts` (the shape [tuiparts](https://github.com/tuiparts/tuiparts)
installs) builds a live theme store, and every recipe that reads a value
through a token follows the store when the project switches themes or swaps
in another preset. A literal does not, because there is nothing in a literal
for a theme change to re-read:

```tsx
<box paddingX={tokens.density.paddingX} />   // follows the theme
<box paddingX={1} />                          // renders identically today, forever after
```

Both lines render the same frame right now, if `tokens.density.paddingX` is
`1`. Nothing about the second line is a runtime error or a type error:
`paddingX` is typed `number`, and `1` is a perfectly good `number`. That is
why it needs a linter instead of the type checker: the literal is
_pinned_ to whatever the theme's value was when it was written, and stays
that way through every theme switch and preset swap from then on.

The same gap exists for a border style that matches `tokens.borders.style`,
and for a glyph string that matches an entry in `tokens.glyphs`.

## Examples

Incorrect, given a theme where `density.paddingX` is `1` and `glyphs.check`
is `"✓"`:

```tsx
<box paddingX={1} />
<box borderStyle="single" />
<text content="✓" />

const card = { paddingX: 1 }
<box style={card} />
```

Correct:

```tsx
<box paddingX={tokens.density.paddingX} />
<box borderStyle={tokens.borders.style} />
<text content={tokens.glyphs.check} />

// Solid reads the same store through the accessor call.
<box paddingX={tokens().density.paddingX} />
```

## What it does not report

- **No design system in scope.** If `components/ui/theme.ts` (or wherever
  `settings.opentui.theme` points) cannot be found, there is nothing to
  compare a literal against, so the rule reports nothing at all.
- **The design system's own source.** `components/ui/button.tsx` setting
  `paddingX={tokens.density.paddingX}` is the recipe doing its job, not a
  violation, and a preset theme file under `themes/` is forty lines of
  correct raw values by definition. Both are excluded.
- **Anything that isn't a static literal.** `tokens.density.paddingX`
  (React), `tokens().density.paddingX` (Solid's signal accessor), and
  `theme.get().density.paddingX` (Core) are all expressions rooted at the
  theme, not literals, and none of them are reported; they are the
  fix this rule asks for, not a violation of it. This is a real limitation
  of a rule with no type information: an expression that merely _looks_
  theme-shaped (`otherObject.density.paddingX`) is equally left alone,
  because there is no static way to tell it apart from the real thing.
- **A value no token has.** `paddingX={7}` is reported only if some density
  token is `7`. If none is, the rule has nothing provable to say, so it says
  nothing. This is not "close to" a token; it is compared for exact
  equality.
- **`0`.** Even if a theme names a token `0` (a `density.none` for "no
  spacing", say), a literal `0` is never reported. It is the universal
  "no spacing" value every terminal UI reaches for constantly; flagging it
  would be pure noise for the one case where the literal _is_ the right
  thing to write.
- **A prop this isn't about.** Density tokens are only compared against
  spacing props (`padding`, `paddingX`, `margin`, `gap`, and the rest of
  OpenTUI's spacing surface). `flexGrow={1}` is never compared to
  `density.paddingX` even though the number matches, because the prop has
  nothing to do with spacing. The same restriction applies to `borderStyle`
  and `content`: only those props are checked against `borders.style` and
  `glyphs`, respectively.

## Ambiguity

If two tokens share a value, the message names both instead of guessing
which one was meant:

```text
paddingX={1} on <box> equals more than one token in components/ui/theme.ts —
tokens.density.paddingX and tokens.density.gutter are all that value, and a
literal does not distinguish them. ...
```

Picking one of two equally-valid tokens would be exactly the kind of
unproven claim this rule exists to avoid making.

## Options

```js
"opentui/no-magic-density": ["error", {
  check: ["density", "borders", "glyphs"],   // the default; name a subset to check only those
}]
```

```js
// Only glyphs, e.g. because a project's spacing scale legitimately varies
// per screen and no-website-spacing already governs raw numbers.
"opentui/no-magic-density": ["error", { check: ["glyphs"] }]
```

## Requires a design system

This rule discovers `components/ui/theme.ts` by walking up from the linted
file (or reads `settings.opentui.theme`, if configured). Both mechanisms are
shared with the rest of the design-system rules and are described in
[the roadmap](../roadmap.md).
