import rule from "../src/rules/no-web-props.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

tester().run("no-web-props", asRule(rule), {
  valid: [
    `const a = <box flexGrow={1} backgroundColor="#101418" />`,
    `const a = <box onMouseDown={go} />`,
    `const a = <input focused onInput={set} onSubmit={go} />`,
    `const a = <box title="Logs" />`.replace("title", "borderColor"),
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
      code: `const a = <box className="flex-1" />`,
      errors: [{ message: /does nothing on <box>.*OpenTUI has no class names/s }],
    },
    {
      code: `const a = <box onClick={go} />`,
      errors: [{ message: /Use `onMouseDown`/ }],
    },
    {
      code: `const a = <box onMouseEnter={f} />`,
      errors: [{ message: /Use `onMouseOver`/ }],
    },
    {
      code: `const a = <box data-testid="panel" />`,
      errors: [{ message: /Terminal cells carry no attributes/ }],
    },
    {
      code: `const a = <box aria-label="Panel" />`,
      errors: [{ message: /Terminal cells carry no attributes/ }],
    },
    {
      code: `const a = <box style={{ borderRadius: 2 }} />`,
      errors: [{ message: /Border corners come from `borderStyle`/ }],
    },
    {
      // The blind spot: a hoisted style object defeats excess-property checks.
      code: `const panel = { padding: 1, boxShadow: "0 1px 2px", fontSize: 14 }
             const a = <box style={panel} />`,
      errors: [
        { message: /Cells cannot cast shadows/ },
        { message: /Every cell is one character/ },
      ],
    },
    {
      code: `const a = <box display="flex" />`,
      errors: [{ message: /Layout is always flex/ }],
    },
    {
      code: `const a = <box madeUpProp={1} />`,
      options: [{ checkUnknownProps: true }],
      errors: [{ message: /is not a prop of <box>.*silently does nothing/s }],
    },
  ],
})

undetectedTester().run("no-web-props (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div className="grid" onClick={go} aria-label="x" />`],
  invalid: [],
})
