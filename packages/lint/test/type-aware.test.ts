import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { RuleTester } from "eslint"
import tsParser from "@typescript-eslint/parser"
import rule from "../src/rules/text-must-be-wrapped.js"
import { asRule } from "./helpers.js"

/**
 * `checkTypes` needs a real tsconfig and real files on disk — a type checker
 * cannot be built from a bare source string the way the syntactic tests in
 * `text-must-be-wrapped.test.ts` work. `fixtures/typed-app` provides both;
 * `src/env.d.ts` declares `ReactNodeLike` and `Accessor<T>` as structural
 * stand-ins for what `@opentui/react` / `@opentui/solid` consumers actually
 * see (see that file for why this doesn't import the real packages).
 *
 * Each case is written to a real file whose content *is* the code under test.
 *
 * The parser is documented to use RuleTester's `code` as the file's content,
 * the way an editor's unsaved buffer overrides disk, and it does — until a
 * fresh checkout, where the program served the on-disk placeholder instead and
 * every type resolved from a file with none of the declarations in it. That
 * failed only on CI, and it failed as an argument about message wording rather
 * than as "the program is not seeing your code". Writing the file removes the
 * disagreement instead of trusting it not to happen.
 */
const FIXTURE = join(import.meta.dir, "fixtures", "typed-app")
const CASES = join(FIXTURE, "src", "cases")

// Generated, never committed: written here before any parse so the program
// picks them up on its first build.
rmSync(CASES, { recursive: true, force: true })
mkdirSync(CASES, { recursive: true })

let caseIndex = 0

/** A case backed by a real file, so `code` and the program can never disagree. */
function onDisk(code: string) {
  const filename = join(CASES, `case-${(caseIndex += 1)}.tsx`)
  writeFileSync(filename, code)
  return { code, filename }
}

/**
 * Types the snippets need, written into the snippet itself.
 *
 * `env.d.ts` still supplies the JSX globals that make the fixture parse, but
 * anything an *assertion* depends on is declared inline. A CI run where the
 * ambient declarations did not reach the program produced a degraded
 * diagnostic and a baffling diff rather than an obvious failure; a
 * self-contained snippet cannot do that.
 */
const PRELUDE = "type Accessor<T> = () => T\n"

function typedTester(framework: "react" | "solid" = "react"): RuleTester {
  return new RuleTester({
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: join(FIXTURE, "tsconfig.json"),
        tsconfigRootDir: FIXTURE,
      },
    },
    settings: { opentui: { framework } },
  })
}

/**
 * An invalid case for a given type, asserting both that the resolved type is
 * quoted back and that the fix still applies.
 *
 * The fix matters as much as the report here: these are precisely the cases the
 * syntactic tier cannot see, so a type-only diagnostic with no fix would make
 * the tier that catches the hardest cases the one that helps least.
 */
function reported(declareType: string, expr: string, resolvedAs: string) {
  return {
    ...onDisk(`${PRELUDE}declare const value: ${declareType}\nexport const App = () => <box>{${expr}}</box>`),
    output: `${PRELUDE}declare const value: ${declareType}\nexport const App = () => <box><text>{${expr}}</text></box>`,
    options: [{ checkTypes: true }],
    errors: [{ message: new RegExp(`resolved this expression's type as \`${resolvedAs}\`, which cannot be anything but text`) }],
  }
}

function notReported(declareType: string, expr: string) {
  return {
    ...onDisk(`${PRELUDE}declare const value: ${declareType}\nexport const App = () => <box>{${expr}}</box>`),
    options: [{ checkTypes: true }],
  }
}

typedTester().run("text-must-be-wrapped (checkTypes)", asRule(rule), {
  valid: [
    // Off by default even with a real type checker sitting right there —
    // `value` here is unambiguously `string`, and it is still not reported.
    {
      ...onDisk(`${PRELUDE}declare const value: string\nexport const App = () => <box>{value}</box>`),
    },
    // `ReactNode` is exactly the case the syntactic rule exists to leave
    // alone: it legitimately includes elements, so it must stay unreported
    // even with `checkTypes: true`.
    notReported("ReactNodeLike", "value"),
    // A two-member union is enough to prove the "any object member aborts
    // the whole union" rule, without needing the full ReactNode shape.
    notReported("string | ElementLike", "value"),
    // `any`/`unknown` are exactly the values a linter must not guess about.
    notReported("any", "value"),
    notReported("unknown", "value"),
    // A generic constrained to `string` is still not *provably* `string` at
    // this call site — TypeScript itself keeps `T` opaque here.
    {
      ...onDisk(`function Row<T extends string>(value: T) { return <box>{value}</box> }`),
      options: [{ checkTypes: true }],
    },
  ],
  invalid: [
    reported("string", "value", "string"),
    reported("number", "value", "number"),
    reported("string | number", "value", "string | number"),
    reported(`"a" | "b" | "c"`, "value", `"a" | "b" | "c"`),
    // `undefined` renders as nothing; the crash only happens on the `string`
    // branch, which is exactly why this is still reported.
    reported("string | undefined", "value", "string | undefined"),
  ],
})

