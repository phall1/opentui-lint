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
 *
 * ---
 *
 * Written with Effect, and deliberately *only* here. The published plugin has
 * zero runtime dependencies and keeps them: a lint plugin lands in every
 * consumer's devDependencies, and Effect is 53 MB on disk. It also has nothing
 * to offer a rule — ESLint's visitor API is synchronous and callback-driven,
 * with `context.report()` as the sole output, so there is no error channel,
 * no concurrency, and no resource to manage.
 *
 * This script is the opposite on all three counts. It installs packages, spawns
 * four subprocesses, owns a temp directory that must be removed on *any* exit
 * including Ctrl-C, and has four genuinely different failure modes. That is
 * what `Effect.acquireRelease`, a typed error channel and `BunRuntime.runMain`
 * are for.
 *
 * Bun's `spawn` and `node:fs` are wrapped directly rather than going through
 * `effect/unstable/process`: this script only ever runs under Bun in this repo,
 * so the platform indirection would buy nothing and pin us to an unstable API.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BunRuntime } from "@effect/platform-bun";
import { Effect, Schema } from "effect";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, "..", "src", "catalog", "generated.ts");

const FRAMEWORKS = {
  react: { jsx: "@opentui/react/jsx-runtime", catalogue: "@opentui/react" },
  solid: { jsx: "@opentui/solid/jsx-runtime", catalogue: "@opentui/solid/components" },
} as const;

type FrameworkName = keyof typeof FRAMEWORKS;

// ---------------------------------------------------------------------------
// Errors
//
// Four failure modes, kept distinct. "the install failed" and "the TypeScript
// program could not resolve the JSX types" want completely different responses
// from whoever is running this, and collapsing them into a thrown Error is how
// that distinction gets lost.
// ---------------------------------------------------------------------------

class InstallFailed extends Schema.TaggedError<InstallFailed>()("InstallFailed", {
  command: Schema.String,
  exitCode: Schema.Number,
  stderr: Schema.String,
}) {}

class ProbeFailed extends Schema.TaggedError<ProbeFailed>()("ProbeFailed", {
  probe: Schema.String,
  stderr: Schema.String,
}) {}

class TypesUnreadable extends Schema.TaggedError<TypesUnreadable>()("TypesUnreadable", {
  framework: Schema.String,
  reason: Schema.String,
}) {}

class CatalogStale extends Schema.TaggedError<CatalogStale>()("CatalogStale", {
  version: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Runs a command to completion, failing the effect on a non-zero exit. */
const run = Effect.fnUntraced(function* (command: ReadonlyArray<string>, cwd: string) {
  const { exitCode, stderr } = yield* Effect.promise(async () => {
    const proc = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" });
    const [code, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    return { exitCode: code, stderr: err };
  });

  if (exitCode !== 0) {
    return yield* new InstallFailed({ command: command.join(" "), exitCode, stderr });
  }
});

/** Writes a throwaway script into the fixture and returns what it printed. */
const probe = Effect.fnUntraced(function* (fixtureDir: string, name: string, source: string) {
  const file = `probe-${name}.ts`;
  yield* Effect.promise(() => writeFile(join(fixtureDir, file), source));

  const { exitCode, stdout, stderr } = yield* Effect.promise(async () => {
    const proc = Bun.spawn(["bun", "run", file], {
      cwd: fixtureDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { exitCode: code, stdout: out, stderr: err };
  });

  if (exitCode !== 0) return yield* new ProbeFailed({ probe: name, stderr });
  return stdout;
});

/**
 * A throwaway project with the target OpenTUI installed, removed on any exit.
 *
 * `acquireRelease` rather than try/finally because `BunRuntime.runMain`
 * interrupts the fiber on SIGINT, and an interrupt is exactly when a stray
 * several-hundred-megabyte temp directory would otherwise be left behind.
 */
const fixture = (version: string) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "opentui-lint-catalog-")));
      yield* Effect.logInfo(`installing @opentui/*@${version}`).pipe(Effect.annotateLogs({ dir }));
      yield* Effect.promise(() =>
        writeFile(
          join(dir, "package.json"),
          JSON.stringify({ name: "catalog-fixture", private: true, type: "module" }),
        ),
      );
      const specs = ["@opentui/core", "@opentui/react", "@opentui/solid"].map(
        (p) => `${p}@${version}`,
      );
      yield* run(["bun", "add", ...specs, "react", "@types/react", "solid-js"], dir);
      return dir;
    }),
    (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
  );

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/** Superset of color names we probe against the real `parseColor`. */
const COLOR_CANDIDATES = [
  "transparent",
  // CSS basic + extended names, so anything OpenTUI drops is detected as invalid.
  "black",
  "silver",
  "gray",
  "grey",
  "white",
  "maroon",
  "red",
  "purple",
  "fuchsia",
  "green",
  "lime",
  "olive",
  "yellow",
  "navy",
  "blue",
  "teal",
  "aqua",
  "cyan",
  "magenta",
  "orange",
  "aliceblue",
  "antiquewhite",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "blanchedalmond",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "greenyellow",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightsteelblue",
  "lightyellow",
  "limegreen",
  "linen",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "oldlace",
  "olivedrab",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "rebeccapurple",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "skyblue",
  "slateblue",
  "slategray",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "whitesmoke",
  "yellowgreen",
  // Terminal-flavored names OpenTUI adds on top of the CSS set.
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightBlue",
  "brightYellow",
  "brightCyan",
  "brightMagenta",
  "brightWhite",
];

