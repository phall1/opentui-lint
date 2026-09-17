import { describe, expect, test } from "bun:test";
import { ESLint, type Linter } from "eslint";
import { join } from "node:path";

/**
 * The example READMEs make numbers a promise: "opentui-lint finds fifteen",
 * "seven of the fifteen are gone", "tsc finds one". Those numbers are only
 * true until a rule's wording or a fix's output changes shape, and nothing
 * else in the repo would notice the drift — a stale README just sits there
 * looking authoritative.
 *
 * This file re-derives every one of those numbers from the real linter and
 * the real compiler, against the example directories exactly as a person
 * would run them (`eslint .`, `eslint . --fix`, `tsc --noEmit`), and fails
 * loudly the moment reality and prose disagree.
 */

const REACT_DIR = join(import.meta.dir, "..", "..", "examples", "dashboard-react");
const SOLID_DIR = join(import.meta.dir, "..", "..", "examples", "dashboard-solid");

async function lint(dir: string, file: string): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({ cwd: dir });
  const [result] = await eslint.lintFiles([file]);
  return result!.messages;
}

async function lintFixed(dir: string, file: string): Promise<Linter.LintMessage[]> {
  // `fix: true` computes the fix in memory on `result.output`; it is never
  // written back with `ESLint.outputFixes`, so the specimen file this reads
  // is untouched by running the suite.
  const eslint = new ESLint({ cwd: dir, fix: true });
  const [result] = await eslint.lintFiles([file]);
  return result!.messages;
}

function byRule(messages: Linter.LintMessage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const message of messages) {
    const rule = message.ruleId ?? "<no-rule>";
    counts[rule] = (counts[rule] ?? 0) + 1;
  }
  return counts;
}

/**
 * Shells out to the example's own local `tsc`, the same binary `bunx tsc`
 * would resolve, so a version pinned in one example's package.json can't
 * silently diverge from what this test checks. `--pretty false` keeps each
 * diagnostic's location line unwrapped and greppable.
 */
function runTsc(dir: string): { count: number; stdout: string } {
  const tsc = join(dir, "node_modules", ".bin", "tsc");
  const result = Bun.spawnSync([tsc, "--noEmit", "-p", "tsconfig.json", "--pretty", "false"], {
    cwd: dir,
  });
  const stdout = result.stdout.toString();
  const diagnostics = stdout.match(/^\S.*\(\d+,\d+\): error TS\d+:.*$/gm) ?? [];
  return { count: diagnostics.length, stdout };
}

describe("examples/dashboard-react/README.md", () => {
  test("opentui-lint finds fifteen, six per rule as documented", async () => {
    const messages = await lint(REACT_DIR, "dashboard.tsx");

    expect(messages.length).toBe(15);
    expect(byRule(messages)).toEqual({
      "opentui/no-unknown-elements": 2,
      "opentui/text-must-be-wrapped": 2,
      "opentui/no-orphan-text-nodes": 2,
      "opentui/valid-colors": 3,
      "opentui/no-web-props": 3,
      "opentui/no-website-spacing": 3,
    });
  });

  test("--fix resolves seven, leaves eight, exactly as the two tables claim", async () => {
    const before = await lint(REACT_DIR, "dashboard.tsx");
    const after = await lintFixed(REACT_DIR, "dashboard.tsx");

    expect(before.length - after.length).toBe(7);
    expect(after.length).toBe(8);
    expect(byRule(after)).toEqual({
      "opentui/no-website-spacing": 3,
      "opentui/no-web-props": 3,
      "opentui/valid-colors": 1,
      "opentui/text-must-be-wrapped": 1,
    });
  });

  test("the posted --fix diff is the diff the fixer actually produces", async () => {
    const eslint = new ESLint({ cwd: REACT_DIR, fix: true });
    const [result] = await eslint.lintFiles(["dashboard.tsx"]);
    const fixed = result!.output;

    expect(fixed, "fix: true should have produced rewritten output").toBeDefined();
    // <div><b>Deploys</b></div> -> <box><text><b>Deploys</b></text></box>
    expect(fixed).toContain("<box>\n        <text><b>Deploys</b></text>\n      </box>");
    // <p>All systems nominal</p> -> <text>All systems nominal</text>
    expect(fixed).toContain("<text>All systems nominal</text>");
    // only the "indigo" branch of the ternary is rewritten, not the whole expression
    expect(fixed).toContain(
      'backgroundColor={service.id === selected ? "#4b0082" : "transparent"}',
    );
    // rgb(100, 116, 139) -> its exact hex equivalent
    expect(fixed).toContain('<box borderColor="#64748b" border>');
    // the untypeable run stays a suggestion, not a fix: "services" is still unwrapped
    expect(fixed).toContain("{services.length} services");
  });

  test("dashboard.fixed.tsx is what it claims to be: every issue resolved", async () => {
    const messages = await lint(REACT_DIR, "dashboard.fixed.tsx");
    expect(messages).toEqual([]);
  });

  test("tsc finds exactly the one documented BoxProps error", () => {
    const { count, stdout } = runTsc(REACT_DIR);

    expect(count).toBe(1);
    expect(stdout).toContain("dashboard.tsx(34,13): error TS2322:");
    expect(stdout).toContain("Property 'className' does not exist on type 'BoxProps'.");
  });
});

