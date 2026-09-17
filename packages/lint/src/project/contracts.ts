/**
 * The policy engine `no-restyle` runs on top of the project model in
 * `design-system.ts`. It answers one question — "is this prop category
 * allowed on this component here?" — from a list of `{ pattern, allow, deny }`
 * contracts a project opts into.
 *
 * The shape and the resolution order are ported from `@shadcn/lint`'s
 * `contracts.ts`, which already solved this well for Tailwind classes. Only
 * the vocabulary changes: instead of utility-class categories, the entries
 * here are the five OpenTUI prop categories `no-restyle` considers
 * design-system-owned. See `no-restyle.ts` for where each real prop lands.
 */

/**
 * The prop categories a design-system component is presumed to own.
 *
 * Deliberately not every prop OpenTUI has. Placement (`marginTop`, `width`,
 * `position`, …) and behaviour (`onPress`, `content`, `id`, …) are never
 * restyles — they never reach this engine at all — so they are not part of
 * this vocabulary and can never appear in a contract's `allow`/`deny`.
 */
export const RESTYLE_CATEGORIES = [
  "color",
  "border",
  "typography",
  "spacing",
  "internalLayout",
] as const;

export type RestyleCategory = (typeof RESTYLE_CATEGORIES)[number];

const CATEGORY_SET: ReadonlySet<string> = new Set(RESTYLE_CATEGORIES);

export interface ContractInput {
  /**
   * A regex tested against the *resolved* component name — `Dialog.Content`
   * flattens to `DialogContent` before matching, so `^DialogContent$` covers
   * both spellings with one entry. `Button` (no anchors) also matches
   * `IconButton`; `^Button$` matches only `Button`.
   */
  pattern: string;
  allow?: string[];
  deny?: string[];
  message?: string;
}

export interface Verdict {
  allowed: boolean;
  /** The matching contract's own message, when it set one. */
  message: string | undefined;
}

/**
 * Thrown while compiling `contracts` and caught by the rule, which reports it
 * once at line 1 and enforces nothing else for that file. A config mistake —
 * a bad regex, or an `allow`/`deny` entry naming no real category — must never
 * be silently downgraded to "enforce less than the author wrote"; that is a
 * worse failure than refusing to run at all.
 */
export class ContractConfigError extends Error {}

function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new ContractConfigError(
      `no-restyle: contract pattern "${pattern}" is not a valid regular expression.`,
    );
  }
}

/** An entry that matches no known category is exactly as useless as a typo'd class name. */
function checkEntries(
  entries: string[] | undefined,
  pattern: string,
  list: "allow" | "deny",
): void {
  for (const entry of entries ?? []) {
    if (CATEGORY_SET.has(entry)) continue;
    throw new ContractConfigError(
      `no-restyle: contract "${pattern}" names "${entry}" in ${list}, which is not a restyle category. ` +
        `Expected one of: ${RESTYLE_CATEGORIES.join(", ")}.`,
    );
  }
}

/**
 * The omitted-vs-empty table a single contract resolves to, on its own, with
 * no inheritance from any other contract: an explicit `allow` is
 * authoritative; a `deny` with no `allow` opens every other category
 * (deny-by-exception); neither present reports everything, which is the
 * rule's default posture — a design-system component owns its look until a
 * contract says otherwise.
 */
function allowSetOf(entry: { allow?: string[]; deny?: string[] }): ReadonlySet<string> | "*" {
  if (entry.allow !== undefined) return new Set(entry.allow);
  if (entry.deny !== undefined) return "*";
  return new Set();
}

interface CompiledContract {
  pattern: RegExp;
  allow: ReadonlySet<string> | "*";
  deny: ReadonlySet<string>;
  message: string | undefined;
}

/** What an unmatched component gets: nothing allowed, nothing explicitly denied, everything reported. */
const BASELINE: CompiledContract = {
  pattern: /(?:)/,
  allow: new Set(),
  deny: new Set(),
  message: undefined,
};

export interface ContractSet {
  decide(component: string, category: RestyleCategory): Verdict;
}

/**
 * Compiles `contracts` once per rule instance.
 *
 * Contracts are tried last-to-first and the first match wins outright —
 * nothing merges across two matching contracts, which is what keeps "the
 * most specific rule you wrote last" a predictable mental model instead of an
 * accumulation of every partial match. Deny beats allow within whichever
 * single contract wins.
 */
export function compileContracts(inputs: ContractInput[] | undefined): ContractSet {
  const compiled: CompiledContract[] = (inputs ?? []).map((input) => {
    checkEntries(input.allow, input.pattern, "allow");
    checkEntries(input.deny, input.pattern, "deny");
    return {
      pattern: compilePattern(input.pattern),
      allow: allowSetOf(input),
      deny: new Set(input.deny ?? []),
      message: input.message,
    };
  });

  function policyFor(component: string): CompiledContract {
    for (let i = compiled.length - 1; i >= 0; i--) {
      if (compiled[i]!.pattern.test(component)) return compiled[i]!;
    }
    return BASELINE;
  }

  return {
    decide(component, category) {
      const policy = policyFor(component);
      if (policy.deny.has(category)) return { allowed: false, message: policy.message };
      if (policy.allow === "*" || policy.allow.has(category))
        return { allowed: true, message: undefined };
      return { allowed: false, message: policy.message };
    },
  };
}
