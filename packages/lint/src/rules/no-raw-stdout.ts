import { defineRule } from "../project/rule.js";
import type { Node } from "../project/types.js";

/**
 * Writing to stdout yourself puts bytes inside the frame that never come out.
 *
 * Verified against a real pty rather than the test renderer, because the test
 * renderer's stdout is a sink and cannot show this. With the default
 * `screenMode: "alternate-screen"`, `externalOutputMode` is `"passthrough"`
 * and OpenTUI leaves `process.stdout.write` completely alone. A raw write
 * therefore lands verbatim on the same fd as the frame — outside the
 * synchronized-update block, with no cursor save or restore — wherever the
 * previous frame happened to leave the cursor.
 *
 * And it is permanent. OpenTUI diffs against its own in-memory buffer, which
 * the raw write never touched, so subsequent render loops emit zero bytes for
 * those cells. The corruption sits there until something else overwrites
 * exactly that run.
 *
 * `console.log` is fine and deliberately not reported: OpenTUI replaces the
 * global console and captures it into the debug overlay.
 *
 * The one configuration where this is safe is `screenMode: "split-footer"` with
 * `externalOutputMode: "capture-stdout"`, which installs a real interceptor.
 * That is not the default, and requesting it in any other screen mode throws.
 */

const STREAMS = new Set(["stdout", "stderr"]);
const WRITERS = new Set(["write"]);

/** `process.stdout.write(…)` / `process.stderr.write(…)` and Bun's equivalents. */
function isRawStreamWrite(node: Node): { stream: string } | undefined {
  const callee = node.callee;
  if (callee?.type !== "MemberExpression") return undefined;
  if (callee.property?.type !== "Identifier" || !WRITERS.has(callee.property.name))
    return undefined;

  const target = callee.object;
  if (target?.type !== "MemberExpression") return undefined;
  if (target.property?.type !== "Identifier" || !STREAMS.has(target.property.name))
    return undefined;

  const root = target.object;
  const rootName =
    root?.type === "Identifier"
      ? root.name
      : root?.type === "MemberExpression"
        ? root.property?.name
        : undefined;
  if (rootName !== "process" && rootName !== "Bun") return undefined;

  return { stream: target.property.name };
}

export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Disallow writing directly to stdout while a renderer owns the screen.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-raw-stdout.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowInFiles: {
            type: "array",
            items: { type: "string" },
            description:
              "Regex patterns for files that legitimately own stdout, such as a CLI entrypoint.",
          },
        },
        additionalProperties: false,
      },
    ],
  },
  (context) => {
    const allowPatterns = ((context.options[0]?.allowInFiles as string[]) ?? []).map(
      (pattern) => new RegExp(pattern),
    );
    const exempt = allowPatterns.some((pattern) => pattern.test(context.filename));

    return {
      CallExpression(node) {
        if (exempt) return;
        const match = isRawStreamWrite(node);
        if (!match) return;

        context.report({
          node,
          message:
            `Writing to process.${match.stream} directly corrupts the frame. With the default ` +
            `screenMode "alternate-screen", OpenTUI leaves process.${match.stream}.write untouched, so these ` +
            `bytes land on the same fd as the frame — outside the synchronized-update block, with no cursor ` +
            `save or restore — wherever the last frame left the cursor. The renderer diffs against its own ` +
            `buffer, which this never touched, so it never repaints those cells and the damage is permanent. ` +
            `Use console.log, which OpenTUI captures into the debug overlay, or render the value into a <text>.`,
        });
      },
    };
  },
);
