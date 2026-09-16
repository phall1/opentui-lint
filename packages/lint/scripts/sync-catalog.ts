/**
 * Regenerates `src/catalog/generated.ts` from a real OpenTUI install.
 *
 * Every fact this linter asserts about OpenTUI — which elements exist, which
 * props each one accepts, which color names `parseColor` understands — is read
 * out of the published packages rather than transcribed by hand, so the catalog
 * cannot silently drift from the version people actually depend on.
 *
 *   bun scripts/sync-catalog.ts [--version 0.5.11]
 *   bun scripts/sync-catalog.ts --check     # fail if the checked-in catalog is stale
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_FILE = join(HERE, "..", "src", "catalog", "generated.ts")

const FRAMEWORKS = {
  react: {
    pkg: "@opentui/react",
    jsx: "@opentui/react/jsx-runtime",
    catalogue: "@opentui/react",
  },
  solid: {
    pkg: "@opentui/solid",
    jsx: "@opentui/solid/jsx-runtime",
    catalogue: "@opentui/solid/components",
  },
} as const

type FrameworkName = keyof typeof FRAMEWORKS

/** Superset of color names we probe against the real `parseColor`. */
const COLOR_CANDIDATES = [
  "transparent",
  // CSS basic + extended names, so anything OpenTUI drops is detected as invalid.
  "black", "silver", "gray", "grey", "white", "maroon", "red", "purple", "fuchsia", "green",
  "lime", "olive", "yellow", "navy", "blue", "teal", "aqua", "cyan", "magenta", "orange",
  "aliceblue", "antiquewhite", "aquamarine", "azure", "beige", "bisque", "blanchedalmond",
  "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral",
  "cornflowerblue", "cornsilk", "crimson", "darkblue", "darkcyan", "darkgoldenrod",
  "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue",
  "darkslategray", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray",
  "dodgerblue", "firebrick", "floralwhite", "forestgreen", "gainsboro", "ghostwhite",
  "gold", "goldenrod", "greenyellow", "honeydew", "hotpink", "indianred", "indigo",
  "ivory", "khaki", "lavender", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
  "lightcyan", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon",
  "lightseagreen", "lightskyblue", "lightslategray", "lightsteelblue", "lightyellow",
  "limegreen", "linen", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
  "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
  "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite",
  "oldlace", "olivedrab", "orangered", "orchid", "palegoldenrod", "palegreen",
  "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum",
  "powderblue", "rebeccapurple", "rosybrown", "royalblue", "saddlebrown", "salmon",
  "sandybrown", "seagreen", "seashell", "sienna", "skyblue", "slateblue", "slategray",
  "snow", "springgreen", "steelblue", "tan", "thistle", "tomato", "turquoise", "violet",
  "wheat", "whitesmoke", "yellowgreen",
  // Terminal-flavored names OpenTUI adds on top of the CSS set.
  "brightBlack", "brightRed", "brightGreen", "brightBlue", "brightYellow", "brightCyan",
  "brightMagenta", "brightWhite",
]

async function run(cmd: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" })
  const code = await proc.exited
  if (code !== 0) {
    const err = await new Response(proc.stderr).text()
    throw new Error(`${cmd.join(" ")} failed (${code}):\n${err}`)
  }
}

/** Installs the OpenTUI packages into a throwaway project we can introspect. */
async function installFixture(version: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opentui-lint-catalog-"))
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "catalog-fixture", private: true, type: "module" }))
  const specs = ["@opentui/core", "@opentui/react", "@opentui/solid"].map((p) => `${p}@${version}`)
  await run(["bun", "add", ...specs, "react", "@types/react", "solid-js"], dir)
  return dir
}

/**
 * Asks the real `parseColor` which names it understands.
 *
 * An unparseable string does not throw — it warns and returns opaque magenta —
 * so the probe compares against that sentinel. Only `magenta` and `fuchsia`
 * legitimately resolve to #FF00FF, and both are genuinely valid, so treating a
 * magenta result as "recognized" is correct for them and correct to reject for
 * everything else.
 */
async function probeColors(fixtureDir: string): Promise<string[]> {
  const script = `
    import { parseColor, RGBA } from "@opentui/core"
    const MAGENTA = RGBA.fromValues(1, 0, 1, 1)
    const names = ${JSON.stringify(COLOR_CANDIDATES)}
    const ok = []
    const origWarn = console.warn
    console.warn = () => {}
    for (const name of names) {
      try {
        if (!parseColor(name).equals(MAGENTA)) ok.push(name)
      } catch {}
    }
    console.warn = origWarn
    // magenta and fuchsia are the two real colors that equal the failure sentinel.
    for (const name of ["magenta", "fuchsia"]) if (names.includes(name)) ok.push(name)
    process.stdout.write(JSON.stringify(ok))
  `
  await writeFile(join(fixtureDir, "probe-colors.ts"), script)
  const proc = Bun.spawn(["bun", "run", "probe-colors.ts"], { cwd: fixtureDir, stdout: "pipe", stderr: "pipe" })
  const out = await new Response(proc.stdout).text()
  if ((await proc.exited) !== 0) {
    throw new Error(`color probe failed:\n${await new Response(proc.stderr).text()}`)
  }
  const seen = new Set<string>(JSON.parse(out))
  return [...seen].toSorted()
}

