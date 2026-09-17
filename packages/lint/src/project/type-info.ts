import type { Node, RuleContext } from "./types.js";

/**
 * The slice of `@typescript-eslint/parser`'s `ParserServices` this module
 * actually reads.
 *
 * Not imported from `@typescript-eslint/utils`, for the same reason `types.ts`
 * does not import ESLint's own types: the published plugin has zero runtime
 * dependencies (see AGENTS.md), and this shape — `program`,
 * `esTreeNodeToTSNodeMap`, and a checker with `getTypeAtLocation` /
 * `typeToString` — has been stable since typescript-eslint's early versions,
 * well before the newer `services.getTypeAtLocation(estreeNode)` convenience
 * wrapper existed. Structural typing here means any parser that produces this
 * shape works, not just one pinned version of one package.
 */
interface TSTypeCheckerLike {
  getTypeAtLocation(node: unknown): TSTypeLike;
  typeToString(type: TSTypeLike): string;
}

interface TSProgramLike {
  getTypeChecker(): TSTypeCheckerLike;
}

interface TSTypeLike {
  flags: number;
  types?: TSTypeLike[];
}

interface ParserServicesLike {
  program: TSProgramLike | null | undefined;
  esTreeNodeToTSNodeMap?: { get(node: Node): unknown };
}

/**
 * ESLint 9 hangs `parserServices` off `sourceCode`; older flat-config and
 * legacy setups hang it directly off `context`. Checking both costs nothing
 * and keeps this working across the range of ESLint versions the structural
 * `RuleContext` in `types.ts` is meant to cover.
 */
function parserServicesOf(context: RuleContext): ParserServicesLike | undefined {
  const sourceCode = context.sourceCode as unknown as { parserServices?: ParserServicesLike };
  const legacy = context as unknown as { parserServices?: ParserServicesLike };
  return sourceCode?.parserServices ?? legacy?.parserServices;
}

/**
 * TypeScript's own `ts.TypeFlags` bit values, from the compiler's public API
 * (`src/compiler/types.ts`). Hardcoded rather than imported from the
 * `typescript` package, which would turn a devDependency into a runtime one
 * for the published plugin — the one hard rule in AGENTS.md's dependency
 * boundary. Safe to hardcode: TypeScript is additive-only here, an existing
 * flag never moves to a different bit, only new flags claim previously-unused
 * bits. Verified against the installed `typescript@5.9.3` (`ts.TypeFlags.String
 * === 4`, `ts.TypeFlags.Union === 1048576`, etc. — printed and checked by hand)
 * before writing this, per the repo rule against asserting unverified facts.
 */
const TS_TYPE_FLAGS = {
  String: 1 << 2, // 4
  Number: 1 << 3, // 8
  StringLiteral: 1 << 7, // 128
  NumberLiteral: 1 << 8, // 256
  Undefined: 1 << 15, // 32768
  Null: 1 << 16, // 65536
  Union: 1 << 20, // 1048576
  TemplateLiteral: 1 << 27, // 134217728
} as const;

const TEXT_FLAGS =
  TS_TYPE_FLAGS.String |
  TS_TYPE_FLAGS.Number |
  TS_TYPE_FLAGS.StringLiteral |
  TS_TYPE_FLAGS.NumberLiteral |
  TS_TYPE_FLAGS.TemplateLiteral;

/** `undefined`/`null` render as nothing, never as a text node — a union member the crash can skip over. */
const SAFE_NULLISH_FLAGS = TS_TYPE_FLAGS.Undefined | TS_TYPE_FLAGS.Null;

/**
 * True when every branch of `type` that can render at all renders as text,
 * and at least one branch does.
 *
 * This is the whole correctness story. `ReactNode` is a union that includes
 * an element type (plus booleans, which TypeScript itself represents as the
 * union `true | false`); the first member that is neither text nor nullish
 * aborts the whole check, so `ReactNode`-typed values are never reported. A
 * branded `string & Brand`, a constrained generic (`T extends string`), or an
 * `any`/`unknown` value is deliberately left unclassified — `Intersection`,
 * `TypeParameter`, `Any` and `Unknown` are not in `TEXT_FLAGS` — because
 * guessing there is exactly the mistake this whole rule exists to avoid.
 * `boolean | null | undefined` alone (no text branch at all) also returns
 * false: nothing left to render is text.
 */
function isTextType(type: TSTypeLike, seen: Set<TSTypeLike> = new Set()): boolean {
  // Guards against a pathological recursive alias walking forever; real
  // unions never revisit a member, so this never fires in practice.
  if (seen.has(type)) return false;

  if ((type.flags & TS_TYPE_FLAGS.Union) !== 0 && Array.isArray(type.types)) {
    seen.add(type);
    let sawText = false;
    for (const member of type.types) {
      if ((member.flags & SAFE_NULLISH_FLAGS) !== 0) continue;
      if (!isTextType(member, seen)) return false;
      sawText = true;
    }
    return sawText;
  }

  return (type.flags & TEXT_FLAGS) !== 0;
}

export interface TypeAwareProof {
  /** The resolved type, quoted in the diagnostic only — never used to decide. */
  typeText: string;
}

export interface TypeChecking {
  /** `undefined` when the expression's type cannot be proven to be text. */
  definitelyText(node: Node): TypeAwareProof | undefined;
}

/**
 * Builds the type-aware half of `text-must-be-wrapped`, or returns
 * `undefined` when there is nothing to build it from.
 *
 * `checkTypes: true` with no `parserOptions.project` / `projectService` wired
 * up is a real, expected configuration — trying the option before wiring a
 * tsconfig is the obvious first move — so this degrades to "no type checker"
 * rather than throwing. `services.program` is `null` in exactly that case:
 * confirmed by running `@typescript-eslint/parser` both with and without
 * `project` set and inspecting what it hands back before writing this check.
 */
export function typeChecking(context: RuleContext): TypeChecking | undefined {
  const services = parserServicesOf(context);
  const program = services?.program;
  const nodeMap = services?.esTreeNodeToTSNodeMap;
  if (!program || !nodeMap) return undefined;
  const checker = program.getTypeChecker();

  return {
    definitelyText(node) {
      const tsNode = nodeMap.get(node);
      // No mapping for this node is its own kind of "cannot prove it" — stay
      // quiet rather than risk querying the wrong node.
      if (tsNode === undefined) return undefined;
      const type = checker.getTypeAtLocation(tsNode);
      if (!isTextType(type)) return undefined;
      return { typeText: checker.typeToString(type) };
    },
  };
}
