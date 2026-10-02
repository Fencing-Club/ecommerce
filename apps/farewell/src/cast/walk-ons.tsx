import { type Place, placed } from "../paper"
import { ink, paper } from "../theme"
import type { Bend, Build, Stride } from "../walk"
import { Badge } from "./engineer"
import { ThinLeg } from "./parts"

// The bit parts: walk-ons with a moment each.

const bone = "#efe9d8"

// The skeleton chained to the oldest task in the backlog, still waiting; its right arm waves by `wave` and its jaw
// drops by `jaw`. Feet on (x, y), about 330 tall.
export const Skeleton = ({ wave = 0, jaw = 0, ...place }: Place & { wave?: number; jaw?: number }) => (
  <g transform={placed(place)} stroke={ink} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
    {[-1, 1].map((side) => (
      <g key={side}>
        <path d={`M${side * 16},-150 L${side * 22},-78 L${side * 18},-4`} fill="none" stroke={ink} strokeWidth="11" />
        <path d={`M${side * 16},-150 L${side * 22},-78 L${side * 18},-4`} fill="none" stroke={bone} strokeWidth="6" />
        <ellipse cx={side * 26} cy="-2" rx="16" ry="6" fill={bone} />
      </g>
    ))}
    <path d="M-30,-160 Q0,-140 30,-160 L22,-136 Q0,-128 -22,-136 Z" fill={bone} />
    <path d="M0,-160 V-286" stroke={ink} strokeWidth="10" />
    <path d="M0,-160 V-286" stroke={bone} strokeWidth="5" />
    {[0, 1, 2, 3].map((i) => (
      <path
        key={i}
        d={`M-4,${-272 + i * 20} Q-44,${-266 + i * 20} -36,${-250 + i * 20} M4,${-272 + i * 20} Q44,${-266 + i * 20} 36,${-250 + i * 20}`}
        fill="none"
        stroke={bone}
        strokeWidth="6"
      />
    ))}
    <path d="M-44,-286 H44" stroke={bone} strokeWidth="7" />
    <path d="M-44,-284 L-56,-210 L-50,-140" fill="none" stroke={ink} strokeWidth="10" />
    <path d="M-44,-284 L-56,-210 L-50,-140" fill="none" stroke={bone} strokeWidth="5" />
    <g transform={`translate(44 -284) rotate(${-150 + Math.sin(wave * 9) * 20 * (wave > 0 ? 1 : 0)})`}>
      <path d="M0,0 L0,64 L10,120" fill="none" stroke={ink} strokeWidth="10" />
      <path d="M0,0 L0,64 L10,120" fill="none" stroke={bone} strokeWidth="5" />
      <path d="M10,120 l-8,16 M10,120 l2,18 M10,120 l10,14" stroke={bone} strokeWidth="4" />
    </g>
    <path d="M-30,-300 Q-34,-352 0,-356 Q34,-352 30,-300 Q20,-292 0,-294 Q-20,-292 -30,-300 Z" fill={bone} />
    <ellipse cx="-12" cy="-322" rx="9" ry="11" fill={ink} />
    <ellipse cx="12" cy="-322" rx="9" ry="11" fill={ink} />
    <path d="M0,-312 l-4,8 h8 Z" fill={ink} />
    <g transform={`translate(0 ${jaw * 26})`}>
      <path d="M-20,-296 Q0,-284 20,-296 L18,-284 Q0,-274 -18,-284 Z" fill={bone} />
      <path d="M-12,-294 V-286 M-4,-292 V-284 M4,-292 V-284 M12,-294 V-286" stroke={ink} strokeWidth="1.5" />
    </g>
  </g>
)