/**
 * Asks the framework's reconciler which element names it will actually
 * construct. This is the list that decides whether a tag renders or throws
 * "Unknown component type", and it is not always the same as the list JSX
 * declares — at 0.5.11 Solid's runtime catalogue carries `diff` and
 * `line_number` that its `.d.ts` never declares.
 */
async function probeCatalogue(fixtureDir: string, framework: FrameworkName): Promise<string[]> {
  const { catalogue } = FRAMEWORKS[framework]
  const file = `probe-catalogue-${framework}.ts`
  await writeFile(
    join(fixtureDir, file),
    `import { getComponentCatalogue } from "${catalogue}"\n` +
      `process.stdout.write(JSON.stringify(Object.keys(getComponentCatalogue())))\n`,
  )
  const proc = Bun.spawn(["bun", "run", file], { cwd: fixtureDir, stdout: "pipe", stderr: "pipe" })
  const out = await new Response(proc.stdout).text()
  if ((await proc.exited) !== 0) {
    throw new Error(`catalogue probe failed for ${framework}:\n${await new Response(proc.stderr).text()}`)
  }
  return JSON.parse(out) as string[]
}

export interface ElementFacts {
  /** Props the element's JSX type declares, including inherited layout options. */
  props: string[]
  /** True for `span`/`b`/`a`/… — nodes the reconciler requires inside `<text>`. */
  textNode: boolean
  /** False when the runtime renders it but JSX never declares it. */
  typed: boolean
}

interface FrameworkFacts {
  elements: Record<string, ElementFacts>
  /** Element names JSX accepts only because React's HTML elements are inherited. */
  domLeaks: string[]
  /** True when `JSX.IntrinsicElements` has a string index signature. */
  acceptsAnyElement: boolean
}

/**
 * Reads `JSX.IntrinsicElements` out of a framework's shipped `.d.ts` files.
 *
 * Declaration files are the stable public surface — far safer to read than
 * minified `dist` bundles, and they carry the prop types we need anyway.
 */
