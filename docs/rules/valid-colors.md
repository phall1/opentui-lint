# `opentui/valid-colors`

Disallow color values OpenTUI silently renders as magenta.

`parseColor()` lives in `@opentui/core`, so this rule behaves identically in
React and Solid.

## Why

`parseColor()` accepts 28 names plus hex. Anything else it cannot read does not
throw — it warns and returns opaque magenta:

```ts
if (!/^[0-9A-Fa-f]{6}$/.test(hex) && !/^[0-9A-Fa-f]{8}$/.test(hex)) {
  console.warn(`Invalid hex color: ${hex}, defaulting to magenta`)
  return RGBA.fromValues(1, 0, 1, 1)
}
```

Nothing else surfaces it. `ColorInput` is `string | RGBA`, so the type checker
has no opinion; the app runs; the only symptom is a magenta panel. And the
warning itself lands in the console overlay, not your scrollback — for an agent
editing a TUI it never renders, the failure is completely invisible.

The names that do work:

```
black  white  red  green  blue  yellow  cyan  magenta
silver  gray  grey  maroon  olive  lime  aqua  teal  navy  fuchsia  purple  orange
brightBlack  brightRed  brightGreen  brightBlue
brightYellow  brightCyan  brightMagenta  brightWhite
transparent
```

Everything a web palette trains you to reach for — `slate`, `zinc`, `indigo`,
`pink`, `emerald`, `lightgray` — is not on that list.

## Examples

Incorrect:

```tsx
<box backgroundColor="slate" />           // magenta
<text fg="indigo">x</text>                // magenta
<box backgroundColor="rgb(34, 197, 94)" />// magenta: no CSS color functions
<box borderColor="var(--accent)" />       // magenta
<text fg="#GGGGGG">x</text>               // magenta: not hex
```

Correct:

```tsx
<box backgroundColor="#101418" />
<box backgroundColor="#22c55e80" />       // #RGB, #RGBA, #RRGGBB, #RRGGBBAA
<text fg="brightBlack">x</text>
<box borderColor="gray" />
<box backgroundColor={tokens.colors.surface} />
```

## The blind spot it closes

Excess-property checking only applies to fresh object literals, so hoisting a
style into a `const` — exactly how shared styles get written — takes TypeScript
out of the picture entirely. The rule follows `const` identifiers into their
object literal:

```tsx
const panel = { backgroundColor: "slate" }
<box style={panel} />                     // reported
```

## Scope

Static strings only. A computed value is the `RGBA` path and out of reach of a
syntactic check:

```tsx
<box backgroundColor={parseColor(input)} />   // not reported
```

## Options

```js
"opentui/valid-colors": ["error", { props: ["accentColor"] }]
```

`props` adds prop names to the built-in list (`backgroundColor`, `borderColor`,
`bg`, `fg`, `color`, `focusedBorderColor`, `selectionBg`, …). Useful for custom
renderables with their own color props.

## Keeping the palette honest

The accepted list is not transcribed from the docs — it is produced by probing
the real `parseColor()` with a superset of CSS color names and keeping whatever
does not fall back to magenta. See `packages/lint/scripts/sync-catalog.ts`.
