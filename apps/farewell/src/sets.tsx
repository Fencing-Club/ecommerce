import type { ReactNode } from "react"
import { random } from "remotion"
import { Marquee, Sunburst } from "./props"
import { font, gold, ink, paper, wood } from "./theme"

// The backcloths and flats the scenes are played in front of. Each fills the stage opening down to the floor.

// A painted cloud cut-out hung on two wires.
export const Cloud = ({ x, y, scale = 1, label }: { x: number; y: number; scale?: number; label?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M-80,-90 V-900 M80,-90 V-900" stroke={ink} strokeWidth="1.5" opacity="0.5" />
    <g filter="url(#cut)" fill="#fffdf4" stroke={ink} strokeWidth="3">
      <circle cx="-120" cy="0" r="62" />
      <circle cx="-44" cy="-42" r="84" />
      <circle cx="58" cy="-34" r="76" />
      <circle cx="138" cy="6" r="56" />
      <rect x="-170" y="0" width="350" height="56" rx="28" />
    </g>
    <path d="M-150,10 H160" stroke="#fffdf4" strokeWidth="40" />
    {label ? (
      <g transform="translate(0 30) rotate(-3)">
        <rect x="-86" y="-22" width="172" height="40" fill={paper.light} stroke={ink} strokeWidth="2.5" />
        <text y="8" textAnchor="middle" fontFamily={font.caps} fontSize="22" letterSpacing="3" fill={ink}>
          {label}
        </text>
      </g>
    ) : null}
  </g>
)

// A painted cloud bank along the foot of a backdrop.
export const Clouds = ({ y, color = "#fff6e2" }: { y: number; color?: string }) => (
  <g fill={color} stroke={ink} strokeWidth="3">
    {[150, 300, 450, 600, 750, 900, 1050, 1200, 1350, 1500, 1650, 1800].map((x, i) => (
      <circle key={x} cx={x} cy={y + (i % 2) * 24} r={70 + (i % 3) * 16} />
    ))}
    <rect x="100" y={y + 20} width="1760" height="120" stroke="none" />
  </g>
)

// Blue sky, lighter toward the horizon.
export const Sky = ({ children }: { children?: ReactNode }) => (
  <g>
    <defs>
      <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#8fc8ec" />
        <stop offset="1" stopColor="#e9f5fb" />
      </linearGradient>
    </defs>
    <rect x="150" y="130" width="1620" height="660" fill="url(#sky)" />
    {children}
  </g>
)

const stars = Array.from({ length: 46 }, (_, i) => ({
  x: 170 + random(`starx${i}`) * 1580,
  y: 150 + random(`stary${i}`) * 480,
  r: 1.5 + random(`starr${i}`) * 2.5,
  phase: random(`starp${i}`) * 6
}))

// Night: deep blue with pricked-out stars, twinkling.
export const NightSky = ({ t }: { t: number }) => (
  <g>
    <defs>
      <linearGradient id="night" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#070d26" />
        <stop offset="1" stopColor="#26325e" />
      </linearGradient>
    </defs>
    <rect x="150" y="130" width="1620" height="660" fill="url(#night)" />
    {stars.map(({ x, y, r, phase }) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff8d8" opacity={0.55 + 0.45 * Math.sin(t * 3 + phase)} />
    ))}
  </g>
)

// The chorus cloth: the painted sunburst, a cloud bank, and the SO LONG marquee.
export const ChorusCloth = ({ text = "SO LONG" }: { text?: string }) => (
  <g>
    <Sunburst cx={960} cy={780} />
    <Clouds y={730} />
    <Marquee x={590} y={262} width={740} height={136} text={text} />
  </g>
)

