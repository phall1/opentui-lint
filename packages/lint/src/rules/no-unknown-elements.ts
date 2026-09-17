import {
  crossFrameworkName,
  domEquivalent,
  domRename,
  elementsFor,
  isDomElement,
  isInheritedDomElement,
  knowsElement,
  suggestElement,
} from "../catalog/index.js";
import { failureText, failureVisible, packageName } from "../catalog/runtime.js";
import { renameElement } from "../project/fixes.js";
import { elementName, isHostElement } from "../project/jsx.js";
import { defineRule } from "../project/rule.js";
import type { Fixer } from "../project/types.js";

/**
 * The flagship rule.
 *
 * `JSX.IntrinsicElements` in both OpenTUI bindings carries a string index
 * signature (from `ExtendedIntrinsicElements`, which exists so `extend()` can
 * add custom renderables). The side effect is that *every* lowercase tag
 * typechecks, in React and in Solid alike. React's interface additionally
 * extends `React.JSX.IntrinsicElements`, so all 164 HTML element names are in
 * scope with their full DOM prop types.
 *
 * At render each binding looks the tag up in its catalogue and throws. React
 * wraps the tree in an ErrorBoundary, so the app is replaced by a red stack
 * trace; Solid has no boundary and the render throws outright. Either way
 * there is no file and no line number.
 */
export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Disallow JSX elements OpenTUI cannot render.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-unknown-elements.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            description: "Extra element names to treat as valid.",
          },
        },
        additionalProperties: false,
      },
    ],
    fixable: "code",
    hasSuggestions: true,
  },
  (context) => {
    const allow = new Set<string>((context.options[0]?.allow as string[]) ?? []);

    return {
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (!name || !isHostElement(name)) return;
        if (allow.has(name) || context.extendedElements.has(name)) return;
        if (knowsElement(context.framework, name)) return;

        const framework = context.framework;
        const other = framework === "react" ? "solid" : "react";
        const throws = failureText(framework, "unknownElement", name);

        // Ordered most-specific first: a wrong-binding spelling and an HTML tag
        // are different mistakes and deserve different instructions.
        const renamed = crossFrameworkName(framework, name);
        if (renamed) {
          context.report({
            node,
            message:
              `<${name}> is the ${packageName(other)} spelling. ` +
              `This file renders with ${packageName(framework)}, which calls it <${renamed}>. ` +
              `Rendering <${name}> throws "${throws}".`,
            // The two bindings differ only in separator, so this is a pure
            // rename with exactly one right answer.
            fix: (fixer) => renameElement(node.parent ?? node, renamed, fixer),
          });
          return;
        }

        if (isDomElement(name)) {
          const rename = domRename(name);
          const replacement = domEquivalent(name);
          const why = isInheritedDomElement(framework, name)
            ? `It typechecks because ${packageName(framework)}'s JSX namespace extends React's DOM elements`
            : `It typechecks because ${packageName(framework)}'s JSX namespace has a string index signature for extend()`;
          context.report({
            node,
            message:
              `<${name}> is an HTML element and OpenTUI has no renderable for it. ` +
              `${why}; at render it throws "${throws}" and ` +
              `${failureVisible(framework, "unknownElement")}. ` +
              (replacement
                ? `Use ${replacement}.`
                : `Use <box> for layout and <text> for content.`),
            // Only the unambiguous mappings are rewritten. <button> and
            // <canvas> need a decision, not a substitution.
            ...(rename
              ? { fix: (fixer: Fixer) => renameElement(node.parent ?? node, rename, fixer) }
              : {}),
          });
          return;
        }

        const suggestion = suggestElement(framework, name);
        const facts = elementsFor(framework);
        const catalogue = Object.keys(facts.elements)
          .filter((element) => !facts.elements[element]!.textNode)
          .join(", ");

        context.report({
          node,
          message:
            `<${name}> is not in the ${packageName(framework)} catalogue, so it throws ` +
            `"${throws}" at render. ` +
            (suggestion
              ? `Did you mean <${suggestion}>?`
              : `Available elements: ${catalogue}. ` +
                `Register a custom renderable with extend({ ${name}: MyRenderable }) if it is your own.`),
          // A near-miss is offered rather than applied: a typo could equally
          // well be a custom renderable someone has not registered yet.
          ...(suggestion
            ? {
                suggest: [
                  {
                    desc: `Rename to <${suggestion}>`,
                    fix: (fixer: Fixer) => renameElement(node.parent ?? node, suggestion, fixer),
                  },
                ],
              }
            : {}),
        });
      },
    };
  },
);
