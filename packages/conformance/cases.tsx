/** @jsxImportSource @opentui/react */

import type { ReactNode } from "react";

/**
 * One conformance case: a snippet that opentui-lint reports, paired with the
 * thing OpenTUI actually does with it.
 *
 * `source` is the exact text handed to the linter and `element` is the same
 * markup handed to a renderer, so a case cannot drift out of agreement with
 * itself without one of the two assertions failing.
 */
export interface Case {
  name: string;
  rule: string;
  /** The snippet, as the linter sees it. */
  source: string;
  /** The same snippet, as the renderer sees it. */
  element: ReactNode;
  /** What OpenTUI does with it at runtime. */
  outcome:
    | { kind: "error-boundary"; contains: string }
    | { kind: "magenta"; value: string }
    | { kind: "inert-prop"; prop: string };
}

const styleWithShadow = { boxShadow: "0 1px 2px" } as any;

export const cases: Case[] = [
  {
    name: "an HTML element has no renderable behind it",
    rule: "no-unknown-elements",
    source: `const App = () => <div><text>hi</text></div>`,
    element: (
      <div>
        <text>hi</text>
      </div>
    ),
    outcome: { kind: "error-boundary", contains: "Unknown component type: div" },
  },
  {
    name: "the other binding's element spelling is not in this catalogue",
    rule: "no-unknown-elements",
    source: `const App = () => <ascii_font text="HI" />`,
    element: <ascii_font text="HI" />,
    outcome: { kind: "error-boundary", contains: "Unknown component type: ascii_font" },
  },
  {
    name: "a string child outside <text> stops the render",
    rule: "text-must-be-wrapped",
    source: `const App = () => <box>Hello</box>`,
    element: <box>Hello</box>,
    outcome: { kind: "error-boundary", contains: "Text must be created inside of a text node" },
  },
  {
    name: "an interpolated number outside <text> stops the render",
    rule: "text-must-be-wrapped",
    source: "const App = () => <box>{3}</box>",
    element: <box>{3}</box>,
    outcome: { kind: "error-boundary", contains: "Text must be created inside of a text node" },
  },
  {
    name: "an explicit JSX space outside <text> stops the render",
    rule: "text-must-be-wrapped",
    source: 'const App = () => <box>{" "}</box>',
    element: <box> </box>,
    outcome: { kind: "error-boundary", contains: "Text must be created inside of a text node" },
  },
  {
    name: "an array of strings outside <text> stops the render",
    rule: "text-must-be-wrapped",
    source: 'const App = () => <box>{["a", "b"].join(", ")}</box>',
    element: <box>{["a", "b"].join(", ")}</box>,
    outcome: { kind: "error-boundary", contains: "Text must be created inside of a text node" },
  },
  {
    name: "a text modifier outside <text> stops the render",
    rule: "no-orphan-text-nodes",
    source: `const App = () => <box><b>Total</b></box>`,
    element: (
      <box>
        <b>Total</b>
      </box>
    ),
    outcome: { kind: "error-boundary", contains: "must be created inside of a text node" },
  },
  {
    name: "an unknown color name renders magenta instead of failing",
    rule: "valid-colors",
    source: `const App = () => <box backgroundColor="slate" />`,
    element: <box backgroundColor="slate" width={4} height={1} />,
    outcome: { kind: "magenta", value: "slate" },
  },
  {
    name: "a CSS color function renders magenta instead of failing",
    rule: "valid-colors",
    source: `const App = () => <box backgroundColor="rgb(34, 197, 94)" />`,
    element: <box backgroundColor="rgb(34, 197, 94)" width={4} height={1} />,
    outcome: { kind: "magenta", value: "rgb(34, 197, 94)" },
  },
  {
    name: "a malformed hex renders magenta instead of failing",
    rule: "valid-colors",
    source: `const App = () => <text fg="#GGGGGG">x</text>`,
    element: <text fg="#GGGGGG">x</text>,
    outcome: { kind: "magenta", value: "#GGGGGG" },
  },
  {
    name: "a web prop is stored on the renderable and never read",
    rule: "no-web-props",
    source: `const App = () => <box className="flex-1" />`,
    element: <box id="web-prop-case" {...({ className: "flex-1" } as any)} />,
    outcome: { kind: "inert-prop", prop: "className" },
  },
  {
    name: "a CSS-only style key is stored on the renderable and never read",
    rule: "no-web-props",
    source: `const panel = { boxShadow: "0 1px 2px" }
const App = () => <box style={panel} />`,
    element: <box id="css-prop-case" style={styleWithShadow} />,
    outcome: { kind: "inert-prop", prop: "boxShadow" },
  },
];
