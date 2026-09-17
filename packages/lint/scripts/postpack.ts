/** Removes the README copied in by `prepack.ts`; LICENSE is checked in. */
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
await rm(join(pkg, "README.md"), { force: true });
