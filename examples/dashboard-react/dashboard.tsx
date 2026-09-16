// A deploy dashboard written the way a model reaches for web idioms.
//
// This file passes `tsc --noEmit` with `strict: true`. It also renders a red
// React stack trace instead of a dashboard. Run `bun run lint` to see why.
import { useKeyboard } from "@opentui/react"

interface Service {
  id: string
  name: string
}

const card = { padding: 4, backgroundColor: "slate", borderRadius: 2 }

export function Dashboard({ services, selected }: { services: Service[]; selected: string }) {
  useKeyboard((key) => {
    if (key.name === "q") process.exit(0)
  })

  return (
    <box flexDirection="column" gap={2}>
      <div>
        <b>Deploys</b>
      </div>

      <box style={card}>
        {services.length} services
        <p>All systems nominal</p>
      </box>

      <scrollbox flexGrow={1}>
        {services.map((service) => (
          <box
            key={service.id}
            className="row"
            onClick={() => console.log(service.id)}
            backgroundColor={service.id === selected ? "indigo" : "transparent"}
            padding={2}
          >
            <text>{service.name}</text>
          </box>
        ))}
      </scrollbox>

      <box borderColor="rgb(100, 116, 139)" border>
        <text>Press </text>
        <b>q</b>
        <text> to quit</text>
      </box>
    </box>
  )
}
