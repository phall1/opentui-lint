# `require-focus` — rejected

The roadmap proposed: _"An `<input>`, `<select>` or `<textarea>` that nothing
ever focuses is unreachable: no pointer to click it with, and no keyboard
route in."_ It already flagged the risk: _"needs care to avoid false
positives on keymap-driven apps."_

This rule was not built. The premise it rests on is false for the default
configuration of every OpenTUI app, not just keymap-driven ones, and a
file-local AST rule has no way to see the information that would make it
true or false for a given file. Tuning cannot fix that: the inputs the rule
would need do not exist in the file it inspects.

## What was verified, and how

All of the following was checked against the real `@opentui/core` /
`@opentui/react` source (`0.5.11`) and by running code against
`testRender` + `createMockMouse` from `@opentui/core/testing`, not by
reading docs.

### (a) Clicking an `<input>` with no `focused` prop focuses it, by default

```tsx
const setup = await testRender(
  <box width={40} height={10}>
    <input id="in1" placeholder="type here" />
  </box>,
  { width: 40, height: 10 },
);
await setup.renderOnce();
const r = setup.renderer.root.findDescendantById("in1");
// before click: focusable=true focused=false

const mouse = createMockMouse(setup.renderer);
await mouse.click(r.x + 1, r.y);
await setup.renderOnce();
// after click: focused=true
// renderer.currentFocusedRenderable === input? true
```

Printed output (`bun test focus-probe.test.tsx`):

```
before click: focusable=true focused=false
after click at (1,0): focused=true
renderer.currentFocusedRenderable === input? true
```

This is implemented in `packages/core/src/renderer.ts`,
`CliRenderer.dispatchMouseEvent`:

```ts
if (
  this.autoFocus &&
  event.type === "down" &&
  event.button === MouseButton.LEFT &&
  !event.defaultPrevented
) {
  let current: Renderable | null = target;
  while (current) {
    if (current.focusable) {
      current.focus();
      break;
    }
    current = current.parent;
  }
}
```

`autoFocus` defaults to `true` (`this.autoFocus = config.autoFocus ?? true`,
`renderer.ts:1222`), and mouse handling itself (`useMouse`) also defaults to
`true` (`renderer.ts:1221`). Both are constructor options passed to
`createCliRenderer`/the renderer config, not JSX props, and not necessarily
even in the same file as the `<input>`. An app has to actively
opt out of both defaults (`useMouse: false`, seen for real in
`packages/examples/src/split-footer-streaming-demo.ts` and
`split-footer-image-demo.ts`) for click-to-focus to stop working.

**"No pointer to click it with" is false by default.** The rule's
premise only holds for the minority of apps that explicitly disable mouse
handling, and that fact lives in a different file (the renderer setup) that
the rule cannot see.

### (b) No built-in keyboard focus traversal exists

Searched `packages/core/src` for `focusNext`, `focusPrevious`,
`nextFocusable` and `tabIndex`: none exist. `"tab"` only appears as a parsed
key name (`parse.keypress.ts`) and as an `EditorCapture` enum value used
_inside_ a single edit buffer (tab-vs-navigate inside one textarea), not as
cross-renderable focus movement. Verified by dispatching a real Tab
keypress at the renderer:

```tsx
a.focus();
await setup.renderOnce();
// before Tab: a.focused=true b.focused=false

setup.renderer.stdin.emit("data", Buffer.from("\t"));
await setup.renderOnce();
// after Tab keypress: a.focused=true b.focused=false
```

Output:

```
before Tab: a.focused=true b.focused=false
after Tab keypress: a.focused=true b.focused=false
renderer.currentFocusedRenderable is a? true is b? false
```

Tab did nothing. Focus stayed on `a`. There is no keyboard route into an
unfocused input unless the app builds one.

### (c) Defaults on the elements themselves

`InputRenderable extends TextareaRenderable extends EditBufferRenderable`,
which declares `protected _focusable: boolean = true`. `SelectRenderable`
also declares `_focusable = true`. So `<input>`, `<select>`, and
`<textarea>` are focusable out of the box: `focusable` is not something an
author has to opt into, which is what makes (a) universal rather than
conditional. `focused` starts `false` and only flips on `.focus()` (from a
click, a ref, an effect, or a keymap handler), confirmed by the same test run
above (`focused=false` before any interaction).

### (d) `@opentui/keymap` never establishes focus itself

`packages/keymap/src/opentui.ts` reads focus, it doesn't set it:

```ts
const focused = renderer.currentFocusedRenderable
if (!focused || focused.isDestroyed || !focused.focused) { ... }
return focused
```