// Heaven, as the Theatre Royal paints it: the clouds drawn back either side by `open` and the light pouring through.
export const Heaven = ({ open }: { open: number }) => (
  <g>
    <defs>
      <linearGradient id="heaven" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff1c4" />
        <stop offset="1" stopColor="#cfe6f3" />
      </linearGradient>
    </defs>
    <rect x="150" y="130" width="1620" height="660" fill="url(#heaven)" />
    <g opacity={open}>
      <Sunburst cx={960} cy={140} rays={36} colors={["#fff8de", "#f6dfa0"]} />
    </g>
    {[-1, 1].map((side) => (
      <g key={side} transform={`translate(${side * 520 * open} 0)`} fill="#fffaf0" stroke={ink} strokeWidth="3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle
            key={i}
            cx={960 + side * (60 + i * 110)}
            cy={200 + (i % 2) * 60 + Math.abs(i - 2) * 10}
            r={96 + (i % 3) * 22}
          />
        ))}
      </g>
    ))}
    <Clouds y={760} />
  </g>
)

// Rome: a temple front with its inscription, each word lit by how much it's been pointed at.
export const Rome = ({ lit }: { lit: readonly [number, number, number] }) => (
  <g>
    <rect x="150" y="130" width="1620" height="660" fill="#f0c98a" />
    <rect x="150" y="130" width="1620" height="660" fill="url(#hatch)" opacity="0.06" />
    <g filter="url(#cut)">
      <path d="M520,250 L960,140 L1400,250 Z" fill="#f4ecdc" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      <path d="M600,236 L960,158 L1320,236 Z" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="500" y="250" width="920" height="96" fill="#f4ecdc" stroke={ink} strokeWidth="4" />
      {["VENI,", "CODI,", "SHIPPI"].map((word, i) => (
        <text
          key={word}
          x={680 + i * 280}
          y="318"
          textAnchor="middle"
          fontFamily={font.title}
          fontSize="58"
          letterSpacing="6"
          fill={lit[i] > 0.5 ? gold.dark : "#6d6455"}
        >
          {word}
        </text>
      ))}
      {[560, 700, 840, 1080, 1220, 1360].map((x) => (
        <g key={x}>
          <rect x={x - 34} y="346" width="68" height="370" fill="#f8f2e6" stroke={ink} strokeWidth="3" />
          {[-18, -6, 6, 18].map((dx) => (
            <path key={dx} d={`M${x + dx},356 V706`} stroke="#d8ccb2" strokeWidth="3" />
          ))}
          <rect x={x - 44} y="346" width="88" height="20" fill="#f4ecdc" stroke={ink} strokeWidth="3" />
          <rect x={x - 44} y="706" width="88" height="20" fill="#f4ecdc" stroke={ink} strokeWidth="3" />
        </g>
      ))}
      <rect x="470" y="726" width="980" height="24" fill="#efe5d0" stroke={ink} strokeWidth="3" />
      <rect x="440" y="750" width="1040" height="30" fill="#e6dbc4" stroke={ink} strokeWidth="3" />
    </g>
    {lit.map((amount, i) => (
      <ellipse
        key={i}
        cx={680 + i * 280}
        cy="300"
        rx="130"
        ry="46"
        fill="url(#spotlight)"
        opacity={amount}
        style={{ mixBlendMode: "screen" }}
      />
    ))}
  </g>
)

// One row of painted sea on its crank, rocking from side to side.
export const WaveRow = ({ t, y, phase, color }: { t: number; y: number; phase: number; color: string }) => {
  const shift = Math.sin(t * 2.4 + phase) * 26
  const crests = Array.from({ length: 20 }, (_, i) => 60 + i * 100)
  const top = crests.map(
    (x) => `Q${x + 25 + shift},${y - 46} ${x + 50 + shift},${y} Q${x + 75 + shift},${y + 10} ${x + 100 + shift},${y}`
  )
  return (
    <path
      d={`M${60 + shift},${y} ${top.join(" ")} V${y + 220} H${60 + shift} Z`}
      fill={color}
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
      filter="url(#cut)"
    />
  )
}

