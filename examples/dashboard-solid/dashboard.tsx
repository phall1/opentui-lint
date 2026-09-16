// The Solid version of the same dashboard, with the same web reflexes.
//
// Solid's failures are not React's: there is no ErrorBoundary, the reconciler
// has no text-context check, and the errors read
// `[Reconciler] Unknown component type: div` and
// `Orphan text error: "…" must have a <text> as a parent`.
// The linter quotes whichever one your file will actually hit.
import { For, createSignal } from "solid-js"

interface Service {
  id: string
  name: string
}

const card = { padding: 4, backgroundColor: "slate", borderRadius: 2 }

export function Dashboard(props: { services: Service[] }) {
  const [selected, setSelected] = createSignal("")

  return (
    <box flexDirection="column" gap={2}>
      <div>
        <b>Deploys</b>
      </div>

      <box style={card}>
        <p>All systems nominal</p>
      </box>

      <scrollbox flexGrow={1}>
        <For each={props.services}>
          {(service) => (
            <box
              className="row"
              onClick={() => setSelected(service.id)}
              backgroundColor={service.id === selected() ? "indigo" : "transparent"}
              padding={2}
            >
              <text>{service.name}</text>
            </box>
          )}
        </For>
      </scrollbox>

      <box borderColor="rgb(100, 116, 139)" border>
        <ascii-font text="q to quit" />
      </box>
    </box>
  )
}
