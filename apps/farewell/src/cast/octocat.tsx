import type { ReactNode } from "react"
import { type Place, placed } from "../paper"
import { font, ink } from "../theme"
import { type Curve, Tentacle } from "./parts"

const fur = "#24292f"
const face = "#f3c9b4"

// Four legs curling outward at the tips, and a fifth raised to carry things.
const legs: readonly (readonly Curve[])[] = [-1, 1].flatMap((side) => [
  [
    [
      { x: side * 30, y: -100 },
      { x: side * 36, y: -66 },
      { x: side * 62, y: -48 },
      { x: side * 66, y: -24 }
    ],
    [
      { x: side * 66, y: -24 },
      { x: side * 70, y: -4 },
      { x: side * 94, y: -2 },
      { x: side * 88, y: -18 }
    ]
  ],
  [
    [
      { x: side * 12, y: -100 },
      { x: side * 14, y: -64 },
      { x: side * 30, y: -40 },
      { x: side * 28, y: -20 }
    ],
    [
      { x: side * 28, y: -20 },
      { x: side * 26, y: -2 },
      { x: side * 46, y: 0 },
      { x: side * 44, y: -12 }
    ]
  ]
])

const arm: readonly Curve[] = [
  [
    { x: 40, y: -114 },
    { x: 78, y: -122 },
    { x: 96, y: -150 },
    { x: 92, y: -184 }
  ],
  [
    { x: 92, y: -184 },
    { x: 90, y: -198 },
    { x: 78, y: -202 },
    { x: 76, y: -192 }
  ]
]

// How far a scuttling foot swings, and how high it lifts, in the Octocat's own units.
const stride = 160
const lift = 26

// A leg partway through a scuttle `travel` along, `half` a cycle behind or ahead of the other pair: its foot planted while
// its pair holds the ground, then lifted and swung ahead; the leg bends to follow, the more the further down it is.
const scuttled = (curves: readonly Curve[], half: number, travel: number, scuttle: number): Curve[] => {
  const u = (((travel / stride + half) % 1) + 1) % 1
  const dx = (u < 0.5 ? stride * (0.25 - u) : stride * (u - 0.75)) * scuttle
  const dy = u < 0.5 ? 0 : -lift * Math.sin(Math.PI * (u - 0.5) * 2) * scuttle
  const moved = ({ x, y }: Curve[number]) => {
    const down = Math.min(1, Math.max(0, (y + 100) / 100))
    return { x: x + dx * down, y: y + dy * down }
  }
  return curves.map((curve): Curve => [moved(curve[0]), moved(curve[1]), moved(curve[2]), moved(curve[3])])
}

// The Octocat, half cat and half octopus, who delivers every pull request. While `scuttle` is up it walks, its feet
// keeping to the floor as it goes `travel` along in its own units.
export const Octocat = ({
  hold,
  look = { x: 0, y: 0 },
  travel = 0,
  scuttle = 0,
  ...place
}: Place & { hold?: ReactNode; look?: { x: number; y: number }; travel?: number; scuttle?: number }) => (
  <g transform={placed(place)}>
    {legs.map((curves, i) => (
      <Tentacle
        key={`${curves[0]?.[0].x}`}
        curves={scuttled(curves, [0, 0.5, 0.5, 0][i] ?? 0, travel, scuttle)}
        from={22}
        to={5}
        fill={fur}
      />
    ))}
    <Tentacle curves={arm} from={20} to={6} fill={fur} />
    <ellipse cx="0" cy="-106" rx="44" ry="24" fill={fur} stroke={ink} strokeWidth="3" />
    <path
      d="M-72,-158 Q-80,-206 -66,-236 L-50,-270 L-30,-232 Q0,-242 30,-232 L50,-270 L66,-236 Q80,-206 72,-158 Q62,-116 0,-110 Q-62,-116 -72,-158 Z"
      fill={fur}
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path
      d="M-56,-164 Q-58,-200 -30,-208 Q0,-214 30,-208 Q58,-200 56,-164 Q52,-130 0,-126 Q-52,-130 -56,-164 Z"
      fill={face}
      stroke={ink}
      strokeWidth="2.5"
    />
    {[-23, 23].map((x) => (
      <g key={x}>
        <ellipse cx={x} cy="-172" rx="10" ry="13" fill="#3b2420" />
        <circle cx={x + look.x * 3 - 3} cy={-176 + look.y * 3} r="3.5" fill="#fff" />
      </g>
    ))}
    <path d="M-5,-154 H5 L0,-148 Z" fill="#8a4a45" />
    <path d="M-8,-142 Q-4,-138 0,-142 Q4,-138 8,-142" stroke={ink} strokeWidth="2" fill="none" />
    <path
      d="M-30,-152 L-60,-156 M-30,-146 L-58,-142 M30,-152 L60,-156 M30,-146 L58,-142"
      stroke="#c99a86"
      strokeWidth="2"
    />
    {hold ? <g transform="translate(104 -214)">{hold}</g> : null}
  </g>
)

// A pull request, as a sealed envelope with its title across the front.
export const PullRequest = ({ label = "PR" }: { label?: string }) => (
  <g transform="rotate(-8)">
    <rect x="-75" y="-45" width="150" height="90" rx="5" fill="#fffaf0" stroke={ink} strokeWidth="3" />
    <path d="M-75,-45 L0,-2 L75,-45" stroke={ink} strokeWidth="3" fill="none" />
    <circle cx="0" cy="-2" r="13" fill="#2da44e" stroke={ink} strokeWidth="2" />
    <text
      x="0"
      y="34"
      textAnchor="middle"
      fontFamily={font.sans}
      fontWeight="700"
      fontSize="21"
      fill={ink}
      textLength={label.length > 10 ? 136 : undefined}
      lengthAdjust="spacingAndGlyphs"
    >
      {label}
    </text>
  </g>
)
