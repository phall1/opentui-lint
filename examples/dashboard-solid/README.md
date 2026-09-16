# Example: the dashboard in Solid

Solid is not React with different spelling, and the linter does not pretend it
is. This is the same dashboard as [`../dashboard-react`](../dashboard-react),
with the same web reflexes and a different set of runtime consequences.

```bash
bun install
bun run lint
```

Note there is **no `settings.opentui.framework`** in `eslint.config.mjs`. The
framework comes from this directory's `tsconfig.json`
(`"jsxImportSource": "@opentui/solid"`), exactly as it would in a real project.

## What differs between the bindings

| | React | Solid |
| --- | --- | --- |
| Unknown element | `Unknown component type: div` | `[Reconciler] Unknown component type: div` |
| Text outside `<text>` | `Text must be created inside of a text node` | `Orphan text error: "…" must have a <text> as a parent` |
| Where it fails | `createInstance` / `createTextInstance` | `createElement` / `insertNode` |
| What you see | ErrorBoundary paints a red stack trace over your app | no boundary — the render throws |
| Compound element names | `ascii-font`, `tab-select`, `line-number` | `ascii_font`, `tab_select`, `line_number` |
| Event syntax | `onMouseDown={…}` | `onMouseDown={…}` and `on:mousedown={…}` |

So the same `<div>` produces a different message here:

```text
<div> is an HTML element and OpenTUI has no renderable for it. It typechecks
because @opentui/solid's JSX namespace has a string index signature for
extend(); at render it throws "[Reconciler] Unknown component type: div" and
there is no error boundary, so the render throws. Use <box>.
```

And the cross-binding mistake runs the other way — this file's last line is the
React spelling in a Solid file:

```text
<ascii-font> is the @opentui/react spelling. This file renders with
@opentui/solid, which calls it <ascii_font>. Rendering <ascii-font> throws
"[Reconciler] Unknown component type: ascii-font".
```

Every string quoted above is asserted against a real `@opentui/solid` render in
[`packages/conformance-solid`](../../packages/conformance-solid).

## One thing Solid makes worse

Solid has no ErrorBoundary. In React a bad tag replaces your app with a stack
trace; in Solid the render throws and takes the process with it. The crash is
louder, which is arguably better — but it still happens at runtime, in a
terminal, with no file or line number.
