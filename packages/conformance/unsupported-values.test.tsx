/** @jsxImportSource @opentui/react */

import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import type { ReactNode } from "react"

/**
 * The claims behind `no-unsupported-values` and `require-registration`.
 *
 * Every one of these is a value TypeScript accepts. The only way to know what
 * the runtime does with it is to render it and look at the computed geometry,
 * so that is what this file does — each case against a control tree that
 * differs in exactly one prop.
 */

interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

/** Renders a tree and reads back the computed box of `#probe`. */
async function geometryOf(node: ReactNode): Promise<Geometry> {
  const setup = await testRender(node, { width: 40, height: 10 })
  await setup.renderOnce()
  const probe = setup.renderer.root.findDescendantById("probe") as unknown as Geometry
  const geometry = { x: probe.x, y: probe.y, width: probe.width, height: probe.height }
  setup.renderer.destroy()
  return geometry
}

/** A parent with two siblings around the probe, so flow changes are visible. */
function tree(probeProps: Record<string, unknown>) {
  return (
    <box width={40} height={10} flexDirection="column">
      <box width={6} height={2}>
        <text>A</text>
      </box>
      <box id="probe" left={10} top={3} width={6} height={2} {...probeProps}>
        <text>C</text>
      </box>
    </box>
  )
}

describe("position=\"static\" is accepted by the types and ignored by the runtime", () => {
  test("it lays out exactly like relative, and unlike absolute", async () => {
    const omitted = await geometryOf(tree({}))
    const relative = await geometryOf(tree({ position: "relative" }))
    const absolute = await geometryOf(tree({ position: "absolute" }))
    const staticPos = await geometryOf(tree({ position: "static" as never }))

    expect(staticPos).toEqual(relative)
    expect(staticPos).toEqual(omitted)
    // The control: a value the runtime *does* honor moves the box.
    expect(absolute).not.toEqual(relative)
  })
})

/**
 * A row parent with flex-start alignment, so the probe is sized by its own
 * one-cell content rather than being stretched to the parent's width — which is
 * what makes a min/max constraint observable at all.
 */
function sized(props: Record<string, unknown>) {
  return (
    <box width={40} height={10} flexDirection="row" alignItems="flex-start">
      <box id="probe" {...props}>
        <text>x</text>
      </box>
    </box>
  )
}

describe('min/max dimensions ignore "auto"', () => {
  test("minWidth and maxWidth drop it entirely", async () => {
    const omitted = await geometryOf(sized({}))
    expect(await geometryOf(sized({ minWidth: "auto" as never }))).toEqual(omitted)
    expect(await geometryOf(sized({ maxWidth: "auto" as never }))).toEqual(omitted)
    // Controls: the values the runtime does honor.
    expect((await geometryOf(sized({ minWidth: 12 }))).width).toBe(12)
    expect((await geometryOf(sized({ maxWidth: 1 }))).width).toBe(1)
  })

  test("minHeight and maxHeight drop it entirely", async () => {
    const omitted = await geometryOf(sized({}))
    expect(await geometryOf(sized({ minHeight: "auto" as never }))).toEqual(omitted)
    expect(await geometryOf(sized({ maxHeight: "auto" as never }))).toEqual(omitted)
    expect((await geometryOf(sized({ minHeight: 5 }))).height).toBe(5)
  })
})

function row(align: string) {
  return (
    <box width={40} height={6} flexDirection="row" alignItems={align as never}>
      <box id="probe" width={6} height={2}>
        <text>C</text>
      </box>
    </box>
  )
}

describe('alignItems space-* behaves like flex-end, not like a distribution', () => {
  test("space-between lands where flex-end lands", async () => {
    const flexEnd = await geometryOf(row("flex-end"))
    expect(await geometryOf(row("space-between"))).toEqual(flexEnd)
    // The control: it is genuinely different from the stretch default.
    expect(await geometryOf(row("flex-start"))).not.toEqual(flexEnd)
  })
})

describe("a negative dimension throws rather than being ignored", () => {
  test("the throw reaches the ErrorBoundary, not the caller", async () => {
    // The throw happens inside the reconciler's commit, so `testRender` does
    // not reject — the binding's ErrorBoundary catches it and paints the error
    // where the app should be. That is what the diagnostic has to describe.
    const setup = await testRender(<box id="neg" width={-1} height={2} />, { width: 40, height: 6 })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    setup.renderer.destroy()

    expect(frame).toContain("TypeError")
  })

  test("the underlying validator names the prop and the value", async () => {
    // Asserted directly, because the frame is too narrow to show the whole
    // message and the exact text is what the diagnostic quotes.
    const { BoxRenderable } = await import("@opentui/core")
    const setup = await testRender(<box />, { width: 20, height: 4 })
    let thrown: string | undefined
    try {
      // eslint-disable-next-line no-new -- constructing it *is* the assertion
      const box = new BoxRenderable(setup.renderer, { id: "neg", width: -1 })
      void box
    } catch (error) {
      thrown = (error as Error).message
    }
    setup.renderer.destroy()

    expect(thrown).toBe("Invalid width for Renderable neg: -1")
  })
})

describe("an element that needs registration is not in the catalogue until you call it", () => {
  test("importing the package is not enough", async () => {
    const { getComponentCatalogue } = await import("@opentui/react")
    // Nothing in this suite calls registerQRCode(), which is the point.
    expect(Object.keys(getComponentCatalogue())).not.toContain("qr-code")
  })

  test("rendering it unregistered fails the whole tree", async () => {
    const setup = await testRender(
      <box>
        <text>BEFORE</text>
        {/* @ts-expect-error the element only exists after registerQRCode() */}
        <qr-code content="https://example.com" />
      </box>,
      { width: 60, height: 8 },
    )
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    setup.renderer.destroy()

    expect(frame).toContain("Unknown component type: qr-code")
    // The sibling that rendered fine is gone too — the ErrorBoundary replaces
    // the entire tree, which is why the diagnostic has to name the element.
    expect(frame).not.toContain("BEFORE")
  })
})
