# `opentui/no-raw-stdout`

Disallow writing directly to stdout while a renderer owns the screen.

## Why

This was verified against a real pty, because the test renderer's stdout is a
sink and cannot show it.

With the default `screenMode: "alternate-screen"`, `externalOutputMode` is
`"passthrough"` and OpenTUI leaves `process.stdout.write` completely alone:

```text
AFTER createCliRenderer: process.stdout.write === baseline fn ? true
```

So a raw write lands verbatim on the same fd as the frame — **outside** the
synchronized-update block (`ESC[?2026h … ESC[?2026l`), with no cursor save or
restore — wherever the last frame happened to leave the cursor. Raw pty bytes:

```text
M1 -> M2  a real frame       : ESC[?2026h ESC[?25l ESC[1;1H … BBBB … ESC[?2026l
M2 -> M3  stdout.write("RAWZZZ") : RAWZZZ          ← bare, mid-frame
M3 -> M4  two full render loops  : (0 bytes)
```

Those zero bytes are the real problem. OpenTUI diffs against its own in-memory
buffer, which the raw write never touched, so **it never repaints those cells**.
The corruption is permanent, not a flicker.

## Examples

Incorrect:

```ts
process.stdout.write(`\rprogress ${done}/${total}`)
process.stderr.write("warning\n")
```

Correct:

```ts
// OpenTUI replaces the global console and captures it into the debug overlay.
console.log(`progress ${done}/${total}`)
```

or render it, which is the point of having a TUI:

```tsx
<text>progress {done}/{total}</text>
```

## `console.log` is fine

Deliberately not reported. OpenTUI swaps the global console for one that writes
into its own capture, and `renderer.console.show()` displays it. That is the
supported way to print from inside a running app.

## The one safe configuration

`screenMode: "split-footer"` with `externalOutputMode: "capture-stdout"` installs
a real interceptor — verified: `stdout.write.name === "interceptStdoutWrite"`,
and writes become `EXTERNAL_OUTPUT` events instead of bytes. That is not the
default, and requesting it in any other screen mode throws:

```text
externalOutputMode "capture-stdout" requires screenMode "split-footer"
```

If your app uses that mode, turn this rule off.

## Options

A CLI entrypoint that prints before the renderer starts is legitimate:

```js
"opentui/no-raw-stdout": ["error", { allowInFiles: ["src/bin/", "\\.cli\\.ts$"] }]
```
