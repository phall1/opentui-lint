/**
 * A structural slice of the ESLint rule API.
 *
 * Both ESLint 9 and Oxlint's JS plugin API pass the same shapes, so the rules
 * are written against this instead of importing either linter. It also keeps
 * the published package free of a hard dependency on a linter we may not be
 * running under.
 */

export interface Node {
  type: string
  // Deliberately loose: rules read a handful of ESTree/TSESTree fields and
  // narrowing every node kind would be a second copy of the AST types.
  [key: string]: any
}

export interface Comment {
  type: string
  value: string
}

export interface SourceCode {
  getAllComments?(): Comment[]
  getText(node?: Node): string
  getScope?(node: Node): Scope
  ast: Node
}

export interface Scope {
  references: Array<{ identifier: Node; resolved: Variable | null }>
  through: unknown[]
  upper: Scope | null
}

export interface Variable {
  name: string
  defs: Array<{ type: string; node: Node }>
  references: unknown[]
}

export interface ReportDescriptor {
  node: Node
  message: string
  data?: Record<string, string>
  fix?: (fixer: Fixer) => unknown
  suggest?: Array<{ desc: string; fix: (fixer: Fixer) => unknown }>
}

export interface Fixer {
  replaceText(node: Node, text: string): unknown
  replaceTextRange(range: [number, number], text: string): unknown
  remove(node: Node): unknown
  insertTextBefore(node: Node, text: string): unknown
  insertTextAfter(node: Node, text: string): unknown
}

export interface RuleContext {
  filename: string
  sourceCode: SourceCode
  settings: Record<string, any>
  options: any[]
  report(descriptor: ReportDescriptor): void
}

export interface RuleModule {
  meta: {
    type: "problem" | "suggestion" | "layout"
    docs: { description: string; url?: string }
    schema: unknown[]
    fixable?: "code" | "whitespace"
    hasSuggestions?: boolean
    messages?: Record<string, string>
  }
  create(context: RuleContext): Record<string, (node: Node) => void>
}