// The backlog dungeon: stone walls, chains, and torches guttering in brackets.
export const Dungeon = ({ t }: { t: number }) => (
  <g>
    <rect x="150" y="130" width="1620" height="660" fill="#4a3e34" />
    {Array.from({ length: 12 }, (_, row) =>
      Array.from({ length: 15 }, (_, col) => (
        <rect
          key={`${row}-${col}`}
          x={150 + col * 116 - (row % 2) * 58}
          y={130 + row * 56}
          width="112"
          height="52"
          rx="8"
          fill="#64544a"
          stroke="#2e241c"
          strokeWidth="3"
        />
      ))
    )}
    {[620, 1300].map((x, i) => {
      const flicker = 1 + Math.sin(t * 13 + i * 2) * 0.12 + Math.sin(t * 29 + i) * 0.06
      return (
        <g key={x}>
          <circle cx={x} cy="330" r={140 * flicker} fill="#ffb347" opacity="0.18" />
          <path
            d={`M${x - 10},400 L${x + 10},400 L${x + 6},350 L${x - 6},350 Z`}
            fill={wood.dark}
            stroke={ink}
            strokeWidth="2.5"
          />
          <path
            d={`M${x},${348 - 40 * flicker} Q${x + 18},330 ${x + 10},350 Q${x},356 ${x - 10},350 Q${x - 18},330 ${x},${348 - 40 * flicker} Z`}
            fill="#ffcf4a"
            stroke="#e0661a"
            strokeWidth="3"
          />
        </g>
      )
    })}
    {[700, 1220].map((x) => (
      <path
        key={x}
        d={`M${x},130 ${Array.from({ length: 9 }, (_, i) => `M${x - 8},${150 + i * 26} a8,13 0 1 0 16,0 a8,13 0 1 0 -16,0`).join(" ")}`}
        fill="none"
        stroke="#6a6a70"
        strokeWidth="4"
      />
    ))}
  </g>
)

// Sunset: the sky banded down to gold, and the sun half under the horizon.
export const Sunset = ({ sink = 0 }: { sink?: number }) => (
  <g>
    <defs>
      <linearGradient id="sunset" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#3b2a63" />
        <stop offset="0.45" stopColor="#c8506a" />
        <stop offset="0.75" stopColor="#f39a4b" />
        <stop offset="1" stopColor="#ffd98a" />
      </linearGradient>
    </defs>
    <rect x="150" y="130" width="1620" height="660" fill="url(#sunset)" />
    <circle cx="960" cy={640 + sink * 120} r="150" fill="#ffe7a3" stroke={ink} strokeWidth="3" opacity="0.95" />
    <path
      d="M150,640 Q400,600 700,640 T1250,630 T1770,640 V790 H150 Z"
      fill="#5a3a5e"
      stroke={ink}
      strokeWidth="3"
      filter="url(#cut)"
    />
    <path d="M150,700 Q520,670 900,700 T1770,690 V790 H150 Z" fill="#3c2744" stroke={ink} strokeWidth="3" />
  </g>
)

// The laboratory flat: stone blocks, an arched window on a stormy night, shelves of glowing jars.
export const Laboratory = () => (
  <g>
    <rect x="150" y="130" width="1620" height="660" fill="#34333d" />
    {Array.from({ length: 12 }, (_, row) =>
      Array.from({ length: 15 }, (_, col) => (
        <rect
          key={`${row}-${col}`}
          x={150 + col * 116 - (row % 2) * 58}
          y={130 + row * 56}
          width="112"
          height="52"
          fill="#3f3e49"
          stroke="#26252d"
          strokeWidth="3"
        />
      ))
    )}
    <path d="M820,560 V300 Q960,170 1100,300 V560 Z" fill="#1a2140" stroke={ink} strokeWidth="6" />
    <path d="M960,190 V560 M820,420 H1100" stroke={ink} strokeWidth="6" />
    <path d="M900,250 L960,330 L930,340 L1000,440" stroke="#e8f6ff" strokeWidth="5" fill="none" />
    {[
      { x: 520, color: "#7cff8a" },
      { x: 568, color: "#5fd4ff" },
      { x: 1352, color: "#ff8af0" },
      { x: 1400, color: "#7cff8a" }
    ].map(({ x, color }) => (
      <g key={x}>
        <rect
          x={x - 14}
          y="420"
          width="28"
          height="46"
          rx="6"
          fill={color}
          opacity="0.75"
          stroke={ink}
          strokeWidth="2.5"
        />
        <circle cx={x} cy="443" r="22" fill={color} opacity="0.18" />
      </g>
    ))}
    <rect x="474" y="466" width="140" height="12" fill="#5a3818" stroke={ink} strokeWidth="2" />
    <rect x="1306" y="466" width="140" height="12" fill="#5a3818" stroke={ink} strokeWidth="2" />
  </g>
)

