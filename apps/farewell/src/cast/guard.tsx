import { type Place, placed } from "../paper"
import { font, gold, ink, skin } from "../theme"
import { armSwing, bodyLean, onLegs, type Stride } from "../walk"
import { Arm, Legs } from "./parts"

const red = "#c1121f"

export const guardLegs = onLegs(170, 18, 170)

// A pike topped with a security key the size of a halberd's head, standing on its butt at (0, 0).
export const SecurityKey = () => (
  <g>
    <rect x="-7" y="-440" width="14" height="436" rx="4" fill="#3b2412" stroke={ink} strokeWidth="2.5" />
    <g transform="translate(0 -486)">
      <rect x="-28" y="-50" width="56" height="100" rx="13" fill="#1f2328" stroke={ink} strokeWidth="3" />
      <rect x="-15" y="-78" width="30" height="30" fill={gold.base} stroke={ink} strokeWidth="2.5" />
      <path d="M-8,-74 V-54 M0,-74 V-54 M8,-74 V-54" stroke={gold.deep} strokeWidth="2" />
      <circle cx="0" cy="18" r="14" fill={gold.base} stroke={ink} strokeWidth="2.5" />
      <text x="0" y="-14" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="15" fill="#fff">
        MFA
      </text>
    </g>
  </g>
)

// The SFI Guard: bearskin, red tunic and a security key on a pike, `lowered` from upright (0) to level across the way
// (1). Nobody gets past without signing in again. Walks on `stride` from `walk`, the pike held steady.
export const Guard = ({ lowered = 0, stride, ...place }: Place & { lowered?: number; stride?: Stride }) => (
  <g transform={placed(place)}>
    <g transform={bodyLean(guardLegs, stride)}>
      <g transform={`rotate(${lowered * 90} 76 -176) translate(78 -2)`}>
        <SecurityKey />
      </g>
    </g>
    <Legs build={guardLegs} stride={stride} trousers="#1d1f2b" shoe="#0d0d10" stripe={red} />
    <g transform={bodyLean(guardLegs, stride)}>
      <path
        d="M-48,-300 Q-56,-240 -50,-166 L50,-166 Q56,-240 48,-300 Q24,-314 0,-314 Q-24,-314 -48,-300 Z"
        fill={red}
        stroke={ink}
        strokeWidth="3"
      />
      <rect x="-50" y="-198" width="100" height="14" fill="#f4f4f0" stroke={ink} strokeWidth="2.5" />
      <rect x="-8" y="-200" width="16" height="18" fill={gold.base} stroke={ink} strokeWidth="2" />
      {[-286, -262, -238, -214].map((y) => (
        <circle key={y} cx="0" cy={y} r="4" fill={gold.light} stroke={ink} strokeWidth="1.5" />
      ))}
      <path d="M-20,-314 H20 L16,-300 H-16 Z" fill={gold.base} stroke={ink} strokeWidth="2" />
      <rect x="-10" y="-330" width="20" height="18" fill={skin.shade} stroke={ink} strokeWidth="2.5" />
      <circle cx="0" cy="-352" r="30" fill={skin.base} stroke={ink} strokeWidth="3" />
      <path d="M-12,-358 H-4 M4,-358 H12" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <path
        d="M-16,-340 Q-8,-346 0,-340 Q8,-346 16,-340 Q24,-338 26,-346 M-16,-340 Q-24,-338 -26,-346"
        stroke="#5a3a1e"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M-8,-330 H8" stroke={ink} strokeWidth="2.5" />
      <path d="M-30,-352 Q-34,-320 0,-318 Q34,-320 30,-352" stroke={gold.base} strokeWidth="3" fill="none" />
      <path
        d="M-38,-366 Q-52,-420 -40,-456 Q-22,-494 8,-492 Q44,-484 48,-438 Q54,-400 38,-366 Z"
        fill="#15120f"
        stroke={ink}
        strokeWidth="3"
      />
      {[-440, -420, -400, -380].map((y) => (
        <path
          key={y}
          d={`M-30,${y} q6,-8 12,0 q6,-8 12,0 q6,-8 12,0 q6,-8 12,0`}
          stroke="#3a332c"
          strokeWidth="2"
          fill="none"
        />
      ))}
      <rect x="-26" y="-402" width="52" height="24" rx="4" fill={gold.base} stroke={ink} strokeWidth="2" />
      <text x="0" y="-383" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="19" fill={ink}>
        SFI
      </text>
      <Arm x={-48} y={-292} side={-1} swing={armSwing(4, stride)} bend={0} sleeve={red} length={60} />
      <Arm x={48} y={-292} side={1} swing={18} bend={-10} sleeve={red} length={60} />
    </g>
  </g>
)
