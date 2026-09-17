import { relative } from "node:path";
import { isSpacingProp } from "../catalog/index.js";
import { designSystemFor, isDesignSystemSource } from "../project/design-system.js";
import type { DensityTokens } from "../project/design-system.js";
import {
  attributeName,
  elementName,
  isHostElement,
  objectEntries,
  resolveObjectExpression,
  staticNumber,
  staticString,
} from "../project/jsx.js";
import { defineRule } from "../project/rule.js";
import type { Node } from "../project/types.js";

/**
 * A literal that happens to equal a theme token is not wrong — it renders the
 * same frame as the token would. It is *pinned*: `components/ui/theme.ts`
 * builds a live store, and every recipe that reads through the token instead
 * of a literal follows it when the project switches themes or swaps in
 * another preset. A literal does not, because there is nothing in it for a
 * theme change to re-read.
 *
 * That gap does not show up as a type error — `paddingX` is `number`,
 * `borderStyle` is a string union, `content` is `string`, and a coincidental
 * literal typechecks identically to an intentional one. This rule is the
 * difference: it compares the literal's *value* against the tokens the
 * project's own theme module declares, and reports the match.
 *
 * Deliberately narrow. Only a statically-evident literal is checked — an
 * expression rooted at the theme (`tokens.density.paddingX`, the Solid
 * accessor `tokens().density.paddingX`, `theme.get().density.paddingX`) is
 * already what this rule is asking for, and `staticNumber`/`staticString`
 * simply do not resolve those to a value, so they are never reported.
 */

type Category = "density" | "borders" | "glyphs";
const ALL_CATEGORIES: Category[] = ["density", "borders", "glyphs"];

/**
 * Value -> every token name that holds it.
 *
 * A theme is free to give two density numbers or two glyphs the same value
 * (`gutter` and `paddingX` both `1`, two check-style glyphs both `"✓"`), and
 * picking one to report would be a guess dressed up as a fact. Keeping every
 * name means the message can list all of them instead.
 *
 * `0` is excluded here, not just at the call site: it is the universal
 * "none" a project reaches for constantly, and a theme that happens to name
 * a token `0` should not turn every legitimate `paddingX={0}` into a report.
 */
function reverseNumberMap(tokens: DensityTokens): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const [name, value] of Object.entries(tokens)) {
    if (value === 0) continue;
    const existing = map.get(value);
    if (existing) existing.push(name);
    else map.set(value, [name]);
  }
  return map;
}

function reverseStringMap(tokens: Record<string, string>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [name, value] of Object.entries(tokens)) {
    const existing = map.get(value);
    if (existing) existing.push(name);
    else map.set(value, [name]);
  }
  return map;
}

/**
 * One message shape for all three categories, in the order the repo's rules
 * are held to: what breaks, why the type checker missed it, what to write.
 *
 * Two or more refs means the value is ambiguous — the message stops short of
 * naming a fix, because picking one of two equally-valid tokens would be the
 * same unproven guess the rule exists to avoid.
 */
function buildMessage(
  literalText: string,
  element: string,
  refs: string[],
  themeRel: string,
  typeDesc: string,
): string {
  if (refs.length > 1) {
    return (
      `${literalText} on <${element}> equals more than one token in ${themeRel} — ` +
      `${refs.join(" and ")} are all that value, and a literal does not distinguish them. ` +
      `The prop type is just \`${typeDesc}\`, so nothing else disambiguates them either, and neither is reached ` +
      `by a theme switch or a preset swap the way the token would be. ` +
      `Name the one you meant instead of the literal.`
    );
  }
  const ref = refs[0]!;
  return (
    `${literalText} on <${element}> equals ${ref}'s current value, but a literal does not follow it: ` +
    `a theme switch or a preset swap re-reads the theme store, not this value. ` +
    `The prop type is just \`${typeDesc}\`, so nothing distinguishes a coincidental match from an intentional ` +
    `token reference. Write ${ref} (${themeRel}) instead.`
  );
}