// The office wall flat: striped paper over panelling, a sampler and a clock whose hands turn by `clock` hours.
export const Boardroom = ({ clock = 0 }: { clock?: number }) => (
  <g>
    <rect x="150" y="130" width="1620" height="660" fill="#5d6b4f" />
    {Array.from({ length: 28 }, (_, i) => 150 + i * 60).map((x) => (
      <rect key={x} x={x} y="130" width="26" height="660" fill="#6d7b5d" />
    ))}
    <rect x="150" y="600" width="1620" height="190" fill={wood.base} stroke={ink} strokeWidth="3" />
    {Array.from({ length: 9 }, (_, i) => 180 + i * 180).map((x) => (
      <rect
        key={x}
        x={x}
        y="624"
        width="150"
        height="132"
        fill={wood.dark}
        stroke={ink}
        strokeWidth="2"
        opacity="0.6"
      />
    ))}
    <g transform="translate(1590 330)" filter="url(#cut)">
      <circle r="78" fill={paper.light} stroke={wood.deep} strokeWidth="12" />
      {Array.from({ length: 12 }, (_, i) => i * 30).map((angle) => (
        <line key={angle} x1="0" y1="-62" x2="0" y2="-52" stroke={ink} strokeWidth="4" transform={`rotate(${angle})`} />
      ))}
      <line
        x1="0"
        y1="0"
        x2="0"
        y2="-46"
        stroke={ink}
        strokeWidth="6"
        strokeLinecap="round"
        transform={`rotate(${-8 + clock * 30})`}
      />
      <line
        x1="0"
        y1="0"
        x2="0"
        y2="-60"
        stroke="#b3191f"
        strokeWidth="3.5"
        strokeLinecap="round"
        transform={`rotate(${-14 + clock * 360})`}
      />
      <circle r="6" fill={ink} />
    </g>
    <g transform="translate(330 330)" filter="url(#cut)">
      <rect x="-110" y="-80" width="220" height="160" fill={wood.dark} stroke={ink} strokeWidth="3" />
      <rect x="-94" y="-64" width="188" height="128" fill="#f3ead2" />
      <rect x="-94" y="-64" width="188" height="128" fill="url(#crosshatch)" opacity="0.08" />
      <text y="-12" textAnchor="middle" fontFamily={font.typewriter} fontSize="25" fill="#7b2a2a">
        GROWTH
      </text>
      <text y="26" textAnchor="middle" fontFamily={font.typewriter} fontSize="25" fill="#7b2a2a">
        MINDSET
      </text>
      <path d="M-76,44 H76" stroke="#3f6b3a" strokeWidth="4" strokeDasharray="4 4" />
    </g>
  </g>
)

// A plain painted cloth in one colour, for scenes played against nothing much.
export const Plain = ({ color }: { color: string }) => (
  <g>
    <rect x="150" y="130" width="1620" height="660" fill={color} />
    <rect x="150" y="130" width="1620" height="660" fill="url(#crosshatch)" opacity="0.05" />
    <path d="M150,130 H1770" stroke={gold.dark} strokeWidth="6" opacity="0.4" />
  </g>
)
