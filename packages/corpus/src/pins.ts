/**
 * Pinned corpus sources.
 *
 * Every fact this package reports is read out of real, working, expert-written
 * OpenTUI source at these exact revisions — never vendored, never hand-edited.
 * Bump a pin deliberately, in its own commit, and re-run `bun run fetch` +
 * `bun test` so the baseline is re-triaged against the new code rather than
 * silently carried forward.
 *
 * `OPENTUI.ref` is pinned to the same version the catalog was generated from
 * (`opentui-lint`'s `CATALOG_VERSION`, see `packages/lint/src/catalog/generated.ts`).
 * A mismatch there would mean the rules know facts about a different OpenTUI
 * than the one the corpus is written against, which is exactly the kind of
 * silent drift the first test in `test/corpus.test.ts` exists to catch.
 */

export interface CorpusSource {
  /** Human name used in report output. */
  name: string
  /** Clone URL. */
  repo: string
  /**
   * A ref `git clone --branch` accepts (tag or branch), or a full commit SHA.
   * Tags are used where the upstream project cuts them; tuiparts does not tag
   * the whole monorepo (only individual `@tuiparts/*` package releases), so it
   * is pinned to a specific commit on `main` instead — see the comment there.
   */
  ref: string
  /** True when `ref` is a commit SHA rather than a tag/branch git can shallow-fetch by name. */
  isCommit: boolean
}

export const OPENTUI: CorpusSource = {
  name: "opentui",
  repo: "https://github.com/anomalyco/opentui",
  // Matches CATALOG_VERSION exactly — see the file doc comment above.
  ref: "v0.5.11",
  isCommit: false,
}

export const TUIPARTS: CorpusSource = {
  name: "tuiparts",
  repo: "https://github.com/tuiparts/tuiparts",
  // tuiparts has no umbrella release tag for the registry as a whole — its
  // tags are per-package (`@tuiparts/react@0.0.6`, and so on), and none of
  // them identify a single consistent snapshot of `registry/` across Core,
  // React and Solid at once. Pinned instead to a commit on `main`, recorded
  // here rather than resolved at fetch time so every run of this package
  // reads the exact same bytes. Picked 2026-09-16, the day this package was
  // built, as the first pin — bump it deliberately, the same as OPENTUI_REF.
  ref: "73b3622d4b989e4e4102f3ae85b364bdda7f76e2",
  isCommit: true,
}