// A red squirrel caching acorns: a big tail, a bigger appetite, and one eye shut while `wink`. Feet on (x, y), about
// 150 tall.
export const Squirrel = ({ wink = false, acorn = true, ...place }: Place & { wink?: boolean; acorn?: boolean }) => (
  <g transform={placed(place)} stroke={ink} strokeWidth="2.5" strokeLinejoin="round" filter="url(#cut)">
    <path d="M-20,-10 Q-90,-20 -80,-90 Q-70,-150 -20,-150 Q-60,-120 -46,-80 Q-30,-40 -20,-10 Z" fill="#b5541f" />
    <path d="M-60,-120 Q-50,-100 -46,-80" fill="none" stroke="#e08a4a" strokeWidth="4" />
    <ellipse cx="0" cy="-52" rx="30" ry="44" fill="#c9672b" />
    <ellipse cx="6" cy="-46" rx="16" ry="30" fill="#f2d2a6" stroke="none" />
    <circle cx="10" cy="-110" r="26" fill="#c9672b" />
    <path d="M-6,-130 L-4,-152 L8,-134 M18,-132 L26,-152 L30,-128" fill="#c9672b" />
    {wink ? (
      <path d="M8,-114 q7,-5 14,0" fill="none" strokeWidth="3" />
    ) : (
      <circle cx="16" cy="-114" r="5" fill={ink} stroke="none" />
    )}
    <circle cx="34" cy="-104" r="4" fill={ink} stroke="none" />
    <path d="M26,-96 q6,4 10,0" fill="none" strokeWidth="2" />
    {acorn ? (
      <g transform="translate(26 -68)">
        <ellipse rx="16" ry="19" fill="#b58a3c" />
        <path d="M-17,-8 Q0,-27 17,-8 Z" fill="#6b4423" />
        <text
          y="7"
          textAnchor="middle"
          fontSize="10"
          fill={paper.light}
          stroke="none"
          fontWeight="700"
          textLength="28"
          lengthAdjust="spacingAndGlyphs"
        >
          CACHE
        </text>
      </g>
    ) : null}
    <ellipse cx="-14" cy="-6" rx="16" ry="7" fill="#b5541f" />
    <ellipse cx="18" cy="-6" rx="16" ry="7" fill="#b5541f" />
  </g>
)

// A dolphin in the stalls, waving a flipper by `wave` and saying nothing about the fish. Drawn rising from (x, y).
export const Dolphin = ({ wave = 0, ...place }: Place & { wave?: number }) => (
  <g transform={placed(place)} stroke={ink} strokeWidth="3" strokeLinejoin="round" filter="url(#cut)">
    <path d="M-40,0 Q-70,-140 10,-210 Q50,-236 70,-206 Q40,-200 30,-150 Q20,-60 40,0 Z" fill="#7d9fbf" />
    <path d="M-20,-30 Q-30,-110 20,-170 Q14,-110 30,-40 Z" fill="#d6e4ef" stroke="none" />
    <path d="M58,-214 Q92,-218 100,-204 Q80,-200 66,-198 Z" fill="#7d9fbf" />
    <path d="M70,-204 Q84,-198 96,-202" fill="none" strokeWidth="2" />
    <circle cx="42" cy="-208" r="5" fill={ink} stroke="none" />
    <circle cx="43" cy="-210" r="1.6" fill="#fff" stroke="none" />
    <path d="M-30,-180 Q-20,-230 6,-214 Q-10,-200 -14,-170 Z" fill="#6a8cad" />
    <g transform={`translate(30 -110) rotate(${-40 + Math.sin(wave * 10) * 30})`}>
      <path d="M0,0 Q40,-10 70,-40 Q50,0 10,16 Z" fill="#6a8cad" />
    </g>
  </g>
)

export const badgeLegs: Build = { hip: 46, spread: 12, bone: 20, ankle: 9 }

// The badge, gone walkabout: little legs walking on `stride` from `walk`, a tiny suitcase in hand. Feet on (x, y),
// about 150 tall.
export const BadgeWalker = ({ stride, ...place }: Place & { stride?: Stride }) => {
  // The step's swing, from -1 to 1, for the suitcase and a wobble.
  const step = (stride?.arms ?? 0) / 14
  const legs: Bend[] = stride
    ? [stride.left, stride.right]
    : [
        { hip: -badgeLegs.spread, facing: -1, swing: 0, knee: 0, ankle: 0 },
        { hip: badgeLegs.spread, facing: 1, swing: 0, knee: 0, ankle: 0 }
      ]
  return (
    <g transform={placed(place)} strokeLinecap="round">
      {(stride?.near === -1 ? [...legs].reverse() : legs).map((leg) => (
        <ThinLeg
          key={leg.hip < 0 ? "left" : "right"}
          y={-badgeLegs.hip}
          bone={badgeLegs.bone}
          leg={leg}
          width={5}
          foot={<ellipse cx="6" cy="4" rx="10" ry="5" fill="#1d1714" stroke={ink} strokeWidth="2" />}
        />
      ))}
      <g transform={`translate(0 -150) scale(2.2) rotate(${step * 3})`}>
        <Badge />
      </g>
      <path d={`M30,-80 L52,${-56 + step * 4}`} stroke={ink} strokeWidth="5" />
      <g transform={`translate(54 ${-40 + step * 4})`} filter="url(#cut)">
        <rect x="-22" y="-16" width="44" height="32" rx="4" fill="#8a5a2a" stroke={ink} strokeWidth="2.5" />
        <path d="M-8,-16 V-24 H8 V-16" fill="none" stroke={ink} strokeWidth="3" />
        <circle cx="-8" cy="2" r="6" fill="#e9c46a" stroke={ink} strokeWidth="1.5" />
      </g>
      <path d="M-30,-80 L-46,-60" stroke={ink} strokeWidth="5" />
    </g>
  )
}

