import type { Framework } from "./index.js";

/**
 * How each binding actually fails.
 *
 * The two reconcilers are not the same program and they do not fail the same
 * way. React's host config throws `Text must be created inside of a text node`
 * from `createTextInstance` and the binding's ErrorBoundary catches it, so the
 * app is replaced by a red stack trace. Solid has no text-context check at all
 * in `createTextNode` — the failure surfaces later from `insertNode` as
 * `Orphan text error: "…" must have a <text> as a parent` — and there is no
 * error boundary, so the process takes the throw.
 *
 * A message that quotes the wrong error is worse than a vague one: it sends
 * the reader searching a codebase for a string that is not there. Every value
 * below is asserted against a real render of both bindings in
 * `packages/conformance`.
 */
export interface RuntimeFailure {
  /** The exact error text, with `{name}` standing in for the element name. */
  message: string;
  /** What the developer sees when it happens. */
  visible: string;
}

export interface FrameworkRuntime {
  unknownElement: RuntimeFailure;
  textOutsideText: RuntimeFailure;
  textNodeOutsideText: RuntimeFailure;
}

const REACT_BOUNDARY =
  "the binding's ErrorBoundary catches it and replaces your app with a red stack trace";
const SOLID_THROW = "there is no error boundary, so the render throws";

export const RUNTIME: Readonly<Record<Framework, FrameworkRuntime>> = {
  react: {
    unknownElement: {
      message: "Unknown component type: {name}",
      visible: REACT_BOUNDARY,
    },
    textOutsideText: {
      message: "Text must be created inside of a text node",
      visible: REACT_BOUNDARY,
    },
    textNodeOutsideText: {
      message: 'Component of type "{name}" must be created inside of a text node',
      visible: REACT_BOUNDARY,
    },
  },
  solid: {
    unknownElement: {
      message: "[Reconciler] Unknown component type: {name}",
      visible: SOLID_THROW,
    },
    textOutsideText: {
      message: 'Orphan text error: "…" must have a <text> as a parent',
      visible: SOLID_THROW,
    },
    textNodeOutsideText: {
      message: 'Orphan text error: "…" must have a <text> as a parent',
      visible: SOLID_THROW,
    },
  },
};

export function failureText(
  framework: Framework,
  kind: keyof FrameworkRuntime,
  name?: string,
): string {
  const failure = RUNTIME[framework][kind];
  return name ? failure.message.replace("{name}", name) : failure.message;
}

export function failureVisible(framework: Framework, kind: keyof FrameworkRuntime): string {
  return RUNTIME[framework][kind].visible;
}

/**
 * The binding package a framework's JSX comes from, for message wording.
 */
export function packageName(framework: Framework): string {
  return `@opentui/${framework}`;
}
