/**
 * Reproduces what the tuiparts CLI actually writes into a consumer project,
 * from the registry's own manifest — rather than guessing a plausible layout.
 *
 * `registry.json` (a shadcn-compatible registry manifest) is the ground truth:
 * every item names the source file under `registry/` and the `target` path
 * the CLI copies it to, always rooted at `components/ui/` (recipes, the theme
 * store, the `useTheme` hook) or `themes/` (optional presets). Copying files
 * to those exact target paths, for each of the three frameworks tuiparts
 * ships, is what makes `components/ui/theme.ts` land where
 * `opentui-lint`'s own `CONVENTIONAL_UI_DIRS` discovery in
 * `packages/lint/src/project/design-system.ts` expects it — no
 * `settings.opentui.theme` override needed, because a real install would not
 * have one either. That is also exactly the scenario the design-system rules
 * (`no-restyle`, `use-theme-tokens`, `no-magic-density`) exist to leave alone:
 * every file under a discovered `components/ui/` is `isDesignSystemSource`,
 * and a rule firing there is a bug in the rule, not in tuiparts.
 *
 * "neutral" items (the theme presets under `theme/themes/`) are not
 * framework-specific in the manifest, so they are installed into all three
 * consumer roots — a preset is equally valid source under any binding.
 */

import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export type TuipartsFramework = "core" | "react" | "solid"
const FRAMEWORKS: TuipartsFramework[] = ["core", "react", "solid"]

interface RegistryFile {
  path: string
  target: string
}

interface RegistryItem {
  name: string
  files: RegistryFile[]
  meta: { framework: TuipartsFramework | "neutral" }
}

interface RegistryManifest {
  items: RegistryItem[]
}

/** One materialized consumer root per framework, plus how many files landed in each. */
export interface MaterializedTuiparts {
  roots: Record<TuipartsFramework, string>
  fileCounts: Record<TuipartsFramework, number>
}

async function installInto(root: string, tuipartsRepo: string, file: RegistryFile): Promise<void> {
  const destination = join(root, file.target)
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(join(tuipartsRepo, file.path), destination)
}

/**
 * Materializes the registry into `<materializedBase>/{core,react,solid}/`,
 * skipping the work if it already ran for this exact `materializedBase`
 * (callers key that path by the pinned ref, same convention as `ensureRepo`).
 */
export async function materializeTuiparts(
  tuipartsRepo: string,
  materializedBase: string,
): Promise<MaterializedTuiparts> {
  const roots = Object.fromEntries(FRAMEWORKS.map((fw) => [fw, join(materializedBase, fw)])) as Record<
    TuipartsFramework,
    string
  >
  const fileCounts: Record<TuipartsFramework, number> = { core: 0, react: 0, solid: 0 }

  const marker = join(materializedBase, ".corpus-materialized")
  if (existsSync(marker)) {
    const manifest = JSON.parse(
      await readFile(join(tuipartsRepo, "registry.json"), "utf8"),
    ) as RegistryManifest
    for (const item of manifest.items) {
      const targets: TuipartsFramework[] = item.meta.framework === "neutral" ? FRAMEWORKS : [item.meta.framework]
      for (const fw of targets) fileCounts[fw] += item.files.length
    }
    return { roots, fileCounts }
  }

  const manifest = JSON.parse(await readFile(join(tuipartsRepo, "registry.json"), "utf8")) as RegistryManifest

  for (const item of manifest.items) {
    const targets: TuipartsFramework[] = item.meta.framework === "neutral" ? FRAMEWORKS : [item.meta.framework]
    for (const fw of targets) {
      for (const file of item.files) {
        await installInto(roots[fw], tuipartsRepo, file)
        fileCounts[fw] += 1
      }
    }
  }

  await Bun.write(marker, `${new Date().toISOString()}\n`)
  return { roots, fileCounts }
}
