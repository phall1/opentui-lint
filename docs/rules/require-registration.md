# `opentui/require-registration`

Require the registration call for elements that are not in the default catalogue.

## Why

`@opentui/qrcode` ships a renderable but does not add it to the catalogue when
you import it. You have to call `registerQRCode()`. Verified:

```text
has "qr-code" before:                                      false
has "qr-code" after importing @opentui/qrcode/react only:  false
has "qr-code" after registerQRCode():                      true
```

Forget the call and the render throws `Unknown component type: qr-code`, which
the React binding's ErrorBoundary turns into a full-screen stack trace, taking
the siblings that rendered fine with it.

The failure is identical to an unknown element, but the fix is different: an
import and a call, not a different tag. So it gets its own rule
and its own message rather than being lumped in with typos.

## Examples

Incorrect:

```tsx
import { QRCodeRenderable } from "@opentui/qrcode";

const App = () => <qr-code content="https://example.com" />;
```

Correct:

```tsx
import { registerQRCode } from "@opentui/qrcode/react";

registerQRCode();

const App = () => <qr-code content="https://example.com" />;
```

The call may appear anywhere in the file: nothing is reported until the whole
file has been walked, because putting the registration below the component is
normal.

## Element names differ by binding

|               | React                   | Solid                   |
| ------------- | ----------------------- | ----------------------- |
| element       | `qr-code`               | `qr_code`               |
| register from | `@opentui/qrcode/react` | `@opentui/qrcode/solid` |

## The only package with this pattern

A sweep of every `register*` export in the OpenTUI workspace found `@opentui/qrcode`
is the only one that registers a JSX element. `@opentui/keymap`'s many `register*`
functions add keybindings; `@opentui/three` has no JSX surface at all; and
`time-to-first-draw` self-registers on import, so it is already in the catalogue.

## Options

When registration happens somewhere this file cannot see, such as a shared
bootstrap module:

```js
"opentui/require-registration": ["error", { registered: ["qr-code"] }]
```
