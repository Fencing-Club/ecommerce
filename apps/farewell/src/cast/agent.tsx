import { type Place, placed } from "../paper"
import { font, gold, ink } from "../theme"
import { Limb } from "./coaches"
import { Sparkle } from "./copilot"

type AgentProps = Place & {
  // Asleep on the slab, or awake with its eyes lit.
  awake?: boolean
  armL?: number
  armR?: number
  tint?: string
  label?: string
}

// An agent: a little brass-riveted automaton with a screen for a face and a sparkle on its antenna.
export const Agent = ({
  awake = true,
  armL = 20,
  armR = 20,
  tint = "#c9d0dc",
  label = "Agent",
  ...place
}: AgentProps) => (
  <g transform={placed(place)}>
    <Limb x={-16} y={-52} swing={2} length={40} end="shoe" color="#6d7584" width={9} />
    <g transform="scale(-1 1)">
      <Limb x={-16} y={-52} swing={2} length={40} end="shoe" color="#6d7584" width={9} />
    </g>
    <Limb x={-34} y={-96} swing={armL} length={42} end="glove" color="#6d7584" width={8} />
    <g transform="scale(-1 1)">
      <Limb x={-34} y={-96} swing={armR} length={42} end="glove" color="#6d7584" width={8} />
    </g>
    <rect x="-34" y="-110" width="68" height="60" rx="12" fill={tint} stroke={ink} strokeWidth="3" />
    <rect x="-28" y="-100" width="56" height="26" rx="4" fill="#fffdf6" stroke={ink} strokeWidth="2" />
    <text x="0" y="-81.5" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="15" fill={ink}>
      {label.toUpperCase()}
    </text>
    {[-26, 26].map((x) => (
      <circle key={x} cx={x} cy="-58" r="3" fill={gold.base} stroke={ink} strokeWidth="1" />
    ))}
    <line x1="0" y1="-172" x2="0" y2="-196" stroke={ink} strokeWidth="3.5" />
    <Sparkle x={0} y={-204} size={10} fill={awake ? "#ffd75e" : "#a9a9a9"} />
    <circle cx="-44" cy="-140" r="7" fill={gold.base} stroke={ink} strokeWidth="2" />
    <circle cx="44" cy="-140" r="7" fill={gold.base} stroke={ink} strokeWidth="2" />
    <rect x="-42" y="-174" width="84" height="64" rx="16" fill={tint} stroke={ink} strokeWidth="3" />
    <rect x="-32" y="-164" width="64" height="42" rx="10" fill="#111723" stroke={ink} strokeWidth="2" />
    {awake ? (
      <g>
        <ellipse cx="-13" cy="-146" rx="7" ry="9" fill="#3fe0ee" />
        <ellipse cx="13" cy="-146" rx="7" ry="9" fill="#3fe0ee" />
        <ellipse cx="-13" cy="-146" rx="11" ry="13" fill="#3fe0ee" opacity="0.25" />
        <ellipse cx="13" cy="-146" rx="11" ry="13" fill="#3fe0ee" opacity="0.25" />
        <path d="M-8,-132 Q0,-127 8,-132" stroke="#3fe0ee" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
    ) : (
      <path d="M-20,-145 H-6 M6,-145 H20 M-6,-132 H6" stroke="#5f6b7d" strokeWidth="3" strokeLinecap="round" />
    )}
    <path
      d="M-36,-170 Q-20,-178 -6,-172"
      stroke="#fff"
      strokeWidth="3"
      opacity="0.5"
      fill="none"
      strokeLinecap="round"
    />
  </g>
)
