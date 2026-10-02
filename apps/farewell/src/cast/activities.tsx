import { type Place, placed } from "../paper"
import { font, ink } from "../theme"
import { Limb } from "./coaches"
import { Eyes, type Mouth, MouthShape } from "./parts"

export type Activity = "quiz" | "flashcards" | "blank" | "matching"

const looks: Record<Activity, { label: string; color: string }> = {
  quiz: { label: "Quiz", color: "#7a4cc2" },
  flashcards: { label: "Flashcards", color: "#0f8f84" },
  blank: { label: "Fill in the Blank", color: "#d9661f" },
  matching: { label: "Matching", color: "#2a6fd6" }
}

// The Loop badge every activity wears: it travels anywhere as a Loop component.
export const LoopBadge = ({ x, y, size = 1 }: { x: number; y: number; size?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${size})`}>
    <circle r="13" fill="#fff" stroke={ink} strokeWidth="2" />
    <path
      d="M-6,4 C-12,-2 -6,-11 1,-7 C8,-3 6,8 -1,8 C-7,8 -6,-2 4,-4"
      stroke="url(#loopInk)"
      strokeWidth="3.5"
      fill="none"
      strokeLinecap="round"
    />
  </g>
)

const Content = ({ kind }: { kind: Activity }) => {
  if (kind === "quiz") {
    return (
      <g fontFamily={font.sans} fontWeight="700" fontSize="11" textAnchor="middle">
        {[
          { x: -22, y: -192, letter: "A" },
          { x: 22, y: -192, letter: "B" },
          { x: -22, y: -166, letter: "C" },
          { x: 22, y: -166, letter: "D" }
        ].map(({ x, y, letter }) => (
          <g key={letter}>
            <circle cx={x} cy={y} r="10" fill="#efe7fb" stroke={ink} strokeWidth="2" />
            <text x={x} y={y + 4} fill={ink}>
              {letter}
            </text>
          </g>
        ))}
      </g>
    )
  }
  if (kind === "flashcards") {
    return (
      <g>
        <text x="-36" y="-174" fontFamily={font.book} fontSize="26" fill={ink}>
          Q:
        </text>
        <path d="M-2,-186 H36 M-2,-174 H28" stroke="#a49a86" strokeWidth="3" />
        <path d="M58,-162 L36,-140 L58,-140 Z" fill="#e7dcc4" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      </g>
    )
  }
  if (kind === "blank") {
    return (
      <g>
        <path d="M-40,-190 H-6 M-40,-168 H-20" stroke="#a49a86" strokeWidth="3.5" />
        <path d="M2,-188 H42 M-14,-166 H40" stroke={ink} strokeWidth="2.5" strokeDasharray="5 3" />
      </g>
    )
  }
  return (
    <g>
      <path d="M-30,-196 L30,-160 M-30,-178 L30,-196 M-30,-160 L30,-178" stroke={ink} strokeWidth="2.5" />
      {[-196, -178, -160].map((y, i) => (
        <g key={y}>
          <circle cx="-30" cy={y} r="6" fill={["#ef476f", "#ffd166", "#06d6a0"][i]} stroke={ink} strokeWidth="2" />
          <circle cx="30" cy={y} r="6" fill={["#ffd166", "#06d6a0", "#ef476f"][i]} stroke={ink} strokeWidth="2" />
        </g>
      ))}
    </g>
  )
}

type CardProps = Place & {
  kind: Activity
  armL?: number
  armR?: number
  legL?: number
  legR?: number
  mouth?: Mouth
  look?: { x: number; y: number }
  hat?: boolean
}

// One of the Learning Activities: a card on legs, in a straw boater, named on its header.
export const ActivityCard = ({
  kind,
  armL = 30,
  armR = 30,
  legL = 4,
  legR = 4,
  mouth = "smile",
  look = { x: 0, y: 0 },
  hat = true,
  ...place
}: CardProps) => {
  const { label, color } = looks[kind]
  return (
    <g transform={placed(place)}>
      <Limb x={-22} y={-142} swing={legL} length={128} end="shoe" />
      <g transform="scale(-1 1)">
        <Limb x={-22} y={-142} swing={legR} length={128} end="shoe" />
      </g>
      <Limb x={-58} y={-228} swing={armL} length={60} end="glove" />
      <g transform="scale(-1 1)">
        <Limb x={-58} y={-228} swing={armR} length={60} end="glove" />
      </g>
      {kind === "flashcards" ? (
        <g>
          <rect x="-50" y="-312" width="116" height="168" rx="8" fill="#e9f4f2" stroke={ink} strokeWidth="2.5" />
          <rect x="-54" y="-306" width="116" height="168" rx="8" fill="#f4faf9" stroke={ink} strokeWidth="2.5" />
        </g>
      ) : null}
      <rect x="-60" y="-302" width="120" height="168" rx="8" fill="#fffdf6" stroke={ink} strokeWidth="3" />
      <path
        d="M-60,-294 Q-60,-302 -52,-302 H52 Q60,-302 60,-294 V-272 H-60 Z"
        fill={color}
        stroke={ink}
        strokeWidth="3"
      />
      <text
        x="0"
        y="-281.5"
        textAnchor="middle"
        fontFamily={font.sans}
        fontWeight="700"
        fontSize="15"
        fill="#fff"
        textLength={label.length > 10 ? 104 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {label.toUpperCase()}
      </text>
      <Eyes x={0} y={-246} gap={36} r={10} look={look} />
      <MouthShape x={0} y={-218} mouth={mouth} size={0.75} />
      <Content kind={kind} />
      <LoopBadge x={44} y={-150} size={0.8} />
      {hat ? (
        <g transform="translate(0 -304) rotate(-8)">
          <path d="M-30,0 L-27,-24 L27,-24 L30,0 Z" fill="#e8c36a" stroke={ink} strokeWidth="2.5" />
          <rect x="-29" y="-11" width="58" height="8" fill={color} />
          <ellipse cx="0" cy="0" rx="50" ry="8" fill="#e8c36a" stroke={ink} strokeWidth="2.5" />
          <path d="M-22,-20 H22" stroke="#b8933d" strokeWidth="1.5" />
        </g>
      ) : null}
    </g>
  )
}

// The Learning Activities, a barbershop quartet: quiz, flashcards, fill in the blank and matching.
export const Quartet = ({ mouth = "sing", ...place }: Place & { mouth?: Mouth }) => (
  <g transform={placed(place)}>
    <ActivityCard kind="quiz" x={-195} y={0} rotate={-4} armL={70} armR={35} mouth={mouth} look={{ x: 0.5, y: -0.2 }} />
    <ActivityCard
      kind="flashcards"
      x={-65}
      y={-12}
      rotate={2}
      armL={30}
      armR={40}
      mouth={mouth}
      look={{ x: 0.3, y: 0 }}
    />
    <ActivityCard kind="blank" x={65} y={-12} rotate={-2} armL={40} armR={30} mouth={mouth} look={{ x: -0.3, y: 0 }} />
    <ActivityCard
      kind="matching"
      x={195}
      y={0}
      rotate={4}
      armL={35}
      armR={70}
      mouth={mouth}
      look={{ x: -0.5, y: -0.2 }}
    />
  </g>
)