const heads = ["bun", "plain", "cap", "curls", "pony", "bald", "hat", "plain", "bun", "curls", "cap", "pony"] as const

// One paper doll: a colleague cut from the same sheet as the rest, hands out to hold the next. Feet on (x, y),
// about 200 tall.
const Doll = ({ head, x, squash }: { head: (typeof heads)[number]; x: number; squash: number }) => (
  <g transform={`translate(${x} 0) scale(${squash} 1)`}>
    <path
      d="M-14,0 L-10,-70 L-46,-104 L-46,-118 L-20,-112 Q-24,-150 0,-150 Q24,-150 20,-112 L46,-118 L46,-104 L10,-70 L14,0 L4,0 L0,-50 L-4,0 Z"
      fill={paper.light}
      stroke={ink}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <circle cy="-172" r="22" fill={paper.light} stroke={ink} strokeWidth="2.5" />
    {head === "bun" ? <circle cy="-198" r="10" fill={paper.light} stroke={ink} strokeWidth="2.5" /> : null}
    {head === "cap" ? (
      <path
        d="M-22,-180 Q-20,-200 0,-200 Q22,-198 24,-182 L40,-180 L22,-176 Z"
        fill={paper.light}
        stroke={ink}
        strokeWidth="2.5"
      />
    ) : null}
    {head === "curls" ? (
      <path
        d="M-24,-176 a8,8 0 0 1 6,-16 a8,8 0 0 1 12,-8 a8,8 0 0 1 14,0 a8,8 0 0 1 12,8 a8,8 0 0 1 4,16"
        fill={paper.light}
        stroke={ink}
        strokeWidth="2.5"
      />
    ) : null}
    {head === "pony" ? (
      <path d="M18,-186 Q40,-180 34,-150 Q26,-166 18,-172" fill={paper.light} stroke={ink} strokeWidth="2.5" />
    ) : null}
    {head === "hat" ? (
      <path d="M-30,-184 H30 M-16,-184 V-206 H16 V-184" fill={paper.light} stroke={ink} strokeWidth="2.5" />
    ) : null}
  </g>
)

// A chain of paper dolls holding hands, unfolding from the left as `unfold` goes from 0 to 1. Feet on (x, y).
export const PaperDolls = ({ count, unfold, ...place }: Place & { count: number; unfold: number }) => (
  <g transform={placed(place)} filter="url(#cut)">
    {Array.from({ length: count }, (_, i) => {
      const out = Math.min(1, Math.max(0, unfold * count - i))
      return out > 0 ? (
        <Doll
          key={i}
          head={heads[i % heads.length] ?? "plain"}
          x={i * 92 * out + (1 - out) * (i - 1) * 92}
          squash={0.15 + 0.85 * out}
        />
      ) : null
    })}
  </g>
)

