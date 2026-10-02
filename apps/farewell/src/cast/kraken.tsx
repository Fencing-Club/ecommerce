import { type Place, placed } from "../paper"
import { font, ink, paper } from "../theme"
import { type Curve, Tentacle } from "./parts"

const hide = "#4f7a5a"
const belly = "#8fb38f"

// One of the Kraken's arms, rising from its root and curling, `reach` out toward (tx, ty) and waving with `t`.
const Arm = ({
  t,
  i,
  root,
  reach,
  target
}: {
  t: number
  i: number
  root: { x: number; y: number }
  reach: number
  target: { x: number; y: number }
}) => {
  const wave = Math.sin(t * 3 + i * 1.3) * 40
  const tip = {
    x: root.x + (target.x - root.x) * reach + wave * (1 - reach),
    y: root.y - 260 * (1 - reach) + (target.y - root.y) * reach
  }
  const curve: Curve = [
    root,
    { x: root.x + (i % 2 === 0 ? -80 : 80), y: root.y - 140 },
    { x: tip.x + wave, y: tip.y + 90 },
    tip
  ]
  return <Tentacle curves={[curve]} from={46} to={8} fill={hide} suckers={belly} />
}

// The Kraken of IcM, rising out of the sea: a great head with a grudge and arms tagged with the incident's severity.
// `rise` lifts it from below its waterline at (x, y); `grab` closes its arms on `prey`.
export const Kraken = ({
  t,
  rise,
  grab,
  prey,
  ...place
}: Place & { t: number; rise: number; grab: number; prey: { x: number; y: number } }) => {
  const lift = (1 - rise) * 520
  return (
    <g transform={placed(place)}>
      <g transform={`translate(0 ${lift})`}>
        {[-260, -150, 150, 260].map((x, i) => (
          <g key={x}>
            <Arm t={t} i={i} root={{ x, y: 40 }} reach={grab} target={{ x: prey.x - x * 0.2, y: prey.y }} />
            <g
              transform={`translate(${x + (prey.x - x) * grab * 0.9} ${-190 * (1 - grab) + prey.y * grab}) rotate(${-12 + i * 8})`}
            >
              <rect x="-40" y="-16" width="80" height="32" rx="4" fill={paper.light} stroke={ink} strokeWidth="2" />
              <text y="7" textAnchor="middle" fontFamily={font.typewriter} fontSize="20" fill="#b3191f">
                Sev 2
              </text>
            </g>
          </g>
        ))}
        <path
          d="M-170,60 Q-200,-200 0,-260 Q200,-200 170,60 Z"
          fill={hide}
          stroke={ink}
          strokeWidth="4"
          filter="url(#cut)"
        />
        <path d="M-120,-150 Q0,-200 120,-150" fill="none" stroke={belly} strokeWidth="6" opacity="0.6" />
        <g transform="translate(0 -180)">
          <rect x="-64" y="-24" width="128" height="40" rx="6" fill={paper.light} stroke={ink} strokeWidth="2.5" />
          <text y="8" textAnchor="middle" fontFamily={font.poster} fontSize="26" fill="#b3191f">
            IcM
          </text>
        </g>
        {[-1, 1].map((side) => (
          <g key={side} transform={`translate(${side * 62} -86)`}>
            <ellipse rx="38" ry="30" fill="#f6efc7" stroke={ink} strokeWidth="3" />
            <circle cx={side * -6} cy="4" r="15" fill={ink} />
            <circle cx={side * -10} cy="-1" r="4" fill="#fff" />
            <path d={`M${side * -40},-40 L${side * 30},-22`} stroke={ink} strokeWidth="10" strokeLinecap="round" />
          </g>
        ))}
        <path
          d="M-26,-20 L0,24 L26,-20 Q0,-6 -26,-20 Z"
          fill="#3a2c1c"
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
    </g>
  )
}
