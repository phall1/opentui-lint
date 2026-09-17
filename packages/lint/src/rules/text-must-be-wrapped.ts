import { failureText, failureVisible } from "../catalog/runtime.js";
import { runContaining, textRuns, wrapRun } from "../project/fixes.js";
import type { TextRun } from "../project/fixes.js";
import { isDefinitelyText, textContext } from "../project/jsx.js";
import { defineRule } from "../project/rule.js";
import { typeChecking } from "../project/type-info.js";
import type { Fixer, Node } from "../project/types.js";

/**
 * `<box>Hello</box>` is the single most common way an OpenTUI app dies.
 *
 * Both bindings refuse it, by different routes. React's `createTextInstance`
 * checks its host context and throws "Text must be created inside of a text
 * node"; Solid builds the node happily and then fails on insert with
 * `Orphan text error: "Hello" must have a <text> as a parent`. TypeScript
 * cannot help with either: `children` is `ReactNode`/`JSX.Element`, which
 * includes `string`.
 *
 * The rule only reports text it can prove statically — a literal, a template
 * literal, a concatenation. `{label}` could be a string or an element, and
 * guessing there would make the rule untrustworthy.
 *
 * `checkTypes: true` raises that bar with type information instead of
 * lowering it: an expression is only reported through this tier when its
 * resolved type is *definitely* text (see `project/type-info.ts` for the
 * predicate). It is off by default and silently falls back to the syntactic
 * behavior above whenever there is no type checker to ask — no
 * `parserOptions.project` / `projectService`, a non-TypeScript parser, or
 * oxlint, which has no type information at all.
 */
export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Require string and number children to sit inside <text>.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/text-must-be-wrapped.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          checkTypes: {
            type: "boolean",
            description:
              "Also report expressions TypeScript can prove are text, using type information from " +
              "@typescript-eslint/parser. Requires parserOptions.project or projectService; silently " +
              "does nothing without it.",
          },
        },
        additionalProperties: false,
      },
    ],
    fixable: "code",
    hasSuggestions: true,
  },
  (context) => {
    // Resolved once per file, not per node: `typeChecking` does the parser-
    // services lookup and program/checker retrieval that stays constant for
    // the whole run. `undefined` here means either the option is off or there
    // is no type checker to use — both collapse to the same "syntactic only"
    // behavior below.
    const types = context.options[0]?.checkTypes ? typeChecking(context) : undefined;

    /**
     * Lets the fixer see what the type checker sees.
     *
     * Without it a type-only report carries no fix, which would make the tier
     * that catches the hardest cases the one that helps least.
     */
    const provenText = types
      ? (child: Node) =>
          child.type === "JSXExpressionContainer" &&
          types.definitelyText(child.expression) !== undefined
      : undefined;
    /**
     * A certain fix is applied; an uncertain one is offered.
     *
     * The split is `ambiguousNeighbor`: when an untypeable expression sits
     * against the run, any automatic wrap would be half a fix.
     */
    const wrapAction = (run: TextRun) =>
      run.ambiguousNeighbor
        ? {
            suggest: [
              {
                desc: "Wrap the text in <text>",
                fix: (fixer: Fixer) => wrapRun(context, run, fixer),
              },
            ],
          }
        : { fix: (fixer: Fixer) => wrapRun(context, run, fixer) };

    /**
     * Only the first offender in a run carries the fix.
     *
     * The fix wraps the whole run, so letting every member emit its own would
     * produce a pile of overlapping edits for one range. It also keeps
     * `no-orphan-text-nodes` from fighting this rule over a shared run.
     */
    const claimed = new WeakSet<Node>();

    const report = (
      node: Node,
      label: string,
      source: string,
      parent: string | undefined,
      typeText?: string,
    ) => {
      const where = parent ? `<${parent}>` : "a non-text element";
      const enclosing = node.parent;
      const run = enclosing
        ? runContaining(textRuns(enclosing, context.framework, provenText), node)
        : undefined;
      const owns = run !== undefined && !claimed.has(run.first);
      if (run && owns) claimed.add(run.first);

      context.report({
        node,
        message:
          `${label} renders as a text node outside <text>, so @opentui/${context.framework} throws ` +
          `"${failureText(context.framework, "textOutsideText")}" and ` +
          `${failureVisible(context.framework, "textOutsideText")}. ` +
          `TypeScript allows it because children are typed as ` +
          `${context.framework === "react" ? "ReactNode" : "JSX.Element"}, which includes strings. ` +
          (typeText
            ? // Names the exact type `checkTypes` resolved, so the report is
              // checkable against the same evidence the rule used — not just
              // an assertion to take on faith.
              `\`checkTypes\` resolved this expression's type as \`${typeText}\`, which cannot be anything but text. `
            : "") +
          `Wrap it: ${where} → <text>${source}</text>.`,
        // Grouping into a text run is purely syntactic (see fixes.ts), so a
        // type-only catch has no run to attach a fix to and reports plain —
        // still correct, just without the <text> suggestion.
        ...(run && owns ? wrapAction(run) : {}),
      });
    };

    return {
      JSXText(node) {
        // JSX drops whitespace-only text between elements, so only real content
        // reaches the reconciler.
        const content = String(node.value ?? "");
        if (content.trim() === "") return;

        const enclosing = textContext(node, context.framework);
        if (enclosing.inside || enclosing.crossedComponent) return;

        const trimmed = content.trim();
        report(node, JSON.stringify(trimmed), trimmed, enclosing.boundary);
      },

      JSXExpressionContainer(node) {
        if (node.parent?.type !== "JSXElement" && node.parent?.type !== "JSXFragment") return;

        const syntactic = isDefinitelyText(node.expression);
        // Syntactic proof first — it is free. Only ask the type checker (if
        // `checkTypes` gave us one) when the AST alone cannot decide.
        const typed = syntactic ? undefined : types?.definitelyText(node.expression);
        if (!syntactic && !typed) return;

        const enclosing = textContext(node, context.framework);
        if (enclosing.inside || enclosing.crossedComponent) return;

        const source = context.sourceCode.getText(node);
        report(node, source, source, enclosing.boundary, typed?.typeText);
      },
    };
  },
);
