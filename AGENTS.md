# Working in this repo

`opentui-lint` reports OpenTUI mistakes that TypeScript cannot see. Its only
asset is being right, so accuracy beats coverage everywhere.

## Toolchain

Bun 1.4.2. `bun install` at the root; every package script runs through Bun.

```bash
bun run test        # every package
bun run typecheck
bun run lint        # oxlint over this repo's own source
bun run build       # builds packages/lint
```

## The two rules that matter

**Never assert something about OpenTUI you have not verified against the real
package.** Every fact the rules use lives in `packages/lint/src/catalog/generated.ts`
and is produced by `packages/lint/scripts/sync-catalog.ts`, which installs
OpenTUI into a temp directory and reads it. Do not hand-edit the generated file.
After bumping the supported version:

```bash
bun run catalog:sync
bun run --filter opentui-lint-conformance test
```

**Never report something you cannot prove.** A false positive costs more than a
missed case: the first thing a person does with a noisy linter is turn it off.
When an AST cannot decide — `{label}` could be a string or an element, a text
modifier returned from a component could be wrapped at the call site — the rule
stays quiet and the limitation gets documented in the rule's doc page.

## Adding a rule

1. Write it in `packages/lint/src/rules/`, built with `defineRule` from
   `src/project/rule.ts` so framework gating and the `note` setting come for
   free. Rules never detect the framework themselves.
2. Register it in `src/plugin.ts`, and in `recommended` only if it reports a
   genuine defect rather than a style preference.
3. Test it in `packages/lint/test/`, including a case under `undetectedTester()`
   proving it stays silent in a non-OpenTUI file.
4. Add a conformance case in **both** bindings — `packages/conformance/cases.tsx`
   for React and `packages/conformance-solid/conformance.test.tsx` for Solid —
   pairing the snippet with what OpenTUI really does with it. A rule with no
   conformance case is a claim nobody checked.
5. Write `docs/rules/<name>.md`, including a "what it does not report" section.

## React and Solid are equal targets

They are different programs. Solid's reconciler has no text-context check, no
ErrorBoundary, and its own error strings; its compound elements use underscores;
`on:mousedown` is real event syntax there and nowhere else. Anything a message
says about "what OpenTUI does" belongs in `src/catalog/runtime.ts`, keyed by
framework, and gets asserted against a real render of that binding. Never write
a runtime error string inline in a rule.

A message that quotes the wrong error is worse than a vague one: it sends the
reader searching the codebase for a string that is not there.

## Message style

The error is the product. An agent should be able to fix the code from the
message alone, without opening the OpenTUI docs. Each one says what breaks, why
the type checker was quiet, and what to write instead — in that order.
