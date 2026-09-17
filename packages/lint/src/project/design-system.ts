import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { readSettings } from "./framework.js";
import type { RuleContext } from "./types.js";

/**
 * The project model the design-system rules share: where the theme lives, what
 * is in it, which components belong to the design system, and which files are
 * the design system itself and must therefore never be linted by these rules.
 *
 * Two constraints shape every decision here.
 *
 * The first is that the published package has zero runtime dependencies, so
 * there is no TypeScript compiler API available at lint time. The theme is read
 * with a small purpose-built scanner rather than a parser. That is a real
 * limitation and it is stated in the rule docs: only literal values are
 * recovered.
 *
 * The second is that a design system installed by the shadcn CLI leaves **no
 * manifest behind**. tuiparts says so outright — "tuiparts.sh does not write
 * hidden revision state into the consumer's project" — and its items install
 * without needing a `components.json` at all. So there is nothing to enumerate;
 * discovery has to work from file structure, and has to fail silently when it
 * finds nothing rather than guessing.
 */

/** Where recipes land by default, relative to a package root. */
const CONVENTIONAL_UI_DIRS = [
  join("components", "ui"),
  join("src", "components", "ui"),
  join("app", "components", "ui"),
];

const THEME_BASENAMES = ["theme.ts", "theme.tsx"];

/**
 * A theme module proves itself by structure, not by where it sits.
 *
 * A file exporting `createThemeStore` alongside a `Tokens` type is the tuiparts
 * theme wherever someone has moved it to, which makes this the one signal that
 * survives a consumer reorganising their project.
 */
function looksLikeTheme(source: string): boolean {
  return source.includes("createThemeStore") && /\b(?:interface|type)\s+Tokens\b/.test(source);
}

export interface DensityTokens {
  [name: string]: number;
}

export interface ThemeTokens {
  /** `density.paddingX`-style numbers, by token name. */
  density: DensityTokens;
  /** `borders.style`, when it is a literal. */
  borderStyle?: string;
  /** `glyphs.check` and friends, by token name. */
  glyphs: Record<string, string>;
  /**
   * Literal colors only, lowercased, by token name.
   *
   * Usually empty. tuiparts' default theme is built from `RGBA.fromIndex(8)`
   * and `RGBA.defaultBackground()` — values that only exist once a terminal
   * resolves its palette — so there is nothing to match a hex literal against
   * unless the project ships a preset theme with real hex in it.
   */
  colors: Record<string, string>;
}

export interface DesignSystem {
  /** Absolute path to the theme module. */
  themeFile: string;
  /** Directory recipes live in, absolute. */
  uiDir: string | undefined;
  tokens: ThemeTokens;
}

/**
 * Removes `interface X { … }` and `type X = { … }` declarations.
 *
 * Without this the scanner finds the `Tokens` *interface* first and reads its
 * field types instead of the theme's values — `density` comes back empty
 * because its members are `number`, and `borders.style` reads `"single"` off
 * the first member of the union rather than from the theme. The right answer by
 * coincidence is still the wrong mechanism.
 */
