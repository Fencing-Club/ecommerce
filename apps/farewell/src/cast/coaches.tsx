import type { ReactNode } from "react"
import { type Place, placed } from "../paper"
import { chalkboard, font, gold, ink, paper, wood } from "../theme"
import { armSwing, type Bend, bodyLean, type Build, type Stride } from "../walk"
import { Arm, Eyes, Glove, Leg, type Mouth, MouthShape, ThinLeg } from "./parts"

// A thin limb, a black line or a wooden dowel, ending in a glove or a shoe.
export const Limb = ({
  x,
  y,
  swing,
  length,
  end,
  color = ink,
  width = 7,
  children
}: {
  x: number
  y: number
  swing: number
  length: number
  end: "glove" | "shoe"
  color?: string
  width?: number
  children?: ReactNode
}) => (
  <g transform={`translate(${x} ${y}) rotate(${swing})`}>
    <path
      d={`M0,0 Q${length * 0.1},${length / 2} 0,${length}`}
      stroke={color}
      strokeWidth={width}
      fill="none"
      strokeLinecap="round"
    />
    {end === "glove" ? (
      <g transform={`translate(0 ${length + 2}) scale(0.85)`}>
        {children}
        <Glove />
      </g>
    ) : (
      <path
        d={`M-12,${length - 4} Q-14,${length + 10} 0,${length + 10} L22,${length + 10} Q30,${length + 4} 16,${length - 2} Z`}
        fill="#2a211c"
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    )}
  </g>
)

type CoachProps = Place & {
  armL?: number
  armR?: number
  legL?: number
  legR?: number
  mouth?: Mouth
  look?: { x: number; y: number }
  holdR?: ReactNode
}

// Reading Coach: an open book in round spectacles, with a pointer for the tricky words.
export const ReadingCoach = ({
  armL = 20,
  armR = 40,
  legL = 0,
  legR = 0,
  mouth = "smile",
  look = { x: 0, y: 0 },
  holdR,
  ...place
}: CoachProps) => (
  <g transform={placed(place)}>
    <Leg x={-32} y={-160} swing={legL} trousers="#56627e" shoe="#1d1714" facing={-1} length={160} />
    <Leg x={32} y={-160} swing={legR} trousers="#56627e" shoe="#1d1714" facing={1} length={160} />
    <Arm x={-108} y={-250} side={-1} swing={armL} bend={20} sleeve="#4535a8" length={52} />
    <Arm x={108} y={-250} side={1} swing={armR} bend={-30} sleeve="#4535a8" length={52}>
      {holdR}
    </Arm>
    <rect x="-116" y="-324" width="232" height="178" rx="8" fill="#4535a8" stroke={ink} strokeWidth="3" />
    <path
      d="M-116,-160 L-102,-146 M116,-160 L102,-146 M-116,-310 L-102,-324 M116,-310 L102,-324"
      stroke={gold.base}
      strokeWidth="7"
      strokeLinecap="round"
    />
    {[-1, 1].map((side) => (
      <g key={side} transform={`scale(${side} 1)`}>
        <path
          d="M2,-302 Q52,-320 106,-308 L106,-162 Q52,-178 2,-158 Z"
          fill={paper.light}
          stroke={ink}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M106,-308 L110,-304 L110,-160 L106,-162" fill={paper.shade} stroke={ink} strokeWidth="1.5" />
        {[-206, -192, -178].map((y) => (
          <path key={y} d={`M18,${y} Q55,${y - 6} 92,${y - 1}`} stroke="#9c8d73" strokeWidth="3" fill="none" />
        ))}
      </g>
    ))}
    <rect x="12" y="-212" width="42" height="13" fill="#ffe066" opacity="0.85" />
    <path d="M14,-206 Q34,-210 52,-207" stroke="#6b5a3a" strokeWidth="3" fill="none" />
    <path
      d="M0,-158 L0,-118 L-6,-126 L-12,-116 L-8,-156 Z"
      fill="#c62828"
      stroke={ink}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <rect x="-70" y="-344" width="140" height="26" rx="4" fill={gold.base} stroke={ink} strokeWidth="2.5" />
    <text x="0" y="-325" textAnchor="middle" fontFamily={font.caps} fontSize="17" letterSpacing="2" fill={ink}>
      Reading Coach
    </text>
    <circle cx="-62" cy="-238" r="8" fill="#ef9a87" opacity="0.5" />
    <circle cx="62" cy="-238" r="8" fill="#ef9a87" opacity="0.5" />
    <Eyes x={0} y={-262} gap={72} r={6} look={look} white={false} />
    <g fill="rgba(255,255,255,0.2)" stroke={ink} strokeWidth="3">
      <circle cx="-36" cy="-262" r="20" />
      <circle cx="36" cy="-262" r="20" />
    </g>
    <path d="M-16,-266 Q0,-274 16,-266" stroke={ink} strokeWidth="3" fill="none" />
    <path
      d="M-52,-292 Q-36,-300 -20,-292 M20,-292 Q36,-300 52,-292"
      stroke={ink}
      strokeWidth="3.5"
      fill="none"
      strokeLinecap="round"
    />
    <MouthShape x={0} y={-226} mouth={mouth} size={0.95} />
  </g>
)

