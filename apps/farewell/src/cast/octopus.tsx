import { type Place, placed } from "../paper"
import { ink } from "../theme"
import { Tentacle } from "./parts"

const pink = "#ec4f97"
const pinkLight = "#f8a9cd"
const brow = "#3a1426"

// A cymbal seen at an angle, `side` tipping it toward its partner.
const Cymbal = ({ x, y, side }: { x: number; y: number; side: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${side * -35})`}>
    <ellipse rx="32" ry="11" fill="#e9b949" stroke={ink} strokeWidth="2.5" />
    <ellipse rx="20" ry="6" fill="none" stroke="#b78a2a" strokeWidth="1.5" />
    <ellipse cy="-3" rx="8" ry="5" fill="#f7d774" stroke={ink} strokeWidth="1.5" />
    <path d="M-4,-7 Q0,-16 4,-7" stroke="#5a3818" strokeWidth="3" fill="none" />
  </g>
)

// A snare drum with a stick resting on it.
const Drum = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M-30,0 V30 A30,9 0 0 0 30,30 V0 Z" fill="#c62828" stroke={ink} strokeWidth="2.5" />
    <path d="M-30,8 L-18,30 L-6,8 L6,30 L18,8 L30,30" stroke="#f4e3b0" strokeWidth="2" fill="none" />
    <ellipse rx="30" ry="9" fill="#f7f1e4" stroke={ink} strokeWidth="2.5" />
  </g>
)

// A violin held by its neck, the body hanging below.
const Violin = () => (
  <g transform="rotate(-22)">
    <circle cy="-8" r="7" fill="#5a2e14" stroke={ink} strokeWidth="2" />
    <rect x="-5" y="-2" width="10" height="56" fill="#2b1a10" stroke={ink} strokeWidth="2" />
    <path
      d="M0,50 C-28,50 -32,70 -23,82 C-32,92 -36,110 -27,126 C-18,142 18,142 27,126 C36,110 32,92 23,82 C32,70 28,50 0,50 Z"
      fill="#a0522d"
      stroke={ink}
      strokeWidth="2.5"
    />
    <path d="M-12,92 Q-6,100 -12,110 M12,92 Q6,100 12,110" stroke={ink} strokeWidth="2" fill="none" />
    <path d="M-3,0 V128 M3,0 V128" stroke="#e8dcc0" strokeWidth="1.2" />
    <rect x="-9" y="104" width="18" height="4" fill="#e8dcc0" stroke={ink} strokeWidth="1" />
    <path d="M-6,118 L6,118 L4,134 L-4,134 Z" fill="#2b1a10" />
  </g>
)

// The Pink Octopus: the whole orchestra pit, eight arms and as many instruments, `baton` the conducting swing in degrees.
export const Octopus = ({
  instruments = true,
  baton = 0,
  look = { x: 0, y: -0.2 },
  ...place
}: Place & { instruments?: boolean; baton?: number; look?: { x: number; y: number } }) => (
  <g transform={placed(place)}>
    {[-48, -17, 17, 48].map((x) => {
      const out = x < 0 ? -1 : 1
      return (
        <Tentacle
          key={x}
          from={26}
          to={6}
          fill={pink}
          suckers={pinkLight}
          curves={[
            [
              { x, y: -108 },
              { x, y: -64 },
              { x: x + out * 30, y: -50 },
              { x: x + out * 24, y: -18 }
            ],
            [
              { x: x + out * 24, y: -18 },
              { x: x + out * 20, y: -2 },
              { x: x + out * 46, y: 0 },
              { x: x + out * 42, y: -14 }
            ]
          ]}
        />
      )
    })}
    {instruments ? (
      <g>
        {[-1, 1].map((side) => (
          <Tentacle
            key={side}
            from={22}
            to={9}
            fill={pink}
            suckers={pinkLight}
            curves={[
              [
                { x: side * 64, y: -130 },
                { x: side * 104, y: -140 },
                { x: side * 136, y: -176 },
                { x: side * 126, y: -232 }
              ]
            ]}
          />
        ))}
        <Tentacle
          from={22}
          to={9}
          fill={pink}
          suckers={pinkLight}
          curves={[
            [
              { x: -74, y: -106 },
              { x: -122, y: -108 },
              { x: -152, y: -128 },
              { x: -160, y: -160 }
            ]
          ]}
        />
        <Cymbal x={-164} y={-176} side={-1} />
        <Drum x={176} y={-44} />
        <Tentacle
          from={22}
          to={9}
          fill={pink}
          suckers={pinkLight}
          curves={[
            [
              { x: 74, y: -106 },
              { x: 118, y: -104 },
              { x: 146, y: -86 },
              { x: 150, y: -60 }
            ]
          ]}
        />
        <path d="M150,-62 L190,-50" stroke={ink} strokeWidth="7" strokeLinecap="round" />
        <path d="M150,-62 L190,-50" stroke="#d9b07a" strokeWidth="3.5" strokeLinecap="round" />
        <g transform={`rotate(${baton} -126 -236)`}>
          <path d="M-126,-236 L-160,-304" stroke={ink} strokeWidth="9" strokeLinecap="round" />
          <path d="M-126,-236 L-160,-304" stroke="#fffaf0" strokeWidth="5" strokeLinecap="round" />
        </g>
        <g transform="translate(126 -240)">
          <Violin />
        </g>
      </g>
    ) : null}
    <path
      d="M0,-262 C76,-262 102,-206 98,-154 C94,-110 62,-92 0,-92 C-62,-92 -94,-110 -98,-154 C-102,-206 -76,-262 0,-262 Z"
      fill={pink}
      stroke={ink}
      strokeWidth="3"
    />
    <ellipse cx="-42" cy="-222" rx="26" ry="14" transform="rotate(-25 -42 -222)" fill="#fff" opacity="0.35" />
    {[
      { x: -32, y: -170 },
      { x: 30, y: -172 }
    ].map(({ x, y }) => (
      <g key={x}>
        <ellipse cx={x} cy={y} rx="24" ry="28" fill="#fff" stroke={ink} strokeWidth="3" />
        <circle cx={x + look.x * 9} cy={y + 4 + look.y * 9} r="11" fill={ink} />
        <circle cx={x + look.x * 9 - 4} cy={y + look.y * 9} r="3.5" fill="#fff" />
      </g>
    ))}
    <path
      d="M-56,-212 Q-34,-226 -12,-210 M12,-212 Q34,-228 56,-214"
      stroke={brow}
      strokeWidth="8"
      strokeLinecap="round"
      fill="none"
    />
    <circle cx="-62" cy="-134" r="11" fill="#ff7fb0" />
    <circle cx="62" cy="-134" r="11" fill="#ff7fb0" />
    <path d="M-26,-134 Q0,-96 26,-134 Z" fill="#7a1430" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
    <ellipse cx="0" cy="-114" rx="11" ry="6" fill="#ff8fa8" />
  </g>
)
