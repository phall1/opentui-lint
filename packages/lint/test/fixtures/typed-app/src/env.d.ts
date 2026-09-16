// Structural stand-ins, not the real bindings.
//
// This fixture exists to exercise `project/type-info.ts`'s type-classification
// predicate against realistic *shapes* — a React-style children union that
// includes an element type, a Solid-style `Accessor<T>` read as a call — without
// making the published plugin (or its test suite) depend on `@opentui/react` /
// `@opentui/solid` / `react` / `solid-js`. The predicate only ever looks at
// `type.flags`, so a hand-written union with the same shape as `ReactNode`
// exercises it identically to the real thing.
// These have to live inside `declare global` itself, not merely in a module
// that augments it: a plain top-level `type`/`interface` in a module with an
// `export` is module-scoped, invisible from the `.tsx` snippets under test.
// (Caught by a first draft where the "not reported" cases passed for the
// wrong reason — the unresolved name fell back to `any`, which also is not
// reported, masking a real bug in the test fixture rather than proving the
// predicate.)
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [name: string]: any
    }
    interface Element {}
  }

  interface ElementLike {
    $$typeof: symbol
  }

  /** Shaped like React's `ReactNode`: the element member is what must stay unreported. */
  type ReactNodeLike = ElementLike | string | number | Iterable<ReactNodeLike> | boolean | null | undefined

  /** Shaped like Solid's `Accessor<T>` — a signal read by calling it, not by its own (function) type. */
  type Accessor<T> = () => T
}

export {}
