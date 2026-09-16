// The same dashboard after the linter. Every change here was named by an error
// message; none of it required opening the OpenTUI docs.
import { useKeyboard } from "@opentui/react"

interface Service {
  id: string
  name: string
}

// A terminal panel earns its separation from a border, not from empty cells.
const card = { padding: 1, backgroundColor: "#1e293b", borderStyle: "rounded" } as const

export function Dashboard({ services, selected }: { services: Service[]; selected: string }) {
  useKeyboard((key) => {
    if (key.name === "q") process.exit(0)
  })

  return (
    <box flexDirection="column">
      <box>
        <text>
          <b>Deploys</b>
        </text>
      </box>

      <box style={card} border>
        <text>{services.length} services</text>
        <text>All systems nominal</text>
      </box>

      <scrollbox flexGrow={1}>
        {services.map((service) => (
          <box
            key={service.id}
            onMouseDown={() => console.log(service.id)}
            backgroundColor={service.id === selected ? "#4338ca" : "transparent"}
          >
            <text>{service.name}</text>
          </box>
        ))}
      </scrollbox>

      <box borderColor="#64748b" border>
        <text>
          Press <b>q</b> to quit
        </text>
      </box>
    </box>
  )
}
