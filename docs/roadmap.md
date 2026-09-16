# Roadmap

The shipped rules are the correctness half: things that crash, or render wrong,
with no type error. The rest of the plan is the design-system half — the part
that corresponds to what `@shadcn/lint` does for Tailwind.

## Design-system rules

These need a project model (which components are yours, where the theme lives),
not just an AST.

### `no-restyle`

The direct analog of `@shadcn/lint`'s flagship rule. A component from your
`components/ui` owns its colors, padding and border; a call site may only place
it.

```tsx
<Button size="lg" marginTop={1} />          // allowed: layout
<Button backgroundColor="#22c55e" />        // reported: the recipe owns this
```

Needs per-component contracts, as shadcn does:

```js
"opentui/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^Button$", allow: ["layout", "marginTop", "marginBottom"] },
    { pattern: "^Panel$", allow: ["layout"], deny: ["border*"] },
  ],
}]
```

[tuiparts](https://github.com/tuiparts/tuiparts) is the obvious first target:
its Recipes install into `components/ui` through the shadcn CLI, exactly the
layout this rule expects.

### `use-theme-tokens`

tuiparts ships a consumer-owned Theme Recipe with a real semantic contract:

```ts
export interface Tokens {
  colors: { background, surface, foreground, border, focus, primary, destructive, … }
  glyphs: { check, radio, thumb, track }
  borders: { style: "single" | "rounded" | "double" | "heavy" }
  density: { paddingX: number; comfortablePaddingX: number }
}
```

That is a lintable design system. Discover `components/ui/theme.ts`, read the
token tree, and report raw values where a token exists — resolving the hex to
the nearest token so the message can name it:

```text
backgroundColor="#1a1d23" is the value of tokens.colors.surface.
Use `tokens.colors.surface` from components/ui/theme.ts so the theme switch
reaches this box.
```

This is where `valid-colors` and `no-website-spacing` graduate from "is this
value legal" to "is this value *yours*".

### `no-magic-density`

`paddingX={1}` where `tokens.density.paddingX` exists. Same mechanism as above,
applied to spacing.

## Correctness rules still to write

- **`no-inert-values`** — values that typecheck and are then ignored at runtime:
  `position="static"` (`PositionTypeString` includes it, renderable validation
  does not implement it) and `"auto"` on `minWidth`/`maxWidth`/`minHeight`/
  `maxHeight` (in the public interface, ignored by the runtime). Both are
  documented upstream as gaps between the types and the implementation, which
  makes them precisely a linter's job.
- **`require-registration`** — `<qrcode>` without `registerQRCode()` from
  `@opentui/qrcode/react`. Same failure mode as an unknown element, but the fix
  is an import and a call rather than a different tag.
- **`require-focus`** — an `<input>`, `<select>` or `<textarea>` that nothing
  ever focuses is unreachable: no pointer to click it with, and no keyboard
  route in. Needs care to avoid false positives on keymap-driven apps.
- **`no-raw-stdout`** — `process.stdout.write` outside the renderer corrupts the
  frame. (`console.log` is fine: OpenTUI captures it into the console overlay.)

## Tooling

- **Oxlint JS plugin entry.** The rule objects are already
  ESLint/Oxlint-compatible; what is missing is the packaging and a test that
  runs the suite under `oxlint`. OpenTUI's own repo uses oxlint, so this is the
  linter its users already have.
- **A `strict` type-aware tier.** `text-must-be-wrapped` reports only provable
  text today. With `@typescript-eslint`'s type information it could resolve
  `{label}` and catch the rest — as an opt-in tier, since it costs a program.
- **An eval suite.** `@shadcn/lint` measures itself by running agents on tasks
  and counting violations before and after lint feedback. The same measurement
  is the honest way to claim these messages actually help.