function stripTypeDeclarations(source: string): string {
  let result = "";
  let index = 0;

  const declaration = /\b(?:interface\s+\w+[^{]*|type\s+\w+\s*=\s*)\{/g;
  for (let match = declaration.exec(source); match; match = declaration.exec(source)) {
    if (match.index < index) continue;
    result += source.slice(index, match.index);

    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    index = i + 1;
    declaration.lastIndex = index;
  }

  return result + source.slice(index);
}

/**
 * Extracts one `name: { … }` block from an object literal.
 *
 * Brace-matching rather than a regex over the whole file, because the token
 * groups nest and a value can contain braces of its own.
 */
function sectionOf(source: string, name: string): string | undefined {
  const header = new RegExp(`\\b${name}\\s*:\\s*\\{`).exec(source);
  if (!header) return undefined;

  let depth = 0;
  const start = header.index + header[0].length;
  for (let i = start - 1; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  return undefined;
}

/**
 * `name: 2` pairs.
 *
 * The terminator is a lookahead rather than a required delimiter: the last
 * entry of a single-line group — `density: { paddingX: 1, comfortablePaddingX: 2 }`
 * — has nothing after it but a space, and requiring a comma silently dropped it.
 */
function numberEntries(section: string): DensityTokens {
  const entries: DensityTokens = {};
  for (const match of section.matchAll(/(\w+)\s*:\s*(-?\d+(?:\.\d+)?)(?![\w.])/g)) {
    entries[match[1]!] = Number(match[2]);
  }
  return entries;
}

/** `name: "value"` pairs. */
function stringEntries(section: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const match of section.matchAll(/(\w+)\s*:\s*["'`]([^"'`]*)["'`]/g)) {
    entries[match[1]!] = match[2]!;
  }
  return entries;
}

/**
 * Reads the literal tokens out of a theme module.
 *
 * Deliberately shallow. A value produced by a call — `RGBA.fromIndex(8)`,
 * `tint(a, b, 0.3)` — has no static value, and inventing one would produce
 * confidently wrong diagnostics. Those simply do not appear in the result, and
 * the rules treat an absent token as "nothing to say".
 */
export function readThemeTokens(rawSource: string): ThemeTokens {
  const source = stripTypeDeclarations(rawSource);
  const density = sectionOf(source, "density");
  const glyphs = sectionOf(source, "glyphs");
  const borders = sectionOf(source, "borders");
  const colors = sectionOf(source, "colors");

  const literalColors: Record<string, string> = {};
  for (const [name, value] of Object.entries(colors ? stringEntries(colors) : {})) {
    // Only a real color is useful; a token whose value is a call was skipped by
    // `stringEntries` already, but a stray non-color string could slip through.
    if (/^#[0-9a-f]{3,8}$/i.test(value)) literalColors[name] = value.toLowerCase();
  }

  return {
    density: density ? numberEntries(density) : {},
    borderStyle: borders ? stringEntries(borders).style : undefined,
    glyphs: glyphs ? stringEntries(glyphs) : {},
    colors: literalColors,
  };
}

/** Memoized per directory: discovery walks the filesystem and never changes mid-run. */
const discoveryCache = new Map<string, DesignSystem | null>();

function discoverFrom(
  startDir: string,
  configuredTheme?: string,
  configuredUi?: string,
): DesignSystem | null {
  if (configuredTheme) {
    const themeFile = resolve(configuredTheme);
    if (!existsSync(themeFile)) return null;
    return {
      themeFile,
      uiDir: configuredUi ? resolve(configuredUi) : dirname(themeFile),
      tokens: readThemeTokens(readFileSync(themeFile, "utf8")),
    };
  }

  let dir = startDir;
  for (;;) {
    for (const uiRelative of CONVENTIONAL_UI_DIRS) {
      for (const basename of THEME_BASENAMES) {
        const candidate = join(dir, uiRelative, basename);
        if (!existsSync(candidate)) continue;
        const source = readFileSync(candidate, "utf8");
        // The path convention found it; the structure confirms it is really a
        // theme and not some unrelated `theme.ts`.
        if (!looksLikeTheme(source)) continue;
        return {
          themeFile: candidate,
          uiDir: join(dir, uiRelative),
          tokens: readThemeTokens(source),
        };
      }
    }

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The design system in scope for a file, or `null` when there is none.
 *
 * Returning `null` silently is correct for an unconfigured project and wrong
 * for a misconfigured one, so `settings.opentui.theme` pointing at a file that
 * does not exist is reported by `opentui-lint doctor` rather than ignored here.
 */
export function designSystemFor(context: RuleContext): DesignSystem | null {
  const settings = readSettings(context) as { theme?: string; ui?: string };
  const startDir = dirname(resolve(context.filename));
  const key = `${startDir} ${settings.theme ?? ""} ${settings.ui ?? ""}`;

  const cached = discoveryCache.get(key);
  if (cached !== undefined) return cached;

  const found = discoverFrom(startDir, settings.theme, settings.ui);
  discoveryCache.set(key, found);
  return found;
}

/**
 * True when the linted file *is* part of the design system.
 *
 * This is the exclusion that matters most. `components/ui/button.tsx` is the
 * thing that legitimately sets `backgroundColor={tokens.colors.primary}` and
 * `paddingX={tokens.density.paddingX}`; linting it would report a violation on
 * every recipe in the project. A preset theme under `themes/` is forty lines of
 * raw hex that is also entirely correct.
 */
export function isDesignSystemSource(context: RuleContext, system: DesignSystem | null): boolean {
  const file = resolve(context.filename);
  if (system?.uiDir && file.startsWith(system.uiDir + sep)) return true;
  if (system && file === system.themeFile) return true;

  // A recipe imports its theme relatively — `./theme`, `./use-theme` — which
  // identifies it even when a consumer has nested it deeper than the ui root.
  const text = context.sourceCode.getText();
  return /from\s+["']\.{1,2}\/(?:use-)?theme["']/.test(text);
}

/**
 * Whether a JSX component name refers to a design-system component.
 *
 * Resolved from the import specifier rather than the name: a `Button` imported
 * from the ui directory is the design system's Button whatever it was renamed
 * to, and a `Button` from somewhere else is not, however familiar it looks.
 * Without a module resolver this is textual, which covers the aliased and
 * relative spellings people actually write and honestly misses the rest.
 */
export function designSystemImports(
  program: { body?: unknown[] },
  uiDir: string | undefined,
): Set<string> {
  const owned = new Set<string>();
  if (!uiDir) return owned;

  const uiLeaf = uiDir.split(sep).slice(-2).join("/");

  for (const statement of (program.body ?? []) as Array<Record<string, any>>) {
    if (statement.type !== "ImportDeclaration") continue;
    const source = statement.source?.value;
    if (typeof source !== "string") continue;
    // `@/components/ui/button`, `~/components/ui/button`, `../ui/button`, and
    // the bare directory import all land in the same place.
    if (!source.includes(uiLeaf) && !/(^|\/)ui(\/|$)/.test(source)) continue;

    for (const specifier of (statement.specifiers ?? []) as Array<Record<string, any>>) {
      const local = specifier.local?.name;
      if (typeof local === "string") owned.add(local);
    }
  }
  return owned;
}

/** Exposed so tests can reset the per-directory discovery memoization. */
export function clearDesignSystemCache(): void {
  discoveryCache.clear();
}
