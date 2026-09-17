import rule from "../src/rules/no-raw-stdout.js";
import { asRule, tester, undetectedTester } from "./helpers.js";

tester().run("no-raw-stdout", asRule(rule), {
  valid: [
    // OpenTUI replaces the global console and captures it into the overlay.
    `import { useKeyboard } from "@opentui/react"
     console.log("fine")`,
    `import { useKeyboard } from "@opentui/react"
     console.error("also fine")`,
    `import { useKeyboard } from "@opentui/react"
     file.write("not a stream")`,
    {
      // A CLI entrypoint that legitimately owns stdout before the renderer starts.
      code: `import { useKeyboard } from "@opentui/react"
             process.stdout.write("banner")`,
      filename: "src/bin/cli.ts",
      options: [{ allowInFiles: ["bin/"] }],
    },
  ],
  invalid: [
    {
      code: `import { useKeyboard } from "@opentui/react"
             process.stdout.write("progress\\r")`,
      errors: [{ message: /corrupts the frame.*never repaints those cells/s }],
    },
    {
      code: `import { useKeyboard } from "@opentui/react"
             process.stderr.write("oops")`,
      errors: [{ message: /process.stderr directly corrupts the frame/ }],
    },
  ],
});

undetectedTester().run("no-raw-stdout (not an OpenTUI file)", asRule(rule), {
  valid: [`process.stdout.write("a normal CLI writing normally")`],
  invalid: [],
});
