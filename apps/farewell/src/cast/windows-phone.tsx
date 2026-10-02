import { type Place, placed } from "../paper"
import { font, ink } from "../theme"
import { Glove } from "./parts"

const body = "#19aee6"

// A rubber-hose limb: one black line from (0, 0) along +y, with a glove or a shoe at the end.
const Hose = ({
  x,
  y,
  swing,
  length,
  end
}: {
  x: number
  y: number
  swing: number
  length: number
  end: "glove" | "shoe"
}) => (
  <g transform={`translate(${x} ${y}) rotate(${swing})`}>
    <path
      d={`M0,0 Q${length * 0.12},${length / 2} 0,${length}`}
      stroke={ink}
      strokeWidth="7"
      fill="none"
      strokeLinecap="round"
    />
    {end === "glove" ? (
      <g transform={`translate(0 ${length + 2}) scale(0.85)`}>
        <Glove />
      </g>
    ) : (
      <path
        d={`M-12,${length - 4} Q-14,${length + 10} 0,${length + 10} L22,${length + 10} Q30,${length + 4} 16,${length - 2} Z`}
        fill="#fff"
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    )}
  </g>
)

type Face = "smile" | "o" | "grin"

// Windows Phone, live tiles still flipping, insisting to anyone who'll listen that it isn't dead yet.
export const WindowsPhone = ({
  armL = 25,
  armR = 25,
  legL = 6,
  legR = 6,
  face = "smile",
  look = { x: 0, y: 0 },
  ...place
}: Place & {
  armL?: number
  armR?: number
  legL?: number
  legR?: number
  face?: Face
  look?: { x: number; y: number }
}) => (
  <g transform={placed(place)}>
    <Hose x={-26} y={-84} swing={legL} length={66} end="shoe" />
    <g transform="scale(-1 1)">
      <Hose x={-26} y={-84} swing={legR} length={66} end="shoe" />
    </g>
    <Hose x={-60} y={-206} swing={armL} length={64} end="glove" />
    <g transform="scale(-1 1)">
      <Hose x={-60} y={-206} swing={armR} length={64} end="glove" />
    </g>
    <rect x="-64" y="-304" width="128" height="224" rx="18" fill={body} stroke={ink} strokeWidth="3.5" />
    <path d="M40,-300 Q62,-298 62,-276 V-106 Q62,-84 40,-84 Z" fill="url(#hatch)" opacity="0.3" />
    <rect x="-53" y="-286" width="106" height="176" rx="3" fill="#0c0c12" stroke={ink} strokeWidth="2" />
    <rect x="-15" y="-297" width="30" height="4" rx="2" fill="#0b4b66" />
    <circle cx="26" cy="-295" r="2.6" fill="#0b4b66" />
    {[-22, 22].map((ex) => (
      <g key={ex}>
        <ellipse cx={ex} cy="-252" rx="12" ry="14" fill="#fff" />
        <circle cx={ex + look.x * 5} cy={-250 + look.y * 5} r="6" fill={ink} />
        <circle cx={ex + look.x * 5 - 2} cy={-252 + look.y * 5} r="1.8" fill="#fff" />
      </g>
    ))}
    {face === "o" ? <ellipse cx="0" cy="-224" rx="8" ry="9" fill="#5a1414" stroke="#fff" strokeWidth="2.5" /> : null}
    {face === "smile" ? (
      <path d="M-12,-230 Q0,-218 12,-230" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
    ) : null}
    {face === "grin" ? (
      <path d="M-15,-232 Q0,-212 15,-232 Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    ) : null}
    <rect x="-48" y="-206" width="54" height="38" fill="#00a300" />
    <path
      d="M-36,-196 H-6 V-178 H-36 Z M-36,-196 L-21,-185 L-6,-196"
      stroke="#fff"
      strokeWidth="2.2"
      fill="none"
      strokeLinejoin="round"
    />
    <rect x="10" y="-206" width="38" height="38" fill="#f09609" />
    <text x="29" y="-179" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="17" fill="#fff">
      31
    </text>
    <rect x="-48" y="-164" width="38" height="38" fill="#e3008c" />
    <path d="M-29,-136 Q-42,-146 -40,-153 Q-38,-160 -29,-152 Q-20,-160 -18,-153 Q-16,-146 -29,-136 Z" fill="#fff" />
    <rect x="-6" y="-164" width="54" height="38" fill="#2d89ef" />
    <rect x="9" y="-155" width="22" height="16" rx="3" fill="none" stroke="#fff" strokeWidth="2.2" />
    <circle cx="20" cy="-147" r="4.5" fill="none" stroke="#fff" strokeWidth="2.2" />
    <path
      d="M-40,-96 L-30,-102 M-40,-96 L-30,-90 M-40,-96 H-26"
      stroke="#e6f7ff"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M-7,-103 L-1,-104 V-97 H-7 Z M1,-104 L7,-105 V-97 H1 Z M-7,-95 H-1 V-88 L-7,-89 Z M1,-95 H7 V-87 L1,-88 Z"
      fill="#e6f7ff"
    />
    <circle cx="31" cy="-97" r="5" fill="none" stroke="#e6f7ff" strokeWidth="2.2" />
    <path d="M34.5,-93.5 L39,-89" stroke="#e6f7ff" strokeWidth="2.4" strokeLinecap="round" />
  </g>
)
