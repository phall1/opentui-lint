import rule from "../src/rules/no-web-props.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

tester().run("no-web-props", asRule(rule), {
  valid: [
    `const a = <box flexGrow={1} backgroundColor="#101418" />`,
    `const a = <box onMouseDown={go} />`,
    `const a = <input focused onInput={set} onSubmit={go} />`,
    `const a = <box borderColor="#101418" />`,
    // Unknown props on a registered custom renderable are the author's business.
    `import { extend } from "@opentui/react"
     extend({ sparkline: SparklineRenderable })
     const a = <sparkline series={data} smoothing={2} />`,
    // Off by default, so an unrecognized-but-harmless prop is not reported.
    `const a = <box someFutureProp={1} />`,
    {
      code: `const a = <box className="x" />`,
      options: [{ allow: ["className"] }],
    },
  ],
  invalid: [
    {
      // A pure rename: same meaning, different name.
      code: `const a = <box onMouseEnter={f} />`,
      output: `const a = <box onMouseOver={f} />`,
      errors: [{ message: /The OpenTUI name is `onMouseOver`/ }],
    },
    {
      code: `const a = <box onMouseLeave={f} onMouseWheel={g} />`,
      output: `const a = <box onMouseOut={f} onMouseScroll={g} />`,
      errors: 2,
    },
    {
      // `source` exists on <image>, so the rename applies there.
      code: `const a = <image src="./logo.png" />`,
      output: `const a = <image source="./logo.png" />`,
      errors: [{ message: /The OpenTUI name is `source`/ }],
    },
    {
      // …but not on a <box>, where neither name means anything.
      code: `const a = <box src="./logo.png" />`,
      output: null,
      errors: [
        {
          message: /Use `source` on <image>/,
          suggestions: [{ desc: "Remove `src`", output: `const a = <box />` }],
        },
      ],
    },
    {
      // Dead props are offered for removal rather than deleted outright.
      code: `const a = <box className="flex-1" />`,
      output: null,
      errors: [
        {
          message: /does nothing on <box>.*OpenTUI has no class names/s,
          suggestions: [{ desc: "Remove `className`", output: `const a = <box />` }],
        },
      ],
    },
    {
      code: `const a = <box onClick={go} />`,
      output: null,
      errors: [
        {
          message: /Use `onMouseDown`/,
          suggestions: [{ desc: "Remove `onClick`", output: `const a = <box />` }],
        },
      ],
    },
    {
      code: `const a = <box data-testid="panel" />`,
      output: null,
      errors: [
        {
          message: /Terminal cells carry no attributes/,
          suggestions: [{ desc: "Remove `data-testid`", output: `const a = <box />` }],
        },
      ],
    },
    {
      code: `const a = <box aria-label="Panel" />`,
      output: null,
      errors: [
        {
          message: /Terminal cells carry no attributes/,
          suggestions: [{ desc: "Remove `aria-label`", output: `const a = <box />` }],
        },
      ],
    },
    {
      // A style key is not an attribute, so there is nothing to remove cleanly.
      code: `const a = <box style={{ borderRadius: 2 }} />`,
      output: null,
      errors: [{ message: /Border corners come from `borderStyle`/ }],
    },
    {
      // The blind spot: a hoisted style object defeats excess-property checks.
      code: `const panel = { padding: 1, boxShadow: "0 1px 2px", fontSize: 14 }
             const a = <box style={panel} />`,
      output: null,
      errors: [{ message: /Cells cannot cast shadows/ }, { message: /Every cell is one character/ }],
    },
    {
      code: `const a = <box display="flex" />`,
      output: null,
      errors: [
        {
          message: /Layout is always flex/,
          suggestions: [{ desc: "Remove `display`", output: `const a = <box />` }],
        },
      ],
    },
    {
      code: `const a = <box madeUpProp={1} />`,
      options: [{ checkUnknownProps: true }],
      output: null,
      errors: [
        {
          message: /is not a prop of <box>.*silently does nothing/s,
          suggestions: [{ desc: "Remove `madeUpProp`", output: `const a = <box />` }],
        },
      ],
    },
  ],
})

tester("solid").run("no-web-props (solid)", asRule(rule), {
  valid: [
    // `on:` is Solid's own event syntax and binds a real listener.
    `const a = <box on:click={go} />`,
    `const a = <box on:mousedown={go} />`,
    // Solid's style object on a text node carries real meaning.
    `const a = <span style={{ fg: "red" }} />`,
  ],
  invalid: [
    {
      code: `const a = <box className="row" />`,
      output: null,
      errors: [
        {
          message: /OpenTUI has no class names/,
          suggestions: [{ desc: "Remove `className`", output: `const a = <box />` }],
        },
      ],
    },
    {
      code: `const a = <box onClick={go} />`,
      output: null,
      errors: [
        {
          message: /Use `onMouseDown`/,
          suggestions: [{ desc: "Remove `onClick`", output: `const a = <box />` }],
        },
      ],
    },
  ],
})

undetectedTester().run("no-web-props (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div className="grid" onClick={go} aria-label="x" />`],
  invalid: [],
})