function readIntrinsicElements(
  fixtureDir: string,
  framework: FrameworkName,
  runtimeNames: string[],
): FrameworkFacts {
  const { jsx } = FRAMEWORKS[framework]
  const probePath = join(fixtureDir, `probe-${framework}.ts`)
  Bun.write(probePath, `import type { JSX } from "${jsx}"\nexport type Intrinsics = JSX.IntrinsicElements\n`)

  const program = ts.createProgram([probePath], {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    types: ["react"],
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(probePath)
  if (!source) throw new Error(`could not load probe for ${framework}`)

  const alias = source.statements.find(
    (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === "Intrinsics",
  )
  if (!alias) throw new Error(`missing Intrinsics alias for ${framework}`)
  const intrinsics = checker.getTypeAtLocation(alias.name)

  const elements: Record<string, ElementFacts> = {}
  const domLeaks: string[] = []

  for (const symbol of intrinsics.getProperties()) {
    const declaration = symbol.declarations?.[0]
    const declaredIn = declaration?.getSourceFile().fileName ?? ""
    const name = symbol.getName()

    // Anything declared outside @opentui is inherited from React's DOM types:
    // it typechecks in JSX but has no renderable behind it.
    if (!declaredIn.includes("@opentui")) {
      domLeaks.push(name)
      continue
    }

    const propsType = checker.getTypeOfSymbolAtLocation(symbol, declaration!)
    const props = propsType
      .getProperties()
      .map((p) => p.getName())
      .toSorted()

    elements[name] = { props, textNode: TEXT_NODE_ELEMENTS.has(name), typed: true }
  }

  // Runtime wins: a name the reconciler constructs renders fine even when the
  // declarations forgot it, and flagging it would be a false positive.
  for (const name of runtimeNames) {
    elements[name] ??= { props: [], textNode: TEXT_NODE_ELEMENTS.has(name), typed: false }
  }

  return {
    elements: Object.fromEntries(Object.entries(elements).toSorted(([a], [b]) => a.localeCompare(b))),
    domLeaks: domLeaks.toSorted(),
    acceptsAnyElement: checker.getIndexTypeOfType(intrinsics, ts.IndexKind.String) !== undefined,
  }
}

/**
 * Elements the reconciler refuses to create outside a `<text>` subtree.
 * Mirrors `textNodeKeys` in both framework packages; asserted by the
 * conformance suite so a rename upstream surfaces as a test failure.
 */
const TEXT_NODE_ELEMENTS = new Set(["span", "b", "strong", "i", "em", "u", "br", "a"])

/** Every prop name that appears on at least one element, in either binding. */
function allProps(frameworks: Record<FrameworkName, FrameworkFacts>): string[] {
  const names = new Set<string>()
  for (const facts of Object.values(frameworks)) {
    for (const element of Object.values(facts.elements)) {
      for (const prop of element.props) names.add(prop)
    }
  }
  return [...names].toSorted()
}

/**
 * OpenTUI's color props all end in Color/Bg/Fg, or are the bare `fg`/`bg`/
 * `color` on text. Intersecting that shape with the real prop surface keeps
 * the list honest in both directions: nothing invented, nothing missed.
 */
function derivedColorProps(frameworks: Record<FrameworkName, FrameworkFacts>): string[] {
  return allProps(frameworks).filter(
    (name) => /(?:Color|Bg|Fg)$/.test(name) || name === "fg" || name === "bg" || name === "color",
  )
}

function derivedSpacingProps(frameworks: Record<FrameworkName, FrameworkFacts>): string[] {
  return allProps(frameworks).filter(
    (name) => /^(?:padding|margin)/.test(name) || /^(?:row|column)?[Gg]ap$/.test(name),
  )
}

const json = (value: unknown) => JSON.stringify(value, null, 2)

function render(
  version: string,
  colors: string[],
  frameworks: Record<FrameworkName, FrameworkFacts>,
): string {
  return `// @generated by \`bun scripts/sync-catalog.ts\` — do not edit by hand.
// Source of truth: @opentui/core, @opentui/react and @opentui/solid at ${version}.
// Run \`bun run catalog:sync\` after bumping the supported OpenTUI version.

/** OpenTUI version these facts were read from. */
export const CATALOG_VERSION = ${json(version)}

/**
 * Color names \`parseColor()\` recognizes. Anything else resolves to opaque
 * magenta with a \`console.warn\`, which in a terminal app means a visibly wrong
 * color and no type error — \`ColorInput\` is just \`string | RGBA\`.
 */
export const NAMED_COLORS = ${json(colors)} as const

/**
 * Props whose values flow through \`parseColor()\`.
 *
 * Derived from the real per-element prop lists, not typed out. The
 * hand-written version of this omitted \`textColor\` — the primary color prop
 * on <input> and <textarea> — and carried a \`scrollbarColor\` that exists on no
 * element at all. A list asserted rather than computed is exactly the drift
 * this generator exists to prevent.
 */
export const COLOR_PROPS = ${json(derivedColorProps(frameworks))} as const

/**
 * Layout props measured in whole terminal cells, not pixels. Also derived, so
 * a new spacing prop upstream cannot go unnoticed.
 */
export const SPACING_PROPS = ${json(derivedSpacingProps(frameworks))} as const

export interface ElementFacts {
  props: readonly string[]
  textNode: boolean
  typed: boolean
}

export interface FrameworkFacts {
  elements: Readonly<Record<string, ElementFacts>>
  domLeaks: readonly string[]
  acceptsAnyElement: boolean
}

/**
 * Per-framework JSX surface.
 *
 * \`domLeaks\` is why this linter exists for React: \`JSX.IntrinsicElements\`
 * extends React's DOM elements, so \`<div>\` typechecks and then throws
 * "Unknown component type: div" at render. \`acceptsAnyElement\` records the
 * string index signature that lets *any* lowercase tag through the checker.
 */
export const FRAMEWORKS: Readonly<Record<"react" | "solid", FrameworkFacts>> = ${json(frameworks)}
`
}

async function main() {
  const args = process.argv.slice(2)
  const check = args.includes("--check")
  const versionFlag = args.indexOf("--version")
  const version = versionFlag === -1 ? "latest" : (args[versionFlag + 1] ?? "latest")

  const fixtureDir = await installFixture(version)
  try {
    const installed = JSON.parse(
      await readFile(join(fixtureDir, "node_modules", "@opentui", "core", "package.json"), "utf8"),
    ).version as string

    const colors = await probeColors(fixtureDir)
    const frameworks = {
      react: readIntrinsicElements(fixtureDir, "react", await probeCatalogue(fixtureDir, "react")),
      solid: readIntrinsicElements(fixtureDir, "solid", await probeCatalogue(fixtureDir, "solid")),
    }
    const next = render(installed, colors, frameworks)

    if (check) {
      const current = await readFile(OUT_FILE, "utf8").catch(() => "")
      if (current.trim() !== next.trim()) {
        console.error(`Catalog is stale for @opentui/core@${installed}. Run \`bun run catalog:sync\`.`)
        process.exit(1)
      }
      console.log(`Catalog is current for @opentui/core@${installed}.`)
      return
    }

    await writeFile(OUT_FILE, next)
    const counts = Object.entries(frameworks)
      .map(([name, f]) => `${name}: ${Object.keys(f.elements).length} elements, ${f.domLeaks.length} DOM leaks`)
      .join(" · ")
    console.log(`Wrote catalog for @opentui/core@${installed} — ${colors.length} colors · ${counts}`)
  } finally {
    await rm(fixtureDir, { recursive: true, force: true })
  }
}

await main()