export default defineRule(
  {
    type: "suggestion",
    docs: {
      description:
        "A literal that equals a theme token should be the token, so a theme switch reaches it.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-magic-density.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          check: {
            type: "array",
            items: { type: "string", enum: ALL_CATEGORIES },
            description:
              "Token categories to check. Defaults to all three: density, borders, glyphs.",
          },
        },
        additionalProperties: false,
      },
    ],
  },
  (context) => {
    const options = context.options[0] ?? {};
    const enabled = new Set<Category>((options.check as Category[] | undefined) ?? ALL_CATEGORIES);

    const handlers: Record<string, (node: Node) => void> = {};

    const system = designSystemFor(context);
    // No theme in scope, or this file *is* the theme/a recipe: both are
    // silence, not a finding. `components/ui/button.tsx` setting
    // `paddingX={tokens.density.paddingX}` is the correct code, and a preset
    // theme file is forty lines of correct raw values, by design.
    if (!system || isDesignSystemSource(context, system)) return handlers;

    const themeRel = relative(process.cwd(), system.themeFile) || system.themeFile;
    const densityByValue = reverseNumberMap(system.tokens.density);
    const glyphsByValue = reverseStringMap(system.tokens.glyphs);
    const borderStyleToken = system.tokens.borderStyle;

    function accessPrefix(): string {
      // Solid's theme hook returns a signal, read by calling it; React's
      // returns the object directly. Both read the same live store — this is
      // only the spelling difference between the two bindings.
      return context.framework === "solid" ? "tokens()" : "tokens";
    }

    function checkDensity(prop: string, valueNode: Node, reportNode: Node, element: string): void {
      if (!enabled.has("density") || !isSpacingProp(prop)) return;
      const value = staticNumber(valueNode);
      if (value === undefined || value === 0) return;
      const names = densityByValue.get(value);
      if (!names) return;
      const refs = names.map((name) => `${accessPrefix()}.density.${name}`);
      context.report({
        node: reportNode,
        message: buildMessage(`${prop}={${value}}`, element, refs, themeRel, "number"),
      });
    }

    function checkBorders(prop: string, valueNode: Node, reportNode: Node, element: string): void {
      if (!enabled.has("borders") || prop !== "borderStyle" || borderStyleToken === undefined)
        return;
      const value = staticString(valueNode);
      if (value === undefined || value !== borderStyleToken) return;
      const refs = [`${accessPrefix()}.borders.style`];
      context.report({
        node: reportNode,
        message: buildMessage(`${prop}="${value}"`, element, refs, themeRel, "string"),
      });
    }

    function checkGlyphs(prop: string, valueNode: Node, reportNode: Node, element: string): void {
      if (!enabled.has("glyphs") || prop !== "content") return;
      const value = staticString(valueNode);
      if (value === undefined) return;
      const names = glyphsByValue.get(value);
      if (!names) return;
      const refs = names.map((name) => `${accessPrefix()}.glyphs.${name}`);
      context.report({
        node: reportNode,
        message: buildMessage(`${prop}="${value}"`, element, refs, themeRel, "string"),
      });
    }

    function check(prop: string, valueNode: Node, reportNode: Node, element: string): void {
      checkDensity(prop, valueNode, reportNode, element);
      checkBorders(prop, valueNode, reportNode, element);
      checkGlyphs(prop, valueNode, reportNode, element);
    }

    handlers.JSXOpeningElement = (node) => {
      const element = elementName(node);
      if (!element || !isHostElement(element)) return;

      for (const attribute of (node.attributes ?? []) as Node[]) {
        const name = attributeName(attribute);
        if (!name) continue;

        if (name === "style") {
          const expression =
            attribute.value?.type === "JSXExpressionContainer"
              ? attribute.value.expression
              : undefined;
          const object = resolveObjectExpression(context, expression);
          if (!object) continue;
          for (const entry of objectEntries(object)) {
            check(entry.key, entry.valueNode, entry.node, element);
          }
          continue;
        }

        if (attribute.value) check(name, attribute.value, attribute, element);
      }
    };

    return handlers;
  },
);