describe("examples/dashboard-solid/README.md", () => {
  // The Solid README doesn't carry a per-rule table the way the React one
  // does, but the root README's "fourteen" and this file's quoted strings are
  // both claims about this exact lint run, so they get pinned here too.
  test("opentui-lint finds fourteen", async () => {
    const messages = await lint(SOLID_DIR, "dashboard.tsx");

    expect(messages.length).toBe(14);
    expect(byRule(messages)).toEqual({
      "opentui/no-website-spacing": 3,
      "opentui/valid-colors": 3,
      "opentui/no-web-props": 3,
      "opentui/no-unknown-elements": 3,
      "opentui/no-orphan-text-nodes": 1,
      "opentui/text-must-be-wrapped": 1,
    });
  });

  test("--fix resolves seven and leaves seven", async () => {
    const before = await lint(SOLID_DIR, "dashboard.tsx");
    const after = await lintFixed(SOLID_DIR, "dashboard.tsx");

    expect(before.length - after.length).toBe(7);
    expect(after.length).toBe(7);
    expect(byRule(after)).toEqual({
      "opentui/no-website-spacing": 3,
      "opentui/valid-colors": 1,
      "opentui/no-web-props": 3,
    });
  });

  test("tsc finds exactly the one documented BoxProps error", () => {
    const { count, stdout } = runTsc(SOLID_DIR);

    expect(count).toBe(1);
    expect(stdout).toContain("dashboard.tsx(34,15): error TS2322:");
    expect(stdout).toContain("Property 'className' does not exist on type 'BoxProps'.");
  });

  // Every string block-quoted in the README, verbatim. A message that quotes
  // an error the codebase does not contain is worse than no message — see
  // AGENTS.md — and a README is exactly as capable of that mistake as a rule.
  test("the two quoted diagnostics read exactly as printed", async () => {
    const messages = await lint(SOLID_DIR, "dashboard.tsx");
    const text = messages.map((message) => message.message);

    expect(text).toContainEqual(
      "<div> is an HTML element and OpenTUI has no renderable for it. It typechecks " +
        "because @opentui/solid's JSX namespace has a string index signature for " +
        'extend(); at render it throws "[Reconciler] Unknown component type: div" and ' +
        "there is no error boundary, so the render throws. Use <box>.",
    );

    expect(text).toContainEqual(
      "<ascii-font> is the @opentui/react spelling. This file renders with " +
        "@opentui/solid, which calls it <ascii_font>. Rendering <ascii-font> throws " +
        '"[Reconciler] Unknown component type: ascii-font".',
    );
  });

  test("the comparison table's short quotes appear in real messages", async () => {
    const messages = await lint(SOLID_DIR, "dashboard.tsx");
    const text = messages.map((message) => message.message).join("\n");

    expect(text).toContain("[Reconciler] Unknown component type: div");
    expect(text).toContain('Orphan text error: "…" must have a <text> as a parent');
  });
});
