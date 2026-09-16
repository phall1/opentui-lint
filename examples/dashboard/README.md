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

`dashboard.fixed.tsx` is the same file after acting on the messages. Nothing in
that diff needed the OpenTUI docs — each error named its own replacement.

## One honest note

`{services.length} services` is reported, but only because of the literal text
` services` sitting next to it. On its own, `<box>{services.length}</box>` would
**not** be reported: a property access is not provably a string, and
[`text-must-be-wrapped`](../../docs/rules/text-must-be-wrapped.md) reports only
what it can prove. Catching that case needs type information, which is on
[the roadmap](../../docs/roadmap.md) as an opt-in tier.
