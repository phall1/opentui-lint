/**
 * opentui-lint — an agent-first linter for OpenTUI terminal apps.
 *
 * Works as an ESLint 9 flat-config plugin and as an Oxlint JS plugin; both
 * consume the same rule objects.
 *
 *   import { plugin as opentui, recommended } from "opentui-lint"
 *
 *   export default [
 *     {
 *       files: ["**\/*.tsx"],
 *       plugins: { opentui },
 *       rules: recommended,
 *     },
 *   ]
 */

export { plugin, plugin as default, recommended, rules, strict } from "./plugin.js"
export type { RuleName } from "./plugin.js"
export type { OpenTuiSettings } from "./project/framework.js"
export { CATALOG_VERSION, NAMED_COLORS } from "./catalog/index.js"
export type { Framework } from "./catalog/index.js"