// The foot: a giant one, cut out of an old master, that comes down at the end of things. Drawn in profile, toes to the
// right, in varnished flesh with the light from above: heel, arch, ankle bone and calf, four toes and their nails.
// Its sole is on (x, y), and the leg runs some 1300 up out of sight.
export const GiantFoot = (place: Place) => (
  <g transform={placed(place)} strokeLinejoin="round">
    <defs>
      <linearGradient id="footFlesh" x1="0" x2="0.35" y1="0" y2="1">
        <stop offset="0" stopColor="#f6dcc4" />
        <stop offset="0.55" stopColor="#ecc4a2" />
        <stop offset="1" stopColor="#d49b7a" />
      </linearGradient>
      <linearGradient id="footShadow" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#8f5a44" stopOpacity="0.55" />
        <stop offset="1" stopColor="#8f5a44" stopOpacity="0" />
      </linearGradient>
    </defs>
    <g filter="url(#cut)">
      <path
        d="M-430,-1300 C-470,-1080 -430,-720 -370,-520 C-340,-410 -360,-300 -400,-170 C-440,-60 -390,0 -300,0 C-150,-4 50,-14 150,-6 C220,0 300,4 360,0 L420,-8 L410,-66 C330,-80 250,-110 160,-150 C60,-200 -20,-260 -60,-340 C-90,-520 -60,-760 -50,-1300 Z"
        fill="url(#footFlesh)"
        stroke={ink}
        strokeWidth="5"
      />
      <path
        d="M-430,-1300 C-470,-1080 -430,-720 -370,-520 C-340,-410 -360,-300 -400,-170 C-440,-60 -390,0 -300,0 L-240,0 C-320,-40 -320,-200 -300,-320 C-280,-480 -330,-800 -330,-1300 Z"
        fill="url(#footShadow)"
      />
      <path
        d="M-300,-6 C-120,-12 60,-24 200,-12 C260,-8 320,-6 360,-8"
        stroke="#b97f62"
        strokeWidth="10"
        fill="none"
        opacity="0.5"
      />
      {[
        { x: 334, y: -80, rx: 26, ry: 17 },
        { x: 362, y: -70, rx: 32, ry: 20 },
        { x: 394, y: -55, rx: 38, ry: 25 },
        { x: 432, y: -34, rx: 52, ry: 32 }
      ].map(({ x, y, rx, ry }) => (
        <g key={x}>
          <ellipse
            cx={x}
            cy={y}
            rx={rx}
            ry={ry}
            transform={`rotate(-9 ${x} ${y})`}
            fill="#efc7a6"
            stroke={ink}
            strokeWidth="4"
          />
          <ellipse
            cx={x + rx * 0.55}
            cy={y - ry * 0.45}
            rx={rx * 0.32}
            ry={ry * 0.3}
            transform={`rotate(-24 ${x + rx * 0.55} ${y - ry * 0.45})`}
            fill="#fbe6e0"
            stroke="#b98a7a"
            strokeWidth="2"
          />
        </g>
      ))}
    </g>
    <g fill="none" strokeLinecap="round">
      <path d="M-82,-1220 C-96,-900 -104,-640 -92,-420" stroke="#fff6ea" strokeWidth="14" opacity="0.45" />
      <ellipse cx="-150" cy="-318" rx="34" ry="24" fill="#fff3e4" opacity="0.35" />
      <path d="M-120,-300 C-150,-270 -190,-282 -196,-318" stroke="#b97f62" strokeWidth="4" opacity="0.7" />
      <path d="M-44,-318 C-20,-296 -8,-270 -10,-246" stroke="#b97f62" strokeWidth="4" opacity="0.6" />
      <path d="M-360,-230 C-330,-180 -330,-110 -360,-60" stroke="#b97f62" strokeWidth="4" opacity="0.6" />
      <path d="M250,-112 C268,-96 270,-78 262,-64" stroke="#b97f62" strokeWidth="3.5" opacity="0.6" />
      <path d="M120,-140 C220,-150 300,-120 340,-96" stroke="#fff6ea" strokeWidth="10" opacity="0.4" />
      <g stroke="#7a5a3a" strokeWidth="1.5" opacity="0.28">
        <path d="M-380,-1180 L-330,-1120 L-344,-1040 L-290,-990 M-344,-1040 L-400,-990" />
        <path d="M-260,-860 L-210,-820 L-230,-760 M-210,-820 L-150,-830 L-120,-780" />
        <path d="M-200,-560 L-160,-520 L-180,-470 L-120,-430 M-160,-520 L-100,-540" />
        <path d="M-300,-420 L-250,-380 L-270,-330 M-250,-380 L-200,-400" />
        <path d="M20,-120 L70,-100 L60,-60 M70,-100 L120,-110" />
        <path d="M-240,-150 L-190,-120 L-210,-70 M-190,-120 L-140,-140" />
      </g>
    </g>
  </g>
)
