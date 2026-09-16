# Corpus: opentui-lint against real OpenTUI code

`packages/corpus` (`opentui-lint-corpus`) runs every rule, under both
`recommended` and `strict`, over real, working, expert-written OpenTUI
source: OpenTUI's own `packages/examples`/`packages/react/examples`/
`packages/solid/examples`, and the entire [tuiparts](https://github.com/tuiparts/tuiparts)
component registry installed exactly the way tuiparts' own CLI would install
it. Both are pinned to an exact revision (`packages/corpus/src/pins.ts`),
cached locally, and re-fetched only when a pin changes.

[`packages/corpus/README.md`](../packages/corpus/README.md) has the full
detail: the triage methodology, every classification, and the two real
`packages/lint` bugs this found. The short version:

- **235 real files, 85 findings, checked into `packages/corpus/baseline.json`
  with a classification and a reason for every one.**
- **Zero true positives.** Nothing in the corpus is actually broken.
- **64 false positives**, both `packages/lint` bugs, not corpus bugs:
  `no-web-props` flags `title` on `<box>` even though the generated catalog
  says it is a real, typed prop that sets the border title; and
  `text-must-be-wrapped`/`no-orphan-text-nodes` stop at the first enclosing
  custom component (`<KeyLabel>`, Solid's `<Show>`) instead of recognizing it
  as the unknowable component boundary both rules already know to stay quiet
  about.
- **21 `acceptable`** — all `no-website-spacing` (`strict-only`), a real,
  intentional style choice in OpenTUI's own demos, not a rule bug.
- **The entire tuiparts corpus is clean**, every installed recipe across
  Core, React and Solid, plus its own smoke tests. The design-system rules
  (`no-restyle`, `use-theme-tokens`, `no-magic-density`) are silent
  throughout, which is the expected result: every installed file is
  `isDesignSystemSource`.

Run it:

```bash
bun run --filter opentui-lint-corpus report   # every finding + classification
bun run --filter opentui-lint-corpus test     # fails if live findings and baseline.json disagree
```
