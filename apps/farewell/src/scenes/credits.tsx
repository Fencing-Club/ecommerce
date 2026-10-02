import type { ReactNode } from "react"
import { AbsoluteFill, useCurrentFrame } from "remotion"
import { ramp } from "../motion"
import { font } from "../theme"
import { creditHolds } from "../timeline"

const cream = "#f2eee2"

type Billing = readonly (readonly [string, string])[]

const players: Billing = [
  ["The Engineer", "leaving"],
  ["Copilot", "the Engineer, from Wednesday"],
  ["Clippy", "himself, at last"],
  ["The Lamp", "lighting"],
  ["The Pink Octopus", "the orchestra"],
  ["The Rubber Duck", "debugging"],
  ["Sad Lady", "every error"],
  ["The Octocat", "pull requests"],
  ["Windows Phone", "not dead yet"]
]

const more: Billing = [
  ["The Unicorn", "front half and back half"],
  ["The Coaches", "Reading, Math and Study Guide"],
  ["School Data Sync", "stage crew"],
  ["The Learning Activities", "by Loop"],
  ["The Colonel", "stopping things"],
  ["The Cardinals", "the Reorg"],
  ["The SFI Guard", "security"],
  ["The Agents", "everybody else"],
  ["The Cherubs", "the choir, one slightly bent"]
]

// A silent-film title card: white on black inside a scrolled double border.
const TitleCard = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 1920 1080" width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
    <rect width="1920" height="1080" fill="#0b0a09" />
    <rect x="120" y="70" width="1680" height="940" rx="28" fill="none" stroke={cream} strokeWidth="5" />
    <rect x="140" y="90" width="1640" height="900" rx="20" fill="none" stroke={cream} strokeWidth="2" />
    {[
      [140, 90],
      [1780, 90],
      [140, 990],
      [1780, 990]
    ].map(([x = 0, y = 0]) => (
      <g key={`${x}${y}`} transform={`translate(${x} ${y}) scale(${x > 960 ? -1 : 1} ${y > 540 ? -1 : 1})`}>
        <path
          d="M10,40 Q10,10 40,10 M24,64 Q24,24 64,24 Q44,44 64,64 Q44,64 44,44"
          stroke={cream}
          strokeWidth="3"
          fill="none"
        />
      </g>
    ))}
    {children}
  </svg>
)

const List = ({ heading, billing }: { heading: string; billing: Billing }) => (
  <TitleCard>
    <text x="960" y="200" textAnchor="middle" fontFamily={font.title} fontSize="58" fill={cream}>
      {heading}
    </text>
    {billing.map(([name, part], i) => (
      <g key={name}>
        <text x="930" y={300 + i * 70} textAnchor="end" fontFamily={font.caps} fontSize="38" fill={cream}>
          {name}
        </text>
        <text x="990" y={300 + i * 70} fontFamily={font.book} fontStyle="italic" fontSize="38" fill={cream}>
          {part}
        </text>
      </g>
    ))}
  </TitleCard>
)

// The cards in turn.
const cards: readonly (() => ReactNode)[] = [
  () => (
    <TitleCard>
      <text x="960" y="520" textAnchor="middle" fontFamily={font.title} fontSize="150" fill={cream}>
        THE END
      </text>
      <text x="960" y="640" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="44" fill={cream}>
        Tokens spent: more than the meter could count
      </text>
    </TitleCard>
  ),
  () => <List heading="The EDU Players were" billing={players} />,
  () => <List heading="Also appearing" billing={more} />,
  () => (
    <TitleCard>
      <text x="960" y="470" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="48" fill={cream}>
        Directed by
      </text>
      <text x="960" y="590" textAnchor="middle" fontFamily={font.title} fontSize="96" fill={cream}>
        Mr. Opus
      </text>
    </TitleCard>
  ),
  () => (
    <TitleCard>
      <text x="960" y="500" textAnchor="middle" fontFamily={font.title} fontSize="64" fill={cream}>
        No agents were harmed in the making of this farewell.
      </text>
      <text x="960" y="600" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="52" fill={cream}>
        Several were rebooted.
      </text>
    </TitleCard>
  )
]

const starts = creditHolds.map((_, i) => creditHolds.slice(0, i).reduce<number>((total, hold) => total + hold, 0))

// The credits after the music: title cards cut in and out with a flicker, the way the silents did.
export const Credits = ({ t }: { t: number }) => {
  const frame = useCurrentFrame()
  const index = Math.max(
    0,
    starts.findLastIndex((start) => t >= start)
  )
  const local = t - (starts[index] ?? 0)
  const hold = creditHolds[index] ?? 0
  const flicker = 0.92 + 0.08 * Math.sin(frame * 2.7) * Math.sin(frame * 1.3)
  const weave = { x: Math.sin(frame * 1.9) * 1.5, y: Math.cos(frame * 2.3) * 1.5 }
  return (
    <AbsoluteFill style={{ background: "#0b0a09" }}>
      <AbsoluteFill
        style={{
          opacity: flicker * ramp(local, 0, 0.25) * (1 - ramp(local, hold - 0.3, hold)),
          transform: `translate(${weave.x}px, ${weave.y}px)`
        }}
      >
        {cards[index]?.()}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