There is no `focusNext`/tab-cycle addon anywhere under
`packages/keymap/src/addons`. A keymap-driven "next field" binding has to
call `someRenderable.focus()` itself, in a command handler, which is the same
invisible-to-AST call as a ref or an effect (see (e)).
Keymap does not add a new failure mode here so much as confirm that focus
in this library is _always_ established by an imperative `.focus()` call
somewhere, whether that call is reachable by mouse (automatic), by an
effect, by a ref callback, or by a keymap command.

### (e) `renderable.focus()` from a ref/effect works, and a rule cannot trace it

Calling `.focus()` directly is exactly what the mouse-click path and any
keymap "next field" handler do internally, and it is public API
(`Renderable.focus()` in `packages/core/src/Renderable.ts`). The same test
run above proves it works (`a.focus()` → `a.focused === true`). A file-local
rule sees a `JSXElement` for `<input>` and, separately, perhaps a
`useRef`/`inputRef.current.focus()` call somewhere else in the file (or in
another file entirely, or inside a library's own component). Connecting
"this specific call targets this specific JSX element" is not an AST
question; it requires data-flow analysis this project deliberately keeps
out of file-local rules (see `AGENTS.md`: "When an AST cannot decide... the
rule stays quiet").

## Why no narrower version is safe either

The obvious fallback is to report only when a file has _zero_ mention of
`focused`, `focus(`, `useFocus`, `keymap`, or a ref anywhere. That is maximum
evidence of absence, and it is still unsound, for one reason that doesn't
shrink with more heuristics: **reachability by mouse click is the default,
and mouse click requires no code in the file at all.**

A bare component:

```tsx
const App = () => (
  <box>
    <input placeholder="name" />
  </box>
);
```

is fully reachable today, in the default OpenTUI configuration, by a plain
left click, with zero mentions of `focused`, `focus(`, `useFocus`, `keymap`,
or a ref anywhere in the file or the project. That is the common case, not a
keymap-app edge case, and it is a false positive
under any version of this rule that reports on absence-of-evidence,
because the evidence that matters (whether the _renderer_ was constructed
with `useMouse: false`/`autoFocus: false`) does not live in the JSX file at
all, and frequently not even in the same file as the renderer's own JSX
tree (renderer construction is typically in an entry-point file, separate
from the component that renders the `<input>`).

Restricting the rule to "only report when the _renderer setup_ in this same
file passed `useMouse: false` or `autoFocus: false`, and the file also has
no focus-establishing code" was considered and rejected too: it would
almost never fire (renderer config and input JSX are rarely co-located),
and on the rare file where it did fire, keyboard traversal absence (see (b))
still doesn't make the element definitely unreachable: a keymap handler
elsewhere in the project could call `.focus()` on it, which is (e) again.

There is no version of this rule, from "report broadly" to "report only on
maximum absence of evidence," that stays inside a false-positive rate this
project's own bar ("a false positive costs more than a missed case")
tolerates. Every version reports the default, correct, mouse-reachable case
as broken.

## What would have to change upstream for this to become viable

- OpenTUI would need to expose, statically or at least per-render, whether
  the _renderer instance backing this file's component tree_ has mouse
  handling and autofocus disabled. Today that is runtime renderer config,
  not discoverable from a single component file's AST.
- Or OpenTUI would need an opt-in "strict focus" mode that throws/warns at
  runtime when a focusable renderable is unmounted having never been
  focused and the renderer has no mouse handling, turning this into a
  runtime check (which can see the actual renderer config and the actual
  focus history) rather than a static one. A runtime check does not have
  the false-positive problem above because it observes what actually
  happened, not what the AST cannot prove happened.
- Short of that, a project-level rule that only runs when the project's own
  `createCliRenderer` call (found anywhere in the project, not just the
  current file) is known to pass `useMouse: false` might be arguable, but
  it requires a project model this package does not build for other rules
  either (see `docs/roadmap.md`'s design-system section on why those rules
  "need a project model... not just an AST") and was out of scope to build
  speculatively for a rule whose core premise is otherwise unsound.

## Verdict

Do not build `require-focus`. The failure mode the roadmap worried about
("false positives on keymap-driven apps") undersells the actual scope: the
rule is wrong by default, for the majority configuration of every OpenTUI
app, because mouse-click-to-focus needs no code at all to work. No amount
of narrowing the trigger condition removes that, because the fact that
would decide it, whether this renderer accepts mouse input, is not
observable from the file the rule inspects.
