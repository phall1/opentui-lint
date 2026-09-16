/** A recipe. It legitimately sets colors and padding — nothing here is a violation. */
import { useTheme } from "./use-theme"

export function Button({ label }: { label: string }) {
  const tokens = useTheme()
  return (
    <box backgroundColor={tokens.colors.primary} paddingX={tokens.density.paddingX}>
      <text content={label} fg={tokens.colors.foreground} />
    </box>
  )
}
