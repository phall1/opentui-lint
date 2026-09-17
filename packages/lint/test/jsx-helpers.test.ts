import { describe, expect, test } from "bun:test";
import tsParser from "@typescript-eslint/parser";
import { elementName } from "../src/project/jsx.js";

/** The opening element of a single JSX expression. */
function openingElementOf(source: string) {
  const ast = tsParser.parse(source, { ecmaFeatures: { jsx: true } }) as any;
  return ast.body[0].expression.openingElement;
}

describe("elementName", () => {
  test.each([
    ["<box />", "box"],
    ["<ascii-font />", "ascii-font"],
    ["<ascii_font />", "ascii_font"],
    ["<Button />", "Button"],
  ])("%s -> %s", (source, expected) => {
    expect(elementName(openingElementOf(source))).toBe(expected);
  });

  test("resolves a compound name rather than losing its head", () => {
    // Regression: the member-expression branch recurses with a bare
    // JSXIdentifier, which used to fall through to `node.name` — a string on an
    // identifier, not a node — so this produced "?.Content". Nothing caught it
    // because no rule fired on capitalized JSX until no-restyle.
    expect(elementName(openingElementOf("<Dialog.Content />"))).toBe("Dialog.Content");
    expect(elementName(openingElementOf("<A.B.C />"))).toBe("A.B.C");
  });

  test("accepts a name node directly, which is how the recursion calls it", () => {
    const opening = openingElementOf("<Dialog.Content />");
    expect(elementName(opening.name.object)).toBe("Dialog");
  });

  test("keeps a namespaced name intact", () => {
    expect(elementName(openingElementOf("<svg:circle />"))).toBe("svg:circle");
  });
});
