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
      errors: [{ message: /<div> is an HTML element.*Use <box>/s }],
    },
    {
      code: `const a = <p>hello</p>`,
      errors: [{ message: /Use <text>/ }],
    },
    {
      code: `const a = <button onClick={f}>Go</button>`,
      errors: [{ message: /Use <box with onMouseDown, or a Button recipe>|onMouseDown/ }],
    },
    {
      // Solid's spelling used in a React file.
      code: `const a = <ascii_font text="hi" />`,
      errors: [{ message: /is the @opentui\/solid spelling.*calls it <ascii-font>/s }],
    },
    {
      code: "const a = <bax />",
      errors: [{ message: /Did you mean <box>\?/ }],
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
      errors: [{ message: /is the @opentui\/react spelling.*calls it <ascii_font>/s }],
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