/**
 * Asks the real `parseColor` which names it understands.
 *
 * An unparseable string does not throw — it warns and returns opaque magenta —
 * so the probe compares against that sentinel. Only `magenta` and `fuchsia`
 * legitimately resolve to #FF00FF, and both are genuinely valid, so treating a
 * magenta result as "recognized" is correct for them and correct to reject for
 * everything else.
 */
const probeColors = Effect.fnUntraced(function* (fixtureDir: string) {
  const out = yield* probe(
    fixtureDir,
    "colors",
    `
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
  `,
  );
  return [...new Set<string>(JSON.parse(out))].toSorted();
});

/**
 * Asks the framework's reconciler which element names it will actually
 * construct. This is the list that decides whether a tag renders or throws
 * "Unknown component type", and it is not always the same as the list JSX
 * declares — at 0.5.11 Solid's runtime catalogue carries `diff` and
 * `line_number` that its `.d.ts` never declares.
 */
const probeCatalogue = Effect.fnUntraced(function* (fixtureDir: string, framework: FrameworkName) {
  const out = yield* probe(
    fixtureDir,
    `catalogue-${framework}`,
    `import { getComponentCatalogue } from "${FRAMEWORKS[framework].catalogue}"\n` +
      `process.stdout.write(JSON.stringify(Object.keys(getComponentCatalogue())))\n`,
  );
  return JSON.parse(out) as string[];
});

export interface ElementFacts {
  /** Props the element's JSX type declares, including inherited layout options. */
  props: string[];
  /** True for `span`/`b`/`a`/… — nodes the reconciler requires inside `<text>`. */
  textNode: boolean;
  /** False when the runtime renders it but JSX never declares it. */
  typed: boolean;
}

interface FrameworkFacts {
  elements: Record<string, ElementFacts>;
  /** Element names JSX accepts only because React's HTML elements are inherited. */
  domLeaks: string[];
  /** True when `JSX.IntrinsicElements` has a string index signature. */
  acceptsAnyElement: boolean;
}

/**
 * Elements the reconciler refuses to create outside a `<text>` subtree.
 * Mirrors `textNodeKeys` in both framework packages; asserted by the
 * conformance suite so a rename upstream surfaces as a test failure.
 */
const TEXT_NODE_ELEMENTS = new Set(["span", "b", "strong", "i", "em", "u", "br", "a"]);

/**
 * Reads `JSX.IntrinsicElements` out of a framework's shipped `.d.ts` files.
 *
 * Declaration files are the stable public surface — far safer to read than
 * minified `dist` bundles, and they carry the prop types we need anyway. The
 * compiler work stays synchronous inside `Effect.sync`, because the TypeScript
 * API is synchronous and pretending otherwise would only obscure it.
 */
