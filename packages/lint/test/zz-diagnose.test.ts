import { expect, test } from "bun:test"
import { join } from "node:path"
import tsParser from "@typescript-eslint/parser"

// TEMPORARY: reports what the parser actually builds, to diagnose a CI-only
// failure of the type-aware suite. Removed once understood.
const FIXTURE = join(import.meta.dir, "fixtures", "typed-app")

test("what does the parser see", () => {
  const result: any = tsParser.parseForESLint(
    `type Accessor<T> = () => T\ndeclare const value: string | undefined\nexport const App = () => <box>{value}</box>`,
    {
      filePath: join(FIXTURE, "src", "App.tsx"),
      ecmaFeatures: { jsx: true },
      project: join(FIXTURE, "tsconfig.json"),
      tsconfigRootDir: FIXTURE,
    } as any,
  )
  const services = result.services
  const program = services?.program
  const options = program?.getCompilerOptions?.()
  console.error("DIAG program:", program ? "yes" : "NO")
  console.error("DIAG strictNullChecks:", options?.strictNullChecks)
  console.error("DIAG lib:", JSON.stringify(options?.lib))
  console.error("DIAG configFilePath:", options?.configFilePath)
  console.error("DIAG rootFileNames:", JSON.stringify(program?.getRootFileNames?.()))
  console.error("DIAG platform:", process.platform)

  // The actual question: what does the checker say about `value` here?
  const ts = require("typescript")
  console.error("DIAG tsversion:", ts.version)
  const checker = program?.getTypeChecker?.()
  let found = "none"
  const visit = (n: any) => {
    if (n.kind === ts.SyntaxKind.JsxExpression && n.expression) {
      found = checker.typeToString(checker.getTypeAtLocation(n.expression))
    }
    ts.forEachChild(n, visit)
  }
  const sf = program?.getSourceFile?.(join(FIXTURE, "src", "App.tsx"))
  console.error("DIAG sourceTextHasValue:", sf?.text?.includes("declare const value"))
  if (sf) visit(sf)
  console.error("DIAG jsxExprType:", found)
  expect(true).toBe(true)
})
