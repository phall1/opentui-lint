/**
 * The corpus: every directory of real OpenTUI/tuiparts source this package
 * lints, and why each one is in scope. Building this list is the one place
 * that decides what "the corpus" means — everything downstream (the test
 * suite, the report script) just walks this array.
 */

import { join } from "node:path";
import { ensureRepo } from "./cache.js";
import { materializeTuiparts } from "./materialize-tuiparts.js";
import { OPENTUI, TUIPARTS } from "./pins.js";
import type { LintTarget } from "./lint-target.js";
import { walkSourceFiles } from "./walk.js";

export interface BuiltTarget extends LintTarget {
  description: string;
}

export async function buildTargets(): Promise<BuiltTarget[]> {
  const opentuiRepo = await ensureRepo(OPENTUI);
  const tuipartsRepo = await ensureRepo(TUIPARTS);
  const materializedBase = join(
    process.env.CORPUS_CACHE_DIR ?? join(import.meta.dir, "..", ".cache"),
    `tuiparts-installed-${TUIPARTS.ref}`,
  );
  const materialized = await materializeTuiparts(tuipartsRepo, materializedBase);

  const targets: BuiltTarget[] = [];

  const addTarget = async (
    id: string,
    rootDir: string,
    description: string,
    filter?: (file: string) => boolean,
  ) => {
    const files = await walkSourceFiles(rootDir);
    targets.push({ id, rootDir, files: filter ? files.filter(filter) : files, description });
  };

  // --- OpenTUI's own examples ------------------------------------------------
  // Pure @opentui/core usage, imperative — no JSX at all, so no rule here can
  // fire (every rule visits JSX nodes). Included anyway: it is real,
  // expert-written OpenTUI code, and confirms the plugin stays silent on it
  // rather than assuming that from the absence of JSX.
  await addTarget(
    "opentui-core-examples",
    join(opentuiRepo, "packages", "examples", "src"),
    "@opentui/core examples workspace (packages/examples) — imperative, no JSX.",
  );

  await addTarget(
    "opentui-react-examples",
    join(opentuiRepo, "packages", "react", "examples"),
    "@opentui/react's own examples/ directory — framework detected via import/pragma/tsconfig, no override.",
  );

  await addTarget(
    "opentui-solid-examples",
    join(opentuiRepo, "packages", "solid", "examples"),
    "@opentui/solid's own examples/ directory — framework detected via import/pragma/tsconfig, no override.",
  );

  // --- tuiparts: what the CLI actually installs ------------------------------
  // Materialized from registry.json's own `target` paths (see
  // materialize-tuiparts.ts), so `components/ui/theme.ts` lands exactly where
  // a real consumer project would have it and opentui-lint's own
  // `CONVENTIONAL_UI_DIRS` discovery finds it unassisted — no
  // settings.opentui.theme override. Every file here is design-system source;
  // the design-system rules are expected to be silent throughout.
  await addTarget(
    "tuiparts-react-installed",
    materialized.roots.react,
    "tuiparts registry, React variant, installed into components/ui/ exactly as the CLI would.",
  );
  await addTarget(
    "tuiparts-solid-installed",
    materialized.roots.solid,
    "tuiparts registry, Solid variant, installed into components/ui/ exactly as the CLI would.",
  );
  await addTarget(
    "tuiparts-core-installed",
    materialized.roots.core,
    "tuiparts registry, Core variant, installed into components/ui/ — imperative, no JSX.",
  );

  // --- tuiparts: the registry's own smoke tests ------------------------------
  // Not an install target (registry.json ships no `target` for these), but
  // real working code exercising every recipe's real props — linted straight
  // from the checkout, in place, with no materialization.
  await addTarget(
    "tuiparts-react-smoke",
    join(tuipartsRepo, "registry"),
    "tuiparts's own React smoke tests under registry/*/smoke/react.test.tsx.",
    (f) => f.endsWith("/smoke/react.test.tsx"),
  );
  await addTarget(
    "tuiparts-solid-smoke",
    join(tuipartsRepo, "registry"),
    "tuiparts's own Solid smoke tests under registry/*/smoke/solid.test.tsx.",
    (f) => f.endsWith("/smoke/solid.test.tsx"),
  );

  return targets;
}

export { OPENTUI, TUIPARTS };
