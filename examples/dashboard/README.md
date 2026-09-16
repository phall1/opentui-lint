# Example: a dashboard a model would write

`dashboard.tsx` is an OpenTUI deploy dashboard written with web reflexes. It
renders a red React stack trace where a dashboard should be.

```bash
bun install
bun run lint
bunx tsc --noEmit -p tsconfig.json
```

**TypeScript finds one problem:**

```text
dashboard.tsx(34,13): error TS2322: Type '{ children: ReactNode; key: string;
className: string; onClick: () => void; backgroundColor: string; padding: number; }'
is not assignable to type 'BoxProps'.
  Property 'className' does not exist on type 'BoxProps'.
```

It does not mention `onClick` on the same element, and it does not say what to
write instead.

**opentui-lint finds fifteen:**

| Rule | Count | In this file |
| --- | --- | --- |
| `no-unknown-elements` | 2 | `<div>`, `<p>` — both throw `Unknown component type` |
| `text-must-be-wrapped` | 2 | `services` and `All systems nominal` outside `<text>` |
| `no-orphan-text-nodes` | 2 | two `<b>` outside `<text>` |
| `valid-colors` | 3 | `slate`, `indigo`, `rgb(100, 116, 139)` — all render magenta |
| `no-web-props` | 3 | `className`, `onClick`, `borderRadius` |
| `no-website-spacing` | 3 | `gap={2}`, `padding={4}`, `padding={2}` |

Six of those fifteen stop the render outright. Three more render the wrong
color. Only one was visible to the type checker.

## Most of it fixes itself

```bash
bun run lint -- --fix
```

Seven of the fifteen are gone, automatically:

```diff
-      <div>
-        <b>Deploys</b>
-      </div>
+      <box>
+        <text><b>Deploys</b></text>
+      </box>

-        <p>All systems nominal</p>
+        <text>All systems nominal</text>

-            backgroundColor={service.id === selected ? "indigo" : "transparent"}
+            backgroundColor={service.id === selected ? "#4b0082" : "transparent"}

-      <box borderColor="rgb(100, 116, 139)" border>
+      <box borderColor="#64748b" border>
```

Note what the fixer did *not* do. It changed only the `"indigo"` branch of the
ternary, not the whole expression. It wrapped `<b>Deploys</b>` in one `<text>`
rather than leaving it stranded. And it left `{services.length} services` alone
— that run has an untypeable expression against it, so wrapping only the half we
can prove would be half a fix, and it is offered as a suggestion instead.

The eight that remain all need a human decision:

| Rule | Count | Why not automatic |
| --- | --- | --- |
| `no-website-spacing` | 3 | clamping `padding={4}` to `1` is a design opinion |
| `no-web-props` | 3 | `className`, `onClick`, `borderRadius` — deleting code is your call |
| `valid-colors` | 1 | `slate` is a Tailwind name spanning ten shades; `#64748b` is offered |
| `text-must-be-wrapped` | 1 | the ambiguous run described above |

`dashboard.fixed.tsx` is the same file after acting on all of them. Nothing in
that diff needed the OpenTUI docs — each error named its own replacement.

## One honest note

`{services.length} services` is reported, but only because of the literal text
` services` sitting next to it. On its own, `<box>{services.length}</box>` would
**not** be reported: a property access is not provably a string, and
[`text-must-be-wrapped`](../../docs/rules/text-must-be-wrapped.md) reports only
what it can prove. Catching that case needs type information, which is on
[the roadmap](../../docs/roadmap.md) as an opt-in tier.
