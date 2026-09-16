# Roadmap

## Shipped

The original roadmap was the design-system half plus four correctness rules.
All of it is in, so the list below is what it became rather than what was
planned — kept because the *reasons* are still the useful part.

| Planned | Shipped as |
| --- | --- |
| `no-restyle` | [`no-restyle`](rules/no-restyle.md), on a contract engine ported from `@shadcn/lint` |
| `use-theme-tokens` | [`use-theme-tokens`](rules/use-theme-tokens.md), in two tiers |
| `no-magic-density` | [`no-magic-density`](rules/no-magic-density.md) |
| `no-inert-values` | [`no-unsupported-values`](rules/no-unsupported-values.md), broader than planned |
| `require-registration` | [`require-registration`](rules/require-registration.md) |
| `no-raw-stdout` | [`no-raw-stdout`](rules/no-raw-stdout.md) |
| Oxlint JS plugin entry | `packages/oxlint-conformance` runs every rule under the real binary |
| Type-aware tier | `checkTypes: true` on `text-must-be-wrapped` |

Three things the plan got wrong, worth recording because the corrections cost
real work:

**The color half of `use-theme-tokens` is weaker than it looked.** The plan
said "resolve the hex to the nearest token so the message can name it". But
tuiparts' default theme is built from `RGBA.fromIndex(n)` and
`RGBA.defaultBackground()`, whose real values depend on the user's terminal
palette — so there is usually nothing to match a hex against, and nearest-color
matching against a terminal-resolved palette would produce confidently wrong
messages. It ships exact-match-only, in two tiers, with the weaker tier naming
the theme rather than a token.

**`no-restyle` is a policy, not a defect.** tuiparts *deliberately* lets a call
site override a recipe's themed defaults — its Badge README says so outright.
The rule cannot claim the code is broken, because it is not. What it claims
instead is provable: the recipe re-reads its colors through `theme.subscribe`,
and a literal pins that instance. That is why it is in `strict` and not
`recommended`.

**`no-inert-values` was too narrow a name.** The two documented type/runtime
gaps turned out to have company: `alignItems="space-between"` typechecks and
lays out identically to `"flex-end"`, and a negative dimension throws. All
confirmed by rendering them against a control tree.

## Open

### ~~`require-focus`~~ — rejected

Investigated and **not built**. The premise — an unfocused `<input>` is
unreachable — is false by default: `useMouse` and `autoFocus` both default to
`true`, and a plain mouse click walks up to the nearest focusable renderable
and focuses it. Verified by clicking one in a test renderer, not by reading
about it. Tab does nothing; there is no built-in focus traversal to fall back
on either.

The disqualifying part is not the false positive rate, it is *where the
deciding fact lives*: `useMouse` is a `createCliRenderer()` option, usually in
a different file from the JSX, so no file-local rule can know whether a given
input is reachable. The full findings and what would have to change upstream
are in [`rules/require-focus-rejected.md`](rules/require-focus-rejected.md).

### Measuring whether the messages actually help

`@shadcn/lint` backs its claims with ~150 agent task runs, counting violations
before and after lint feedback. That is the honest way to claim these messages
help an agent, and this package currently does not claim it.

The cheaper half of that is already more valuable and is being built first: a
**corpus check** that runs every rule over real, working, expert-written
OpenTUI code — OpenTUI's own `packages/examples`, and tuiparts' registry — and
fails when a rule starts flagging code that works. A linter's whole value rests
on not crying wolf, and a synthetic test cannot demonstrate that the way
thousands of lines of real source can.

The agent-eval half needs API budget and a task corpus, and is worth doing only
once the corpus check is clean.

## Not planned

**The Core imperative API.** Every rule here is JSX-only. OpenTUI's Core API
builds renderables with `new BoxRenderable(ctx, { … })` and restyles them with
plain assignment — `sidebar.backgroundColor = "#64748b"` — and the receiver's
type is unknowable without type information. A narrow, provable subset exists
(a `new XRenderable(…)` object-literal argument where `X` is imported from
`@opentui/core`) and may be worth it later. Assignment coverage should wait for
the type-aware tier to grow beyond text.

**Effect anywhere in the published package.** See `AGENTS.md`. The plugin has
zero runtime dependencies and keeps them; Effect is confined to the catalog
generator, where there is real IO, real concurrency, and a temp directory that
must survive a Ctrl-C.
