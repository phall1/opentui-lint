# `opentui/no-web-props`

Disallow web and CSS props that OpenTUI silently ignores.

## Why

An unrecognized prop on an OpenTUI element does not throw and does not warn. The
reconciler's fallback branch is a bare assignment:

```ts
default:
  instance[propKey] = propValue
```

So `className="flex-1"` sets a dead field on a renderable and your layout stays
wrong. `onClick` is worse: the handler is stored, never wired to an event, and
the button does nothing forever.

TypeScript does catch most of these when they are written directly on an
element, and this rule still earns its place there by replacing
`Property 'className' does not exist on type 'BoxProps'` with the prop you
actually want. But TypeScript stops catching them the moment the props go
through a style object held in a variable, which is how shared styles are
normally written.

## Examples

Incorrect:

```tsx
<box className="flex-1" />                     // no class names in OpenTUI
<box onClick={go} />                           // use onMouseDown
<box onMouseEnter={f} />                       // use onMouseOver
<box data-testid="panel" />                    // cells carry no attributes
<box style={{ borderRadius: 2 }} />            // use borderStyle="rounded"
<box display="flex" />                         // layout is always flex

const panel = { boxShadow: "0 1px 2px", fontSize: 14 }
<box style={panel} />                          // tsc is blind here
```

Correct:

```tsx
<box flexGrow={1} backgroundColor="#101418" />
<box onMouseDown={go} />
<box onMouseOver={f} />
<box borderStyle="rounded" border />
<input focused onInput={set} onSubmit={go} />
```

## The replacements it knows

| Web                             | OpenTUI                                                |
| ------------------------------- | ------------------------------------------------------ |
| `className` / `class`           | the layout and color props directly                    |
| `onClick`                       | `onMouseDown`, or `onSelect` on an interactive element |
| `onMouseEnter` / `onMouseLeave` | `onMouseOver` / `onMouseOut`                           |
| `onMouseWheel`                  | `onMouseScroll`                                        |
| `onFocus` / `onBlur`            | the `focused` prop, `useFocus`, `useBlur`              |
| `hidden`                        | `visible={false}`                                      |
| `src`                           | `source` on `<image>`                                  |
| `tabIndex`                      | `focused` and the focus APIs                           |
| `display`                       | `flexDirection`, or `visible={false}`                  |
| `borderRadius`                  | `borderStyle="rounded"`                                |
| `fontWeight` / `fontStyle`      | `<b>` / `<i>` inside `<text>`, or `attributes`         |
| `whiteSpace`                    | `wrapMode` on `<text>`                                 |
| `gridTemplateColumns`           | nested boxes with `flexDirection`                      |
| `transition`                    | a timeline from `useTimeline`                          |

`fontSize`, `fontFamily`, `letterSpacing`, `lineHeight`, `boxShadow`,
`textShadow`, `cursor` and `transform` have no equivalent: a terminal cell grid
has no sub-cell geometry and the terminal owns the font.

## Solid's `on:` syntax is left alone

Solid's reconciler routes any `on:x` prop straight to `node.on("x", …)` on the
renderable's event emitter:

```ts
if (name.startsWith("on:")) {
  const eventName = name.slice(3)
  if (value) node.on(eventName, value)
  ...
}
```

That is a real binding, not a dead prop, so the rule never reports it in a Solid
file. In a React file `on:click` is not special and falls through to the unknown
prop path.

## Options

```js
"opentui/no-web-props": ["error", {
  allow: ["className"],
  checkUnknownProps: false,
}]
```

`checkUnknownProps` additionally reports any prop absent from the element's own
generated type. It is **off by default** because a renderable added through
`extend()` can legitimately accept anything, and because the prop lists come
from a pinned OpenTUI version: a project on a newer release would see false
positives on new props. Turn it on when your OpenTUI version matches the
catalog's and you want the stricter sweep.
