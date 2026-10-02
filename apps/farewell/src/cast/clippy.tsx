import { type Place, placed } from "../paper"
import { gold, ink } from "../theme"
import { type Mouth, MouthShape } from "./parts"

// One bent wire: in at the middle, round the small top loop, down, round the bottom, up and over the big loop.
const wire =
  "M12,-140 L12,-262 A17,17 0 0 0 -22,-262 L-22,-38 A28,28 0 0 0 34,-38 L34,-282 A40,40 0 0 0 -46,-282 L-46,-96"

const Wings = () => (
  <g fill="#fffaf0" stroke={ink} strokeWidth="2.5" strokeLinejoin="round">
    <path d="M-40,-200 Q-110,-250 -128,-190 Q-112,-196 -108,-178 Q-96,-186 -88,-168 Q-76,-178 -64,-160 Q-54,-176 -40,-170 Z" />
    <path d="M28,-206 Q98,-256 116,-196 Q100,-202 96,-184 Q84,-192 76,-174 Q64,-184 52,-166 Q42,-182 28,-176 Z" />
  </g>
)

type ClippyProps = Place & {
  hat?: boolean
  bowtie?: boolean
  // Wings, a halo and a singing mouth, for the choir in the boxes.
  cherub?: boolean
  // -1 knits the brows, 1 raises them right up.
  brows?: number
  look?: { x: number; y: number }
  mouth?: Mouth
  // Knocked silly: spirals for eyes, and the halo knocked askew.
  dazed?: boolean
}

// Clippy, the house's compère: a paper clip with a great deal to say about what it looks like you're doing.
export const Clippy = ({
  hat,
  bowtie,
  cherub,
  brows = 0.3,
  look = { x: 0.2, y: 0.1 },
  mouth,
  dazed,
  ...place
}: ClippyProps) => {
  const lift = -brows * 7
  return (
    <g transform={placed(place)}>
      {cherub ? <Wings /> : null}
      <path d={wire} fill="none" stroke="#2c3036" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={wire}
        fill="none"
        stroke="url(#silverWire)"
        strokeWidth="10.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={wire}
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.7"
        transform="translate(-2.6 -1.4)"
      />
      {[
        { x: -34, y: -214 },
        { x: 14, y: -219 }
      ].map(({ x, y }) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <ellipse rx="18" ry="22" fill="#fff" stroke={ink} strokeWidth="3" />
          {dazed ? (
            <path
              d="M0,2 a2,2 0 1 1 4,0 a5,5 0 1 1 -10,0 a8,8 0 1 1 16,0 a11,11 0 1 1 -22,0"
              fill="none"
              stroke={ink}
              strokeWidth="2.4"
            />
          ) : (
            <g>
              <circle cx={look.x * 8} cy={look.y * 9 + 2} r="8.5" fill={ink} />
              <circle cx={look.x * 8 - 3} cy={look.y * 9 - 1.5} r="2.6" fill="#fff" />
            </g>
          )}
        </g>
      ))}
      <g transform={`translate(0 ${lift})`}>
        <path d="M-55,-246 Q-38,-262 -18,-249" stroke={ink} strokeWidth="7" strokeLinecap="round" fill="none" />
        <path d="M-3,-254 Q14,-268 33,-255" stroke={ink} strokeWidth="7" strokeLinecap="round" fill="none" />
      </g>
      {mouth ? <MouthShape x={-8} y={-176} mouth={mouth} size={1.1} /> : null}
      {bowtie ? (
        <g transform="translate(-6 -150)">
          <path
            d="M0,0 L-22,-12 L-22,12 Z M0,0 L22,-12 L22,12 Z"
            fill="#b3202a"
            stroke={ink}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <circle r="5" fill="#b3202a" stroke={ink} strokeWidth="2" />
        </g>
      ) : null}
      {hat ? (
        <g transform="rotate(-12 -6 -322)">
          <path
            d="M-27,-320 L-22,-392 L22,-392 L27,-320 Z"
            fill="#1e1b1b"
            stroke={ink}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <rect x="-26" y="-338" width="52" height="12" fill="#a3262a" />
          <ellipse cx="0" cy="-320" rx="44" ry="8" fill="#1e1b1b" stroke={ink} strokeWidth="3" />
          <path d="M-14,-384 L-17,-346" stroke="#fff" strokeWidth="3" opacity="0.3" strokeLinecap="round" />
        </g>
      ) : null}
      {cherub ? (
        <ellipse
          cx="-6"
          cy="-344"
          rx="32"
          ry="8"
          fill="none"
          stroke={gold.light}
          strokeWidth="6"
          transform={dazed ? "translate(16 34) rotate(-24 -6 -344)" : undefined}
        />
      ) : null}
    </g>
  )
}
