import { type Place, placed } from "../paper"
import { gold, ink, skin, velvet } from "../theme"
import { armSwing, bodyLean, onLegs, type Stride } from "../walk"
import { Arm, Eyes, Legs, type Mouth, MouthShape } from "./parts"

const khaki = "#7a7442"
const khakiDark = "#57532d"
const leather = "#6b3d1e"

export const colonelLegs = onLegs(168, 20, 160)

// A swagger stick: polished cane with brass ends, drawn about the hand holding it.
const Stick = () => (
  <g transform="translate(0 10) rotate(-70)">
    <path d="M0,-60 V60" stroke={ink} strokeWidth="8" strokeLinecap="round" />
    <path d="M0,-60 V60" stroke={leather} strokeWidth="4" strokeLinecap="round" />
    <circle cy="-60" r="5" fill={gold.base} stroke={ink} strokeWidth="1.5" />
    <circle cy="60" r="4" fill={gold.base} stroke={ink} strokeWidth="1.5" />
  </g>
)

// The Colonel, who stops anything getting too silly: khaki, medals, a peaked cap and a moustache you could sweep a
// chimney with. Feet at (x, y), about 430 tall, walking on `stride` from `walk`.
export const Colonel = ({
  armL = 8,
  armR = 10,
  elbowR = 0,
  stride,
  mouth = "flat",
  look = { x: 0, y: 0 },
  ...place
}: Place & {
  armL?: number
  armR?: number
  elbowR?: number
  stride?: Stride
  mouth?: Mouth
  look?: { x: number; y: number }
}) => (
  <g transform={placed(place)}>
    <Legs build={colonelLegs} stride={stride} trousers={khaki} shoe="#24160d" />
    <g transform={bodyLean(colonelLegs, stride)}>
      <path
        d="M-56,-298 Q-66,-240 -62,-160 L62,-160 Q66,-240 56,-298 Q30,-318 0,-318 Q-30,-318 -56,-298 Z"
        fill={khaki}
        stroke={ink}
        strokeWidth="3"
      />
      <path d="M30,-310 Q60,-296 62,-246 L62,-162 L40,-162 Z" fill="url(#hatch)" opacity="0.3" />
      <path d="M-44,-300 L40,-178" stroke={leather} strokeWidth="9" />
      <rect x="-62" y="-196" width="124" height="16" fill={leather} stroke={ink} strokeWidth="2.5" />
      <rect x="-9" y="-198" width="18" height="20" fill={gold.base} stroke={ink} strokeWidth="2" />
      {[-286, -256, -226].map((y) => (
        <circle key={y} cx="0" cy={y} r="4" fill={gold.base} stroke={ink} strokeWidth="1.5" />
      ))}
      {[-38, -26, -14].map((x, i) => (
        <g key={x}>
          <rect
            x={x - 4}
            y="-282"
            width="8"
            height="12"
            fill={[velvet.base, "#2e5cb8", "#2f7d4f"][i]}
            stroke={ink}
            strokeWidth="1"
          />
          <circle cx={x} cy="-262" r="5" fill={gold.base} stroke={ink} strokeWidth="1.5" />
        </g>
      ))}
      <path d="M-22,-318 L-10,-300 L0,-316 L10,-300 L22,-318" fill={velvet.base} stroke={ink} strokeWidth="2" />
      <rect x="-11" y="-338" width="22" height="20" fill={skin.shade} stroke={ink} strokeWidth="2.5" />
      <circle cx="-40" cy="-354" r="9" fill={skin.base} stroke={ink} strokeWidth="2.5" />
      <circle cx="40" cy="-354" r="9" fill={skin.base} stroke={ink} strokeWidth="2.5" />
      <circle cx="0" cy="-356" r="41" fill="#f1b896" stroke={ink} strokeWidth="3" />
      <circle cx="-24" cy="-340" r="9" fill="#e2675a" opacity="0.5" />
      <circle cx="24" cy="-340" r="9" fill="#e2675a" opacity="0.5" />
      <Eyes x={0} y={-362} gap={30} r={6} look={look} />
      <path
        d="M-30,-378 Q-15,-388 -4,-376 M4,-376 Q15,-388 30,-378"
        stroke="#e8e4da"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M0,-352 Q7,-340 0,-336" stroke={ink} strokeWidth="2.5" fill="none" />
      <MouthShape x={0} y={-318} mouth={mouth} size={0.8} />
      <path
        d="M0,-334 Q-20,-346 -42,-326 Q-30,-334 -20,-326 Q-10,-336 0,-330 Q10,-336 20,-326 Q30,-334 42,-326 Q20,-346 0,-334 Z"
        fill="#f4f1ea"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M-44,-384 Q-42,-426 0,-430 Q46,-428 48,-388 Z" fill={khaki} stroke={ink} strokeWidth="3" />
      <rect x="-46" y="-398" width="94" height="13" fill={velvet.base} stroke={ink} strokeWidth="2" />
      <path d="M-50,-386 Q0,-372 54,-388 Q30,-370 -40,-372 Z" fill="#1c1a12" stroke={ink} strokeWidth="2.5" />
      <circle cx="0" cy="-410" r="7" fill={gold.base} stroke={ink} strokeWidth="1.5" />
      <Arm x={-54} y={-292} side={-1} swing={armSwing(armL, stride)} bend={6} sleeve={khaki} cuff={khakiDark} />
      <Arm x={54} y={-292} side={1} swing={armSwing(armR, stride)} bend={elbowR} sleeve={khaki} cuff={khakiDark}>
        <Stick />
      </Arm>
    </g>
  </g>
)