// A felt board eraser, held about its middle.
export const Eraser = () => (
  <g transform="rotate(-10)">
    <rect x="-26" y="-12" width="52" height="16" rx="3" fill={wood.light} stroke={ink} strokeWidth="2.5" />
    <rect x="-26" y="4" width="52" height="10" rx="2" fill="#6d6d74" stroke={ink} strokeWidth="2.5" />
  </g>
)

// A stick of chalk, held about its middle.
export const Chalk = () => (
  <rect
    x="-4"
    y="-16"
    width="8"
    height="26"
    rx="3"
    fill="#fbfaf2"
    stroke={ink}
    strokeWidth="2"
    transform="rotate(30)"
  />
)

// Math Coach: a chalkboard on easel legs with a face drawn in chalk, eraser in one hand and chalk in the other.
export const MathCoach = ({
  armL = 30,
  armR = 30,
  mouth = "smile",
  look = { x: 0, y: 0 },
  holdL = <Eraser />,
  holdR = <Chalk />,
  ...place
}: Omit<CoachProps, "holdR"> & { holdL?: ReactNode; holdR?: ReactNode }) => (
  <g transform={placed(place)}>
    <line x1="0" y1="-200" x2="0" y2="-8" stroke={wood.deep} strokeWidth="10" strokeLinecap="round" />
    <Limb x={-96} y={-262} swing={armL} length={70} end="glove" color={wood.dark} width={9}>
      {holdL}
    </Limb>
    <g transform="scale(-1 1)">
      <Limb x={-96} y={-262} swing={armR} length={70} end="glove" color={wood.dark} width={9}>
        <g transform="scale(-1 1)">{holdR}</g>
      </Limb>
    </g>
    <line x1="-58" y1="-186" x2="-86" y2="-2" stroke={wood.dark} strokeWidth="13" strokeLinecap="round" />
    <line x1="58" y1="-186" x2="86" y2="-2" stroke={wood.dark} strokeWidth="13" strokeLinecap="round" />
    <rect x="-100" y="-344" width="200" height="158" rx="6" fill={wood.base} stroke={ink} strokeWidth="3" />
    <rect x="-87" y="-331" width="174" height="132" fill={chalkboard.board} stroke={ink} strokeWidth="2" />
    <rect x="-108" y="-194" width="216" height="13" rx="3" fill={wood.dark} stroke={ink} strokeWidth="2.5" />
    <rect x="-70" y="-202" width="22" height="7" rx="3" fill="#fbfaf2" />
    <rect x="40" y="-201" width="16" height="6" rx="3" fill="#f5c0c0" />
    <g filter="url(#chalky)" stroke={chalkboard.line} fill="none" strokeLinecap="round">
      <text
        x="0"
        y="-309"
        textAnchor="middle"
        fontFamily={font.chalk}
        fontSize="19"
        fill={chalkboard.line}
        stroke="none"
        letterSpacing="1"
      >
        MATH COACH
      </text>
      <circle cx="-32" cy="-268" r="15" strokeWidth="3.5" />
      <circle cx="32" cy="-268" r="15" strokeWidth="3.5" />
      <circle cx={-32 + look.x * 6} cy={-266 + look.y * 6} r="6" fill={chalkboard.line} />
      <circle cx={32 + look.x * 6} cy={-266 + look.y * 6} r="6" fill={chalkboard.line} />
      <path d="M-50,-294 Q-34,-302 -16,-294 M16,-294 Q34,-302 50,-294" strokeWidth="4" />
      {mouth === "o" ? (
        <ellipse cx="0" cy="-226" rx="9" ry="10" strokeWidth="3.5" />
      ) : (
        <path d={mouth === "flat" ? "M-18,-228 H18" : "M-24,-232 Q0,-212 24,-232"} strokeWidth="4" />
      )}
      <path d="M2,-256 L-4,-242 L6,-242" strokeWidth="3" />
      <text x="-80" y="-212" fontFamily={font.chalk} fontSize="15" fill={chalkboard.line} stroke="none">
        2+2=4
      </text>
      <text x="58" y="-212" fontFamily={font.chalk} fontSize="18" fill={chalkboard.line} stroke="none">
        π
      </text>
    </g>
  </g>
)

