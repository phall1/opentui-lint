import { join } from "node:path";
import rule from "../src/rules/no-restyle.js";
import { asRule, tester, undetectedTester } from "./helpers.js";

const FIXTURE = join(import.meta.dir, "fixtures", "ds-app");
const APP = join(FIXTURE, "app");
const UI = join(FIXTURE, "components", "ui");
const OUTSIDE_ANY_DESIGN_SYSTEM = "/tmp/opentui-lint-no-restyle-no-ds/App.tsx";

const IMPORT_BUTTON = `import { Button } from "@/components/ui/button"\n`;
const IMPORT_DIALOG = `import { Dialog } from "@/components/ui/dialog"\n`;

tester().run("no-restyle", asRule(rule), {
  valid: [
    // Placement is always the call site's, whatever the value.
    { code: `${IMPORT_BUTTON}const a = <Button marginTop={1} />`, filename: join(APP, "a.tsx") },
    {
      code: `${IMPORT_BUTTON}const a = <Button width={20} alignSelf="center" />`,
      filename: join(APP, "a.tsx"),
    },
    {
      code: `${IMPORT_BUTTON}const a = <Button flexGrow={1} minWidth={10} zIndex={2} position="absolute" />`,
      filename: join(APP, "a.tsx"),
    },

    // Behaviour is never a restyle.
    {
      code: `${IMPORT_BUTTON}const a = <Button onMouseDown={() => {}} content="Go" value="x" focused id="btn" ref={r} children="Go" />`,
      filename: join(APP, "a.tsx"),
    },

    // A spread attribute names no single prop, so it cannot be judged.
    { code: `${IMPORT_BUTTON}const a = <Button {...rest} />`, filename: join(APP, "a.tsx") },

    // A host element is never in scope — the selector only fires on capitalized names.
    { code: `const a = <box backgroundColor="red" paddingX={2} />`, filename: join(APP, "a.tsx") },

    // Capitalized but not imported from the ui directory: a third-party component…
    {
      code: `import { For } from "solid-js"\nconst a = <For each={items}>{(i) => <box>{i}</box>}</For>`,
      filename: join(APP, "a.tsx"),
    },
    // …and the user's own, unrelated component of the same shape a recipe would have.
    {
      code: `import { Card } from "../shared/Card"\nconst a = <Card backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
    },

    // No design system anywhere above this file: the rule has no project model to check against.
    {
      code: `${IMPORT_BUTTON}const a = <Button backgroundColor="red" />`,
      filename: OUTSIDE_ANY_DESIGN_SYSTEM,
    },

    // The design system's own source is exempt, however it restyles itself.
    {
      code: `import { Icon } from "./icon"\nexport const Button = () => <Icon color="red" />`,
      filename: join(UI, "button.tsx"),
    },

    // A contract can open a category back up for a specific component.
    {
      code: `${IMPORT_BUTTON}const a = <Button backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
      options: [{ contracts: [{ pattern: "^Button$", allow: ["color"] }] }],
    },

    // `Dialog.Content` flattens to `DialogContent`, and the contract allows it.
    {
      code: `${IMPORT_DIALOG}const a = <Dialog.Content backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
      options: [{ contracts: [{ pattern: "^DialogContent$", allow: ["color"] }] }],
    },
  ],

  invalid: [
    // The baseline posture with no contracts configured: every owned category is reported.
    {
      code: `${IMPORT_BUTTON}const a = <Button backgroundColor="#22c55e" />`,
      filename: join(APP, "a.tsx"),
      errors: [{ message: /backgroundColor sets Button's color/ }],
    },
    {
      code: `${IMPORT_BUTTON}const a = <Button bg="red" fg="blue" />`,
      filename: join(APP, "a.tsx"),
      errors: 2,
    },
    {
      code: `${IMPORT_BUTTON}const a = <Button border borderStyle="rounded" />`,
      filename: join(APP, "a.tsx"),
      errors: 2,
    },
    {
      code: `${IMPORT_BUTTON}const a = <Button font="tiny" showUnderline />`,
      filename: join(APP, "a.tsx"),
      errors: 2,
    },
    {
      code: `${IMPORT_BUTTON}const a = <Button paddingX={2} padding={1} />`,
      filename: join(APP, "a.tsx"),
      errors: 2,
    },
    {
      code: `${IMPORT_BUTTON}const a = <Button gap={1} flexDirection="row" alignItems="center" justifyContent="center" flexWrap="wrap" />`,
      filename: join(APP, "a.tsx"),
      errors: 5,
    },

    // Inline and hoisted `style={{ … }}` are both surfaces.
    {
      code: `${IMPORT_BUTTON}const a = <Button style={{ backgroundColor: "red" }} />`,
      filename: join(APP, "a.tsx"),
      errors: 1,
    },
    {
      code: `${IMPORT_BUTTON}const boxStyle = { backgroundColor: "red", paddingX: 2 }\nconst a = <Button style={boxStyle} />`,
      filename: join(APP, "a.tsx"),
      errors: 2,
    },

    // `Dialog.Content` flattens to `DialogContent` for a contract that denies it.
    {
      code: `${IMPORT_DIALOG}const a = <Dialog.Content backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
      options: [{ contracts: [{ pattern: "^DialogContent$", deny: ["color"] }] }],
      errors: 1,
    },

    // A denied category prefers the contract's own message.
    {
      code: `${IMPORT_BUTTON}const a = <Button backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
      options: [
        {
          contracts: [
            { pattern: "^Button$", deny: ["color"], message: "Use intent instead of a raw color." },
          ],
        },
      ],
      errors: [{ message: "Use intent instead of a raw color." }],
    },

    // A rule-level `message` is the fallback when a contract sets none of its own.
    {
      code: `${IMPORT_BUTTON}const a = <Button backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
      options: [{ message: "House rule: colors come from the theme only." }],
      errors: [{ message: "House rule: colors come from the theme only." }],
    },

    // The default message names what breaks (the theme switch) and states plainly
    // that this is a stricter house policy, not a defect in the recipe.
    {
      code: `${IMPORT_BUTTON}const a = <Button backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
      errors: [{ message: /theme\.setActive.*stricter house policy/s }],
    },

    // A bad contract pattern is a config error reported once, at line 1 — and
    // nothing else fires for the file, even though `Button` restyles color too.
    {
      code: `${IMPORT_BUTTON}const a = <Button backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
      options: [{ contracts: [{ pattern: "(unterminated", allow: ["color"] }] }],
      errors: [{ line: 1, message: /not a valid regular expression/ }],
    },

    // Same for an allow/deny entry that names no real category.
    {
      code: `${IMPORT_BUTTON}const a = <Button backgroundColor="red" />`,
      filename: join(APP, "a.tsx"),
      options: [{ contracts: [{ pattern: "^Button$", allow: ["colour"] }] }],
      errors: [{ line: 1, message: /not a restyle category/ }],
    },
  ],
});

undetectedTester().run("no-restyle (not an OpenTUI file)", asRule(rule), {
  // Deliberately no `filename` under the fixture tree: it carries its own
  // tsconfig.json with `jsxImportSource: "@opentui/react"`, which would let
  // `detectFramework` find positive evidence even here and defeat the point
  // of this case — proving the rule is silent with none at all.
  valid: [`${IMPORT_BUTTON}export const Page = () => <Button backgroundColor="red" />`],
  invalid: [],
});
