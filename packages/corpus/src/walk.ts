/** Recursively lists `.ts`/`.tsx` files under `root`, skipping the usual noise. */

import { readdir } from "node:fs/promises"
import { join } from "node:path"

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".turbo"])

export async function walkSourceFiles(root: string): Promise<string[]> {
  const out: string[] = []

  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await visit(join(dir, entry.name))
        continue
      }
      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        out.push(join(dir, entry.name))
      }
    }
  }

  await visit(root)
  return out.toSorted()
}