const readIntrinsicElements = Effect.fnUntraced(function* (
  fixtureDir: string,
  framework: FrameworkName,
  runtimeNames: ReadonlyArray<string>,
) {
  const probePath = join(fixtureDir, `probe-${framework}.ts`);
  yield* Effect.promise(() =>
    writeFile(
      probePath,
      `import type { JSX } from "${FRAMEWORKS[framework].jsx}"\nexport type Intrinsics = JSX.IntrinsicElements\n`,
    ),
  );

  const result = yield* Effect.sync(() => {
    const program = ts.createProgram([probePath], {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      jsx: ts.JsxEmit.ReactJSX,
      types: ["react"],
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(probePath);
    if (!source) return { ok: false as const, reason: "the probe file did not load" };

    const alias = source.statements.find(
      (s): s is ts.TypeAliasDeclaration =>
        ts.isTypeAliasDeclaration(s) && s.name.text === "Intrinsics",
    );
    if (!alias) return { ok: false as const, reason: "JSX.IntrinsicElements did not resolve" };
    const intrinsics = checker.getTypeAtLocation(alias.name);

    const elements: Record<string, ElementFacts> = {};
    const domLeaks: string[] = [];

    for (const symbol of intrinsics.getProperties()) {
      const declaration = symbol.declarations?.[0];
      const declaredIn = declaration?.getSourceFile().fileName ?? "";
      const name = symbol.getName();

      // Anything declared outside @opentui is inherited from React's DOM types:
      // it typechecks in JSX but has no renderable behind it.
      if (!declaredIn.includes("@opentui")) {
        domLeaks.push(name);
        continue;
      }

      const propsType = checker.getTypeOfSymbolAtLocation(symbol, declaration!);
      elements[name] = {
        props: propsType
          .getProperties()
          .map((p) => p.getName())
          .toSorted(),
        textNode: TEXT_NODE_ELEMENTS.has(name),
        typed: true,
      };
    }

    // Runtime wins: a name the reconciler constructs renders fine even when the
    // declarations forgot it, and flagging it would be a false positive.
    for (const name of runtimeNames) {
      elements[name] ??= { props: [], textNode: TEXT_NODE_ELEMENTS.has(name), typed: false };
    }

    return {
      ok: true as const,
      facts: {
        elements: Object.fromEntries(
          Object.entries(elements).toSorted(([a], [b]) => a.localeCompare(b)),
        ),
        domLeaks: domLeaks.toSorted(),
        acceptsAnyElement:
          checker.getIndexTypeOfType(intrinsics, ts.IndexKind.String) !== undefined,
      } satisfies FrameworkFacts,
    };
  });

  if (!result.ok) return yield* new TypesUnreadable({ framework, reason: result.reason });
  return result.facts;
});

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** Every prop name that appears on at least one element, in either binding. */
function allProps(frameworks: Record<FrameworkName, FrameworkFacts>): string[] {
  const names = new Set<string>();
  for (const facts of Object.values(frameworks)) {
    for (const element of Object.values(facts.elements)) {
      for (const prop of element.props) names.add(prop);
    }
  }
  return [...names].toSorted();
}

/**
 * OpenTUI's color props all end in Color/Bg/Fg, or are the bare `fg`/`bg`/
 * `color` on text. Intersecting that shape with the real prop surface keeps
 * the list honest in both directions: nothing invented, nothing missed.
 */
function derivedColorProps(frameworks: Record<FrameworkName, FrameworkFacts>): string[] {
  return allProps(frameworks).filter(
    (name) => /(?:Color|Bg|Fg)$/.test(name) || name === "fg" || name === "bg" || name === "color",
  );
}

function derivedSpacingProps(frameworks: Record<FrameworkName, FrameworkFacts>): string[] {
  return allProps(frameworks).filter(
    (name) => /^(?:padding|margin)/.test(name) || /^(?:row|column)?[Gg]ap$/.test(name),
  );
}

function render(
  version: string,
  colors: ReadonlyArray<string>,
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
`;
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const sync = Effect.fnUntraced(function* (version: string, check: boolean) {
  const fixtureDir = yield* fixture(version);

  const installed = yield* Effect.promise(() =>
    readFile(join(fixtureDir, "node_modules", "@opentui", "core", "package.json"), "utf8"),
  ).pipe(Effect.map((raw) => JSON.parse(raw).version as string));

  // The three probes are independent — two spawned Bun processes and one pure
  // read — so they run together rather than one after another.
  const [colors, reactNames, solidNames] = yield* Effect.all(
    [
      probeColors(fixtureDir),
      probeCatalogue(fixtureDir, "react"),
      probeCatalogue(fixtureDir, "solid"),
    ],
    { concurrency: "unbounded" },
  );

  const frameworks = {
    react: yield* readIntrinsicElements(fixtureDir, "react", reactNames),
    solid: yield* readIntrinsicElements(fixtureDir, "solid", solidNames),
  };

  const source = render(installed, colors, frameworks);

  if (check) {
    const current = yield* Effect.promise(() => readFile(OUT_FILE, "utf8").catch(() => ""));
    if (current.trim() !== source.trim()) return yield* new CatalogStale({ version: installed });
    return yield* Effect.logInfo(`catalog is current for @opentui/core@${installed}`);
  }

  yield* Effect.promise(() => writeFile(OUT_FILE, source));
  const counts = Object.entries(frameworks)
    .map(
      ([name, f]) =>
        `${name}: ${Object.keys(f.elements).length} elements, ${f.domLeaks.length} DOM leaks`,
    )
    .join(" · ");
  yield* Effect.logInfo(
    `wrote catalog for @opentui/core@${installed} — ${colors.length} colors · ${counts}`,
  );
});

/** Reports the failure in the terms it happened in, and exits non-zero. */
const fail = (message: string) =>
  Effect.logError(message).pipe(Effect.andThen(Effect.sync(() => process.exit(1))));

const args = process.argv.slice(2);
const versionFlag = args.indexOf("--version");

BunRuntime.runMain(
  sync(
    versionFlag === -1 ? "latest" : (args[versionFlag + 1] ?? "latest"),
    args.includes("--check"),
  ).pipe(
    Effect.scoped,
    Effect.catchTag("CatalogStale", (error) =>
      fail(`Catalog is stale for @opentui/core@${error.version}. Run \`bun run catalog:sync\`.`),
    ),
    Effect.catchTag("InstallFailed", (error) =>
      fail(`\`${error.command}\` exited ${error.exitCode}\n${error.stderr}`),
    ),
    Effect.catchTag("ProbeFailed", (error) =>
      fail(`the ${error.probe} probe failed\n${error.stderr}`),
    ),
    Effect.catchTag("TypesUnreadable", (error) =>
      fail(`could not read @opentui/${error.framework}'s JSX types: ${error.reason}`),
    ),
  ),
);
