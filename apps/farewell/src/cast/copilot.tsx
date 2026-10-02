import type { ReactNode } from "react"
import { type Place, placed } from "../paper"
import { copilot, gold, ink } from "../theme"
import { Eyes, type Mouth, MouthShape } from "./parts"

// A four-pointed sparkle, the mark of anything with AI in it.
export const Sparkle = ({ x, y, size, fill = "#ffd75e" }: { x: number; y: number; size: number; fill?: string }) => (
  <path
    d={`M${x},${y - size} Q${x + size * 0.18},${y - size * 0.18} ${x + size},${y} Q${x + size * 0.18},${y + size * 0.18} ${x},${y + size} Q${x - size * 0.18},${y + size * 0.18} ${x - size},${y} Q${x - size * 0.18},${y - size * 0.18} ${x},${y - size} Z`}
    fill={fill}
    stroke={ink}
    strokeWidth="2"
    strokeLinejoin="round"
  />
)

const Deerstalker = () => (
  <g stroke={ink} strokeWidth="2.5" strokeLinejoin="round">
    <path d="M-36,-232 Q-26,-238 -12,-232 Q-52,-226 -98,-222 Q-84,-238 -36,-232 Z" fill="#a8824e" />
    <path d="M36,-232 Q26,-238 12,-232 Q52,-226 98,-222 Q84,-238 36,-232 Z" fill="#a8824e" />
    <path d="M-74,-226 Q-66,-284 0,-288 Q66,-284 74,-226 Q0,-240 -74,-226 Z" fill="#c9a46b" />
    <path
      d="M-50,-276 L-40,-232 M-20,-286 L-14,-236 M14,-286 L12,-236 M44,-278 L40,-232 M-70,-250 Q0,-262 70,-250"
      stroke="#7a5a2c"
      strokeWidth="2"
      fill="none"
    />
    <path d="M-8,-290 Q-24,-302 -26,-290 Q-20,-284 -8,-290 Q4,-302 14,-292 Q6,-284 -8,-290 Z" fill="#a8824e" />
  </g>
)

const Goggles = () => (
  <g stroke={ink} strokeWidth="2.5">
    <path d="M-88,-212 Q0,-236 88,-212 L86,-198 Q0,-222 -86,-198 Z" fill="#5a3a1c" />
    {[-30, 30].map((x) => (
      <g key={x}>
        <circle cx={x} cy="-216" r="21" fill={gold.base} />
        <circle cx={x} cy="-216" r="14" fill="#a9dcef" />
        <path
          d={`M${x - 8},${-222} Q${x - 2},${-228} ${x + 4},${-224}`}
          stroke="#fff"
          strokeWidth="2.5"
          fill="none"
          opacity="0.8"
        />
      </g>
    ))}
  </g>
)

type CopilotProps = Place & {
  armL?: number
  armR?: number
  mouth?: Mouth
  look?: { x: number; y: number }
  hat?: "deerstalker"
  goggles?: boolean
  holdL?: ReactNode
  holdR?: ReactNode
  sparkle?: boolean
}

// Copilot, the understudy: a hovering ribbon of colour, eager to help with absolutely everything.
export const Copilot = ({
  armL = 30,
  armR = 30,
  mouth = "smile",
  look = { x: 0.1, y: 0.1 },
  hat,
  goggles,
  holdL,
  holdR,
  sparkle = true,
  ...place
}: CopilotProps) => (
  <g transform={placed(place)}>
    <ellipse cx="0" cy="0" rx="66" ry="10" fill="#000" opacity="0.22" />
    {[
      { side: -1, swing: armL, color: copilot[1], hold: holdL },
      { side: 1, swing: armR, color: copilot[5], hold: holdR }
    ].map(({ side, swing, color, hold }) => (
      <g key={side} transform={`translate(${side * 80} -132) rotate(${-side * swing})`}>
        <ellipse cx="0" cy="28" rx="14" ry="30" fill={color} stroke={ink} strokeWidth="3" />
        <g transform="translate(0 58)">
          {hold ? <g transform={`rotate(${side * swing})`}>{hold}</g> : null}
          <circle r="13" fill={color} stroke={ink} strokeWidth="3" />
        </g>
      </g>
    ))}
    <path
      d="M0,-252 C74,-252 94,-198 94,-140 C94,-78 52,-40 0,-40 C-52,-40 -94,-78 -94,-140 C-94,-198 -74,-252 0,-252 Z"
      fill="url(#copilotBody)"
      stroke={ink}
      strokeWidth="3"
    />
    <path d="M-86,-178 C-30,-218 30,-118 90,-150 L92,-124 C30,-92 -32,-190 -90,-152 Z" fill="#fff" opacity="0.22" />
    <ellipse cx="-44" cy="-210" rx="24" ry="11" transform="rotate(-32 -44 -210)" fill="#fff" opacity="0.55" />
    <Eyes x={0} y={-150} gap={58} r={21} look={look} />
    <MouthShape x={0} y={-100} mouth={mouth} size={1.1} />
    {hat === "deerstalker" ? <Deerstalker /> : null}
    {goggles ? <Goggles /> : null}
    {sparkle ? <Sparkle x={80} y={-268} size={17} /> : null}
  </g>
)