/**
 * Without `parserOptions.project` there is no program and no checker — the
 * option must not crash the rule or start guessing. Reuses the plain
 * (non-type-aware) tester from `helpers.ts`'s pattern directly rather than
 * `typedTester`, since the whole point is the absence of a project.
 */
new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  settings: { opentui: { framework: "react" } },
}).run("text-must-be-wrapped (checkTypes without a project)", asRule(rule), {
  valid: [
    // `label` is syntactically ambiguous, and there is no type checker to
    // resolve it either — must degrade to the syntactic result, not throw.
    { code: "const a = <box>{label}</box>", options: [{ checkTypes: true }] },
  ],
  invalid: [],
})

typedTester("solid").run("text-must-be-wrapped (checkTypes, solid)", asRule(rule), {
  valid: [
    // The accessor itself is a function, not text — calling it is what
    // matters, not holding a reference to it.
    notReported("Accessor<string>", "value"),
    notReported("Accessor<ReactNodeLike>", "value()"),
  ],
  invalid: [
    {
      // Solid signals are accessors: `count()` returns `string`, not
      // `count` itself, so the call's return type is what has to be checked.
      ...onDisk(`${PRELUDE}declare const count: Accessor<string>\nexport const App = () => <box>{count()}</box>`),
      output: `${PRELUDE}declare const count: Accessor<string>\nexport const App = () => <box><text>{count()}</text></box>`,
      options: [{ checkTypes: true }],
      errors: [
        {
          message:
            /Orphan text error: "…" must have a <text> as a parent.*resolved this expression's type as `string`/s,
        },
      ],
    },
  ],
})

/**
 * The payoff of teaching the fixer what the checker knows.
 *
 * `<box>{count.length} items</box>` is a single rendered line made of one
 * provable fragment and one the syntax cannot judge. Without type information
 * the run has an ambiguous neighbour, so the fix is downgraded to a suggestion
 * rather than splitting the line in half. With `checkTypes` the neighbour is no
 * longer ambiguous and the whole line wraps as one `<text>`.
 */
typedTester().run("text-must-be-wrapped (checkTypes unblocks a run)", asRule(rule), {
  valid: [],
  invalid: [
    {
      ...onDisk(`${PRELUDE}declare const items: string[]\nexport const App = () => <box>{items.length} items</box>`),
      options: [{ checkTypes: true }],
      output: `${PRELUDE}declare const items: string[]\nexport const App = () => <box><text>{items.length} items</text></box>`,
      errors: 2,
    },
    {
      // The same source without checkTypes. Only " items" is provable, so the
      // run stops there and its neighbour is ambiguous — which is why this is
      // offered rather than applied. The offered edit splits the line, and that
      // is the honest thing to show: it is the best edit that can be justified
      // from syntax alone, and a person previewing it can see the cost.
      ...onDisk(`${PRELUDE}declare const items: string[]\nexport const App = () => <box>{items.length} items</box>`),
      output: null,
      errors: [
        {
          message: /renders as a text node/,
          suggestions: [
            {
              desc: "Wrap the text in <text>",
              output: `${PRELUDE}declare const items: string[]\nexport const App = () => <box>{items.length} <text>items</text></box>`,
            },
          ],
        },
      ],
    },
  ],
})

/**
 * Proves the project program is really wired up, before any wording assertion
 * is read as evidence of anything.
 *
 * A parser that quietly fails to build a typed program degrades this rule to
 * its syntactic behaviour — by design — and every type-aware expectation then
 * fails with a diff about message wording rather than the actual cause. That
 * happened once on CI and cost far more to diagnose than the bug was worth.
 * This case says the real thing in its name.
 */
typedTester().run("the typed fixture really is typed", asRule(rule), {
  valid: [],
  invalid: [
    {
      // If strictNullChecks were not in effect this type would collapse to
      // `string`, and the quoted type is the only place that shows.
      ...onDisk(`${PRELUDE}declare const value: string | undefined\nexport const App = () => <box>{value}</box>`),
      options: [{ checkTypes: true }],
      output: `${PRELUDE}declare const value: string | undefined\nexport const App = () => <box><text>{value}</text></box>`,
      errors: [{ message: /resolved this expression's type as `string \| undefined`/ }],
    },
  ],
})
