import type { ReactNode } from "react"
import { type Place, placed } from "../paper"
import { gold, ink } from "../theme"
import { type Bend, onLegs, type Stride } from "../walk"
import { Leg } from "./parts"

const rainbow = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa"] as const
const costume = "#fbf6ec"

// Each performer's legs, side on and facing the head.
export const unicornLegs = onLegs(118, 20, 110)

// The cat that rides the unicorn: black, in a red headband, katana slung across its back.
export const NinjaCat = ({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M24,-8 Q60,-10 58,-46 Q56,-62 44,-58" stroke={ink} strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="M24,-8 Q60,-10 58,-46 Q56,-62 44,-58" stroke="#1d1d22" strokeWidth="5" fill="none" strokeLinecap="round" />
    <line x1="-26" y1="-96" x2="18" y2="-40" stroke="#6b4a2a" strokeWidth="6" strokeLinecap="round" />
    <line x1="-30" y1="-101" x2="-22" y2="-91" stroke={ink} strokeWidth="7" strokeLinecap="round" />
    <path d="M-30,0 Q-38,-40 -18,-62 Q0,-72 18,-62 Q38,-40 30,0 Z" fill="#1d1d22" stroke={ink} strokeWidth="3" />
    <path d="M14,-46 Q40,-44 52,-30" stroke="#1d1d22" strokeWidth="13" strokeLinecap="round" fill="none" />
    <circle cx="54" cy="-28" r="8" fill="#1d1d22" stroke={ink} strokeWidth="2.5" />
    <path
      d="M-24,-96 L-20,-128 L-4,-104 Z M24,-96 L20,-128 L4,-104 Z"
      fill="#1d1d22"
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <circle cx="0" cy="-86" r="27" fill="#1d1d22" stroke={ink} strokeWidth="3" />
    <path d="M-28,-96 Q0,-104 28,-96 L28,-84 Q0,-92 -28,-84 Z" fill="#d32f2f" stroke={ink} strokeWidth="2" />
    <path
      d="M-26,-92 Q-50,-100 -62,-86 Q-48,-90 -40,-80 Q-42,-92 -26,-88 Z"
      fill="#d32f2f"
      stroke={ink}
      strokeWidth="2"
    />
    {[-11, 11].map((ex) => (
      <g key={ex}>
        <ellipse cx={ex} cy="-78" rx="8" ry="7" fill="#ffd54f" stroke={ink} strokeWidth="1.5" />
        <ellipse cx={ex + 1} cy="-78" rx="2" ry="6" fill={ink} />
      </g>
    ))}
    <path d="M-4,-66 L4,-66 L0,-62 Z" fill="#f48fb1" />
    <path d="M-30,-66 L-12,-64 M-30,-60 L-12,-62 M30,-66 L12,-64 M30,-60 L12,-62" stroke="#9e9e9e" strokeWidth="1.2" />
  </g>
)

type UnicornProps = Place & {
  // Kick of the front and back performers' legs, in degrees.
  front?: number
  back?: number
  // Or each performer walking, from `walk`, in its own frame.
  strides?: { front: Stride; back: Stride }
  rider?: boolean
  // Something held in the mouth, drawn about the teeth: a banner, say.
  carrying?: ReactNode
}

// The unicorn: a pantomime costume with two performers inside, their mismatched trousers showing underneath.
export const Unicorn = ({ front = 0, back = 0, strides, rider = true, carrying, ...place }: UnicornProps) => (
  <g transform={placed(place)}>
    <defs>
      <pattern id="stripes" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#2b4b8c" />
        <rect width="4" height="10" fill="#e8edf6" />
      </pattern>
      <pattern id="tartan" width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill="#9e2b25" />
        <rect y="8" width="24" height="5" fill="#1f4d2e" opacity="0.85" />
        <rect x="8" width="5" height="24" fill="#1f4d2e" opacity="0.85" />
        <rect y="18" width="24" height="1.5" fill="#f2d16b" />
        <rect x="18" width="1.5" height="24" fill="#f2d16b" />
      </pattern>
    </defs>
    {[
      { middle: -104, kick: back, stride: strides?.back, trousers: "url(#tartan)", shoe: "#5d3b1e" },
      { middle: 96, kick: front, stride: strides?.front, trousers: "url(#stripes)", shoe: "#16120f" }
    ].flatMap(({ middle, kick, stride, trousers, shoe }) => {
      const bends: Bend[] = stride
        ? [stride.left, stride.right]
        : [
            { hip: -unicornLegs.spread, facing: 1, swing: kick * 0.6, knee: 0, ankle: 0 },
            { hip: unicornLegs.spread, facing: 1, swing: kick, knee: 0, ankle: 0 }
          ]
      return bends.map((leg) => (
        <Leg
          key={`${middle}${leg.hip < 0 ? "back" : "front"}`}
          x={middle + leg.hip}
          y={-unicornLegs.hip}
          swing={leg.swing}
          knee={leg.knee}
          ankle={leg.ankle}
          facing={leg.facing}
          trousers={trousers}
          shoe={shoe}
          length={2 * unicornLegs.bone + 12}
        />
      ))
    })}
    {rainbow.map((color, i) => (
      <path
        key={color}
        d={`M${-160 - i * 4},${-200 + i * 3} Q${-214 - i * 6},${-186 + i * 4} ${-218 - i * 3},${-112 + i * 6}`}
        stroke={color}
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
    ))}
    <path
      d="M-162,-182 Q-172,-248 -80,-258 Q30,-268 122,-250 Q174,-234 168,-178 Q162,-120 82,-112 L-112,-110 Q-168,-118 -162,-182 Z"
      fill={costume}
      stroke={ink}
      strokeWidth="3"
    />
    <path d="M-160,-150 Q0,-122 166,-152 L156,-118 Q0,-102 -156,-120 Z" fill="url(#hatch)" opacity="0.25" />
    <path
      d="M-156,-118 Q-140,-104 -124,-116 Q-108,-102 -92,-114 Q-76,-100 -60,-112 M54,-112 Q70,-100 86,-114 Q102,-102 118,-116 Q134,-104 150,-120"
      stroke={ink}
      strokeWidth="2.5"
      fill="none"
    />
    <path d="M-4,-262 Q8,-190 -2,-110" stroke={ink} strokeWidth="2.5" strokeDasharray="6 5" fill="none" />
    <path
      d="M96,-246 Q122,-312 170,-354 L216,-320 Q180,-284 164,-220 Z"
      fill={costume}
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    {rainbow.map((color, i) => (
      <path
        key={color}
        d={`M${192 - i * 7},${-396 + i * 4} Q${150 - i * 7},${-364 + i * 4} ${140 - i * 7},${-322 + i * 4} Q${130 - i * 7},${-290 + i * 4} ${104 - i * 6},${-250 + i * 3}`}
        stroke={color}
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
    ))}
    <path
      d="M160,-352 Q170,-394 214,-402 Q262,-406 292,-368 Q308,-342 292,-322 Q268,-308 232,-314 Q208,-300 194,-286 Q176,-302 160,-352 Z"
      fill={costume}
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path
      d="M190,-396 L178,-432 L206,-404 Z M206,-402 L204,-440 L224,-406 Z"
      fill={costume}
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path d="M222,-402 L262,-478 L246,-398 Z" fill={gold.base} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
    {[0.25, 0.45, 0.62, 0.78].map((k) => (
      <line
        key={k}
        x1={222 + 40 * k}
        y1={-402 - 76 * k}
        x2={246 + 16 * k}
        y2={-398 - 80 * k}
        stroke={gold.deep}
        strokeWidth="2.5"
      />
    ))}
    {rainbow.slice(0, 4).map((color, i) => (
      <path
        key={color}
        d={`M${204 + i * 6},${-404} Q${214 + i * 7},${-384} ${206 + i * 9},${-372}`}
        stroke={color}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
    ))}
    <ellipse cx="282" cy="-338" rx="21" ry="17" fill="#f6d3cc" stroke={ink} strokeWidth="2.5" />
    <ellipse cx="292" cy="-344" rx="3" ry="5" fill={ink} />
    <path d="M258,-318 Q278,-310 296,-326" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
    <rect x="268" y="-318" width="9" height="11" fill="#fff" stroke={ink} strokeWidth="2" />
    <rect x="277" y="-319" width="9" height="11" fill="#fff" stroke={ink} strokeWidth="2" />
    <circle cx="228" cy="-366" r="14" fill="#fff" stroke={ink} strokeWidth="3" />
    <circle cx="234" cy="-362" r="6.5" fill={ink} />
    <path
      d="M216,-378 L210,-388 M224,-381 L222,-392 M232,-381 L234,-392"
      stroke={ink}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {carrying ? <g transform="translate(276 -312)">{carrying}</g> : null}
    {rider ? <NinjaCat x={-40} y={-252} scale={0.95} /> : null}
  </g>
)
