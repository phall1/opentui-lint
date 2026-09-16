/**
 * Copies the repo README into the package so npm has something to render.
 *
 * The README lives at the repo root because that is what GitHub shows, and
 * keeping one copy means the two can never disagree. `postpack.ts` removes the
 * copy again so it never shows up as a stray file in the working tree.
 */
import { copyFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pkg = dirname(dirname(fileURLToPath(import.meta.url)))
const root = dirname(dirname(pkg))

await copyFile(join(root, "README.md"), join(pkg, "README.md"))
await copyFile(join(root, "LICENSE"), join(pkg, "LICENSE"))
