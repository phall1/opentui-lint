import rule from "../src/rules/no-unknown-elements.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

tester().run("no-unknown-elements", asRule(rule), {
  valid: [
    "const a = <box><text>hi</text></box>",
    "const a = <scrollbox />",
    `const a = <ascii-font text="OPENTUI" />`,
    "const a = <tab-select />",
    "const a = <line-number />",
    // Runtime-only elements the JSX types never declare still render.
    "const a = <time-to-first-draw />",
    // Components are resolved by the module system, not the catalogue.
    "const a = <MyPanel />",
    "const a = <Layout.Sidebar />",
    // Registered at runtime, so the tag is real.
    `import { extend } from "@opentui/react"
     extend({ sparkline: SparklineRenderable })
     const a = <sparkline />`,
    {
      code: "const a = <sparkline />",
      settings: { opentui: { framework: "react", extendedElements: ["sparkline"] } },
    },
    {
      code: "const a = <custom />",
      options: [{ allow: ["custom"] }],
    },
  ],
  invalid: [
    {
      code: "const a = <div><text>hi</text></div>",
      output: "const a = <box><text>hi</text></box>",
      errors: [{ message: /<div> is an HTML element.*Use <box>/s }],
    },
    {
      code: `const a = <p>hello</p>`,
      output: `const a = <text>hello</text>`,
      errors: [{ message: /Use <text>/ }],
    },
    {
      // No single right answer, so it is described and never rewritten.
      code: `const a = <button onClick={f}>Go</button>`,
      output: null,
      errors: [{ message: /onMouseDown, or a Button recipe/ }],
    },
    {
      // Solid's spelling used in a React file: a pure rename.
      code: `const a = <ascii_font text="hi" />`,
      output: `const a = <ascii-font text="hi" />`,
      errors: [{ message: /is the @opentui\/solid spelling.*calls it <ascii-font>/s }],
    },
    {
      // A typo could equally be an unregistered custom renderable, so the
      // near-miss is offered rather than applied.
      code: "const a = <bax />",
      output: null,
      errors: [
        {
          message: /Did you mean <box>\?/,
          suggestions: [{ desc: "Rename to <box>", output: "const a = <box />" }],
        },
      ],
    },
  ],
})

tester("solid").run("no-unknown-elements (solid)", asRule(rule), {
  valid: [
    "const a = <ascii_font />",
    "const a = <tab_select />",
    // Present in Solid's runtime catalogue but missing from its .d.ts.
    "const a = <diff />",
    "const a = <line_number />",
  ],
  invalid: [
    {
      code: `const a = <ascii-font text="hi" />`,
      output: `const a = <ascii_font text="hi" />`,
      errors: [{ message: /is the @opentui\/react spelling.*calls it <ascii_font>/s }],
    },
    {
      // Solid's JSX does not inherit the DOM elements, but its index signature
      // still lets <div> through — same mistake, same answer, different reason.
      code: `const a = <div><text>hi</text></div>`,
      output: `const a = <box><text>hi</text></box>`,
      errors: [
        {
          message: /<div> is an HTML element.*string index signature for extend\(\).*\[Reconciler\] Unknown component type: div.*Use <box>/s,
        },
      ],
    },
    {
      code: `const a = <p>hi</p>`,
      output: `const a = <text>hi</text>`,
      errors: [{ message: /\[Reconciler\] Unknown component type: p/ }],
    },
  ],
})

undetectedTester().run("no-unknown-elements (not an OpenTUI file)", asRule(rule), {
  // A plain React component in the same repo must never be touched.
  valid: [
    `import React from "react"
     export const Page = () => <div className="grid"><p>Hello</p></div>`,
  ],
  invalid: [],
})
