import { expect, test } from "bun:test"
import { join } from "node:path"
import tsParser from "@typescript-eslint/parser"

// TEMPORARY: reports what the parser actually builds, to diagnose a CI-only
// failure of the type-aware suite. Removed once understood.
const FIXTURE = join(import.meta.dir, "fixtures", "typed-app")

test("what does the parser see", () => {
  const result: any = tsParser.parseForESLint(
    `declare const value: string | undefined\nexport const App = () => <box>{value}</box>`,
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
  expect(true).toBe(true)
})
