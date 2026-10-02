import type { ReactNode } from "react"
import { type Place, placed } from "../paper"
import { font, gold, ink, skin } from "../theme"
import { Arm, Eyes, type Mouth, MouthShape } from "./parts"

const red = "#b3191f"

// A rolled scroll with a line written on it, held about its middle.
export const Scroll = ({ text }: { text: string }) => (
  <g transform="rotate(-8)">
    <rect x="-70" y="-18" width="140" height="36" fill="#f6ead0" stroke={ink} strokeWidth="2.5" />
    <ellipse cx="-70" cy="0" rx="8" ry="20" fill="#e2cfa4" stroke={ink} strokeWidth="2.5" />
    <ellipse cx="70" cy="0" rx="8" ry="20" fill="#e2cfa4" stroke={ink} strokeWidth="2.5" />
    <text x="0" y="6" textAnchor="middle" fontFamily={font.caps} fontSize="16" fill={ink}>
      {text}
    </text>
  </g>
)

// A Cardinal of the Reorg: nobody expects one.
export const Cardinal = ({
  armL = 150,
  armR = 30,
  mouth = "sing",
  look = { x: 0, y: 0 },
  holdR,
  ...place
}: Place & { armL?: number; armR?: number; mouth?: Mouth; look?: { x: number; y: number }; holdR?: ReactNode }) => (
  <g transform={placed(place)}>
    <path d="M-30,-6 Q-30,8 -2,8 L-2,-6 Z M30,-6 Q30,8 2,8 L2,-6 Z" fill="#1d1714" stroke={ink} strokeWidth="2.5" />
    <path
      d="M-40,-252 Q-64,-120 -88,-4 L88,-4 Q64,-120 40,-252 Z"
      fill={red}
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path
      d="M-18,-200 Q-32,-100 -40,-4 M10,-200 Q16,-100 22,-4 M34,-190 Q52,-96 62,-4"
      stroke="#76090d"
      strokeWidth="3"
      fill="none"
    />
    <path d="M40,-252 Q64,-120 88,-4 L58,-4 Q44,-130 28,-240 Z" fill="url(#hatch)" opacity="0.3" />
    {[-180, -150, -120, -90, -60, -30].map((y) => (
      <circle key={y} cx="0" cy={y} r="3.5" fill="#600a0d" />
    ))}
    <path
      d="M-56,-258 Q-66,-210 -48,-194 Q0,-180 48,-194 Q66,-210 56,-258 Q0,-280 -56,-258 Z"
      fill="#cf2a2f"
      stroke={ink}
      strokeWidth="3"
    />
    <path d="M-22,-270 H22 V-260 H-22 Z" fill="#fff" stroke={ink} strokeWidth="2" />
    <circle cx="0" cy="-222" r="14" fill={gold.base} stroke={ink} strokeWidth="2.5" />
    <path d="M-7,-229 h6 v6 h-6 Z M1,-229 h6 v6 h-6 Z M-7,-221 h6 v6 h-6 Z M1,-221 h6 v6 h-6 Z" fill={gold.deep} />
    <rect x="-10" y="-280" width="20" height="14" fill={skin.shade} stroke={ink} strokeWidth="2.5" />
    <circle cx="0" cy="-306" r="34" fill={skin.base} stroke={ink} strokeWidth="3" />
    <circle cx="-34" cy="-302" r="8" fill={skin.base} stroke={ink} strokeWidth="2.5" />
    <circle cx="34" cy="-302" r="8" fill={skin.base} stroke={ink} strokeWidth="2.5" />
    <Eyes x={0} y={-310} gap={26} r={4.5} look={look} white={false} />
    <path d="M-24,-326 L-4,-318 M24,-326 L4,-318" stroke={ink} strokeWidth="6" strokeLinecap="round" />
    <path d="M0,-306 Q6,-296 0,-292" stroke={ink} strokeWidth="2.5" fill="none" />
    <MouthShape x={0} y={-286} mouth={mouth} size={0.8} />
    <path
      d="M-30,-330 L-27,-358 L27,-358 L30,-330 Q0,-338 -30,-330 Z"
      fill={red}
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path d="M-10,-358 V-336 M10,-358 V-336" stroke="#76090d" strokeWidth="3" />
    <circle cx="0" cy="-364" r="7" fill={red} stroke={ink} strokeWidth="2.5" />
    <Arm x={-46} y={-246} side={-1} swing={armL} bend={10} sleeve={red} length={54} open />
    <Arm x={46} y={-246} side={1} swing={armR} bend={30} sleeve={red} length={54}>
      {holdR ? <g transform={`rotate(${armR + 30} 0 10)`}>{holdR}</g> : null}
    </Arm>
  </g>
)
