import {
  attributeName,
  elementName,
  isHostElement,
  objectEntries,
  resolveObjectExpression,
  staticNumber,
  staticStrings,
} from "../project/jsx.js";
import { defineRule } from "../project/rule.js";
import type { Node } from "../project/types.js";

/**
 * Values the public types accept and the runtime does not honor.
 *
 * These are the hardest defects to find by reading code, because the type
 * checker actively tells you they are fine. Every case below was confirmed by
 * rendering it and comparing computed geometry against a control tree; see
 * `packages/conformance`.
 *
 * The pattern behind all of them is the same: `Renderable`'s option interfaces
 * are wider than the validators in `lib/renderable.validations.ts` that gate
 * the assignments. `PositionTypeString` includes `"static"` but
 * `isPositionTypeType` accepts only `"relative"` and `"absolute"`; the min/max
 * dimension options are typed `number | "auto" | \`${number}%\`` but `isSizeType`
 * rejects `"auto"`. An unvalidated value falls off the end of an `if` with no
 * `else`, so nothing is assigned and nothing is said.
 */

interface Finding {
  message: string;
}

const DIMENSION_PROPS = new Set([
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
]);
const MIN_MAX_PROPS = new Set(["minWidth", "minHeight", "maxWidth", "maxHeight"]);

/** `alignItems` accepts these, and they are not what they look like. */
const ALIGN_SPACE_VALUES = new Set(["space-between", "space-around", "space-evenly"]);

function check(prop: string, value: Node, framework: "react" | "solid"): Finding | undefined {
  const strings = staticStrings(value);

  for (const site of strings) {
    if (prop === "position" && site.value === "static") {
      return {
        message:
          `position="static" is accepted by the types and ignored by the runtime. ` +
          `PositionTypeString includes it, but isPositionTypeType accepts only "relative" and "absolute", ` +
          `so the constructor coerces it to "relative". ` +
          `Worse, on a *change* the setter returns early instead of assigning — so switching a renderable to ` +
          `"static" leaves it at whatever it was before, including "absolute". ` +
          `Use "relative" if you meant normal flow, or drop the prop entirely.`,
      };
    }

    if (MIN_MAX_PROPS.has(prop) && site.value === "auto") {
      return {
        message:
          `${prop}="auto" is accepted by the types and ignored by the runtime. ` +
          `The option is typed \`number | "auto" | \\\`\${number}%\\\`\`, but isSizeType rejects "auto" for the ` +
          `four min/max dimensions, so the value is dropped and no constraint is applied at all. ` +
          `Use a number of cells, a percentage such as "50%", or remove the prop — the default is already unset.`,
      };
    }

    if (prop === "alignItems" && ALIGN_SPACE_VALUES.has(site.value)) {
      return {
        message:
          `alignItems="${site.value}" typechecks — it is a member of AlignString — but it does not distribute ` +
          `anything. alignItems positions children on the cross axis, where there is nothing to space out, ` +
          `so Yoga lays the child out flush to the end: the result is indistinguishable from "flex-end". ` +
          `Use justifyContent="${site.value}" for distribution along the main axis, or alignItems="center"/"flex-end".`,
      };
    }
  }

  if (DIMENSION_PROPS.has(prop)) {
    const numeric = staticNumber(value);
    if (numeric !== undefined && numeric < 0) {
      return {
        message:
          `${prop}={${numeric}} throws at render: "Invalid ${prop} for Renderable <id>: ${numeric}". ` +
          `The option is typed \`number\`, which does not exclude negatives, but the runtime validates the sign. ` +
          (framework === "react"
            ? `The throw happens inside the reconciler's commit, so it never reaches your code — the ` +
              `ErrorBoundary catches it and paints a TypeError where your app should be. `
            : `There is no error boundary, so the render throws. `) +
          `Terminal geometry is a count of cells and cannot be negative.`,
      };
    }
  }

  return undefined;
}

export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Disallow values OpenTUI's types accept but its runtime ignores or rejects.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-unsupported-values.md",
    },
    schema: [],
  },
  (context) => {
    function inspect(prop: string, valueNode: Node, reportNode: Node): void {
      const finding = check(prop, valueNode, context.framework);
      if (finding) context.report({ node: reportNode, message: finding.message });
    }

    return {
      JSXOpeningElement(node) {
        const element = elementName(node);
        if (!element || !isHostElement(element)) return;

        for (const attribute of (node.attributes ?? []) as Node[]) {
          const name = attributeName(attribute);
          if (!name || !attribute.value) continue;

          if (name === "style") {
            const expression =
              attribute.value.type === "JSXExpressionContainer"
                ? attribute.value.expression
                : undefined;
            const object = resolveObjectExpression(context, expression);
            if (!object) continue;
            for (const entry of objectEntries(object)) {
              inspect(entry.key, entry.valueNode, entry.node);
            }
            continue;
          }

          inspect(name, attribute.value, attribute);
        }
      },
    };
  },
);
