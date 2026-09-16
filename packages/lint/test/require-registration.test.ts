import rule from "../src/rules/require-registration.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

tester().run("require-registration", asRule(rule), {
  valid: [
    `import { registerQRCode } from "@opentui/qrcode/react"
     registerQRCode()
     const a = <qr-code content="https://example.com" />`,
    // The call may sit below the component; nothing is decided until the whole
    // file has been read.
    `const a = () => <qr-code content="x" />
     registerQRCode()`,
    {
      code: `const a = <qr-code content="x" />`,
      options: [{ registered: ["qr-code"] }],
    },
    // Solid's own spelling, registered.
    `const a = <box />`,
  ],
  invalid: [
    {
      code: `import { QRCodeRenderable } from "@opentui/qrcode"
             const a = <qr-code content="https://example.com" />`,
      errors: [{ message: /not in the default catalogue until registerQRCode\(\) runs.*Importing @opentui\/qrcode\/react is not enough/s }],
    },
  ],
})

tester("solid").run("require-registration (solid)", asRule(rule), {
  valid: [`registerQRCode()
           const a = <qr_code content="x" />`],
  invalid: [
    {
      code: `const a = <qr_code content="x" />`,
      errors: [{ message: /@opentui\/qrcode\/solid/ }],
    },
  ],
})

undetectedTester().run("require-registration (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <qr-code />`],
  invalid: [],
})