// A fan of flashcards in one hand.
export const Flashcards = () => (
  <g>
    {["#ffd166", "#06d6a0", "#ef476f"].map((color, i) => (
      <rect
        key={color}
        x="-16"
        y="-44"
        width="32"
        height="44"
        rx="3"
        fill={color}
        stroke={ink}
        strokeWidth="2.5"
        transform={`rotate(${-20 + i * 20} 0 0)`}
      />
    ))}
  </g>
)

// Study Guide's thin legs, pigeon-toed standing.
export const studyGuideLegs: Build = { hip: 136, spread: 28, bone: 62, ankle: 10 }

const Shoe = () => (
  <path
    d="M-12,-4 Q-14,10 0,10 L22,10 Q30,4 16,-2 Z"
    fill="#2a211c"
    stroke={ink}
    strokeWidth="3"
    strokeLinejoin="round"
  />
)

// Study Guide, from Copilot Notebooks: a spiral notebook in a mortarboard, dealing flashcards. Walks on `stride` from
// `walk`.
export const StudyGuide = ({
  armL = 25,
  armR = 50,
  legL = 4,
  legR = 4,
  stride,
  mouth = "smile",
  look = { x: 0, y: 0 },
  holdR = <Flashcards />,
  ...place
}: CoachProps & { stride?: Stride }) => {
  const { hip, spread, bone } = studyGuideLegs
  const legs: Bend[] = stride
    ? [stride.left, stride.right]
    : [
        { hip: -spread, facing: 1, swing: -legL, knee: 0, ankle: 0 },
        { hip: spread, facing: -1, swing: -legR, knee: 0, ankle: 0 }
      ]
  return (
    <g transform={placed(place)}>
      {(stride?.near === -1 ? [...legs].reverse() : legs).map((leg) => (
        <ThinLeg key={leg.hip < 0 ? "left" : "right"} y={-hip} bone={bone} leg={leg} foot={<Shoe />} />
      ))}
      <g transform={bodyLean(studyGuideLegs, stride)}>
        <Limb x={-76} y={-236} swing={armSwing(armL, stride)} length={68} end="glove" />
        <g transform="scale(-1 1)">
          <Limb x={-76} y={-236} swing={armSwing(armR, stride)} length={68} end="glove">
            <g transform="scale(-1 1)">{holdR}</g>
          </Limb>
        </g>
        <rect x="-80" y="-334" width="160" height="206" rx="8" fill="#cfc4f4" stroke={ink} strokeWidth="3" />
        <rect x="-80" y="-334" width="22" height="206" rx="6" fill="url(#copilotBody)" stroke={ink} strokeWidth="2.5" />
        <path d="M60,-330 Q78,-328 78,-310 V-150 Q78,-132 60,-130 Z" fill="url(#hatch)" opacity="0.25" />
        {Array.from({ length: 11 }, (_, i) => -62 + i * 13).map((x) => (
          <ellipse key={x} cx={x} cy="-334" rx="4.5" ry="10" fill="none" stroke="#3e3e48" strokeWidth="3" />
        ))}
        <rect x="-46" y="-316" width="110" height="32" rx="3" fill="#fffdf6" stroke={ink} strokeWidth="2" />
        <text x="9" y="-294" textAnchor="middle" fontFamily={font.caps} fontSize="16" letterSpacing="1.5" fill={ink}>
          Study Guide
        </text>
        <Eyes x={10} y={-238} gap={50} r={13} look={look} />
        <MouthShape x={10} y={-196} mouth={mouth} />
        <circle cx="-22" cy="-206" r="8" fill="#ef9a87" opacity="0.45" />
        <circle cx="42" cy="-206" r="8" fill="#ef9a87" opacity="0.45" />
        <g transform="translate(10 -350) rotate(-6)">
          <path d="M-34,6 L34,6 L30,22 L-30,22 Z" fill="#26232a" stroke={ink} strokeWidth="2.5" />
          <path d="M-64,0 L0,-18 L64,0 L0,18 Z" fill="#2f2b33" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M0,0 Q40,6 46,30" stroke={gold.base} strokeWidth="3.5" fill="none" />
          <path d="M40,28 L52,28 L56,50 L36,50 Z" fill={gold.base} stroke={ink} strokeWidth="2" />
          <circle r="4" fill={gold.base} />
        </g>
      </g>
    </g>
  )
}
