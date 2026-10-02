import { random } from "remotion"
import { Sparkle } from "./cast/copilot"
import { Atom } from "./cast/engineer"
import { type Place, placed } from "./paper"
import { font, gold, ink, paper, velvet, wood } from "./theme"

// The Engineer's office: furniture, the laptop and the things that live on a desk.

const leather = "#3f6b4a"

// A Victorian pedestal desk, its feet on (x, y): 320 across and 152 tall.
export const Desk = (place: Place) => (
  <g transform={placed(place)} filter="url(#cut)" strokeLinejoin="round">
    <rect x="-50" y="-136" width="100" height="70" fill={wood.deep} stroke={ink} strokeWidth="2.5" />
    {[-1, 1].map((side) => (
      <g key={side}>
        <rect
          x={side < 0 ? -150 : 50}
          y="-136"
          width="100"
          height="136"
          fill={wood.base}
          stroke={ink}
          strokeWidth="3"
        />
        {[0, 1, 2].map((row) => (
          <g key={row}>
            <rect
              x={side < 0 ? -142 : 58}
              y={-128 + row * 42}
              width="84"
              height="36"
              fill={wood.dark}
              stroke={ink}
              strokeWidth="2"
            />
            <circle cx={side * 100} cy={-110 + row * 42} r="4.5" fill={gold.base} stroke={ink} strokeWidth="1.5" />
          </g>
        ))}
      </g>
    ))}
    <rect x="-164" y="-152" width="328" height="18" rx="3" fill={wood.light} stroke={ink} strokeWidth="3" />
    <rect x="-140" y="-150" width="280" height="6" fill={leather} />
  </g>
)

// A high-backed, buttoned leather office chair, seen behind whoever sits in it; its feet on (x, y).
export const Chair = (place: Place) => (
  <g transform={placed(place)} filter="url(#cut)">
    <path d="M-50,-150 V0 M50,-150 V0" stroke={wood.dark} strokeWidth="9" />
    <path
      d="M-66,-160 Q-74,-300 0,-312 Q74,-300 66,-160 Z"
      fill="#7a2e22"
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    {[-30, 0, 30].flatMap((dx) =>
      [-280, -240, -200].map((dy) => <circle key={`${dx}${dy}`} cx={dx} cy={dy} r="3.5" fill="#4a1a12" />)
    )}
    <path d="M-66,-160 Q0,-150 66,-160" fill="none" stroke={wood.dark} strokeWidth="8" />
  </g>
)

// The laptop, lid up, from behind: what the audience sees is the stickers. Its base on (x, y).
export const Laptop = ({ glow = 0, ...place }: Place & { glow?: number }) => (
  <g transform={placed(place)} strokeLinejoin="round">
    {glow > 0 ? <ellipse cx="0" cy="-96" rx="120" ry="70" fill="#bfe3ff" opacity={0.25 * glow} /> : null}
    <rect x="-74" y="-104" width="148" height="100" rx="9" fill="#c9ced6" stroke={ink} strokeWidth="3" />
    <rect x="-74" y="-104" width="148" height="100" rx="9" fill="url(#hatch)" opacity="0.07" />
    <g transform="translate(-40 -70) scale(0.55)">
      <circle r="34" fill="#20232a" stroke={ink} strokeWidth="3" />
      <Atom />
    </g>
    <g transform="translate(32 -78) rotate(8)">
      <rect x="-32" y="-14" width="64" height="28" rx="5" fill="#f2c94c" stroke={ink} strokeWidth="2" />
      <text y="5.5" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="15" fill={ink}>
        SHIP IT
      </text>
    </g>
    <g transform="translate(36 -36)">
      <circle r="16" fill="#fff" stroke={ink} strokeWidth="2" />
      <Sparkle x={0} y={0} size={11} fill="#1d6ff2" />
    </g>
    <g transform="translate(-14 -28) rotate(-10)">
      <rect x="-29" y="-12" width="58" height="24" rx="12" fill="#7b61ff" stroke={ink} strokeWidth="2" />
      <text y="5" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="14" fill="#fff">
        it works
      </text>
    </g>
    <rect x="-82" y="-6" width="164" height="8" rx="3" fill="#aeb4bd" stroke={ink} strokeWidth="2.5" />
  </g>
)

// A banker's lamp with a green glass shade, throwing a pool of light down on the desk while `on`. Its foot on (x, y).
export const BankerLamp = ({ on = 1, ...place }: Place & { on?: number }) => (
  <g transform={placed(place)}>
    {on > 0 ? (
      <path d="M-34,-74 L34,-74 L90,0 L-90,0 Z" fill="#fff2b8" opacity={0.35 * on} style={{ mixBlendMode: "screen" }} />
    ) : null}
    <g filter="url(#cut)" strokeLinejoin="round">
      <ellipse cx="0" cy="-4" rx="30" ry="7" fill={gold.base} stroke={ink} strokeWidth="2.5" />
      <path d="M-3,-8 V-70 M3,-8 V-70" stroke={gold.dark} strokeWidth="3" />
      <path d="M-46,-70 Q0,-108 46,-70 Z" fill="#2f7d4f" stroke={ink} strokeWidth="3" />
      <path d="M-30,-82 Q0,-100 30,-82" stroke="#9fe0b8" strokeWidth="3" opacity="0.6" fill="none" />
      <ellipse cx="0" cy="-70" rx="46" ry="6" fill={on > 0.5 ? "#fff6c8" : "#4a4a3a"} stroke={ink} strokeWidth="2" />
    </g>
  </g>
)

// A beetle, the bug that's always on the keyboard, scuttling while `walk` runs. It can wear a top hat and carry a
// cane like the Engineer, or hide under a lampshade. Its feet on (x, y), about 60 long.
export const Beetle = ({
  walk = 0,
  topHat,
  cane,
  shade,
  ...place
}: Place & { walk?: number; topHat?: boolean; cane?: number; shade?: boolean }) => (
  <g transform={placed(place)} strokeLinejoin="round">
    {[-18, -2, 14].map((x, i) => (
      <path
        key={x}
        d={`M${x},-12 l${-6 + Math.sin(walk * 18 + i * 2) * 6},12 M${x + 4},-12 l${6 + Math.sin(walk * 18 + i * 2 + 3) * 6},12`}
        stroke={ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
    ))}
    <ellipse cx="0" cy="-20" rx="30" ry="17" fill="#3a2f4a" stroke={ink} strokeWidth="2.5" />
    <path d="M0,-36 V-4" stroke={ink} strokeWidth="2" />
    <ellipse cx="-8" cy="-26" rx="8" ry="4" fill="#fff" opacity="0.25" />
    <circle cx="30" cy="-24" r="10" fill="#2a2236" stroke={ink} strokeWidth="2.5" />
    <circle cx="33" cy="-27" r="3.4" fill="#fff" />
    <circle cx="34" cy="-27" r="1.6" fill={ink} />
    <path d="M34,-32 Q44,-50 52,-46 M28,-33 Q34,-52 42,-52" stroke={ink} strokeWidth="2" fill="none" />
    {topHat ? (
      <g transform="translate(28 -32) rotate(12)">
        <rect x="-9" y="-22" width="18" height="20" fill="#18151c" stroke={ink} strokeWidth="2" />
        <rect x="-14" y="-4" width="28" height="5" rx="2" fill="#18151c" stroke={ink} strokeWidth="2" />
        <rect x="-9" y="-8" width="18" height="3" fill={velvet.base} />
      </g>
    ) : null}
    {cane === undefined ? null : (
      <g transform={`translate(44 -14) rotate(${cane})`}>
        <path d="M8,-30 A8,8 0 0 0 -8,-30 V14" fill="none" stroke={ink} strokeWidth="5" strokeLinecap="round" />
        <path d="M8,-30 A8,8 0 0 0 -8,-30 V14" fill="none" stroke="#d6a65e" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    )}
    {shade ? (
      <g>
        <path d="M-6,-6 V-30" stroke={gold.dark} strokeWidth="4" />
        <path d="M-40,-28 L-26,-64 H14 L28,-28 Z" fill="#e9c46a" stroke={ink} strokeWidth="2.5" />
        <path d="M-40,-28 H28" stroke={velvet.base} strokeWidth="4" />
      </g>
    ) : null}
  </g>
)

// The BUILD tower, `bricks` high, shaken apart as `fall` goes from 0 to 1. Its foot on (x, y).
export const BuildTower = ({ bricks, fall = 0, ...place }: Place & { bricks: number; fall?: number }) => (
  <g transform={placed(place)}>
    {Array.from({ length: Math.min(8, Math.floor(bricks)) }, (_, i) => {
      const dx = (random(`brickx${i}`) - 0.5) * 360 * fall
      const dy = -fall * (80 + random(`bricky${i}`) * 80) * (1 - fall) * 4 + fall * i * 22
      const spin = (random(`brickr${i}`) - 0.5) * 220 * fall
      return (
        <g key={i} transform={`translate(${dx + (i % 2) * 6} ${-i * 26 + dy}) rotate(${spin})`}>
          <rect
            x="-40"
            y="-26"
            width="80"
            height="26"
            fill="#b5502f"
            stroke={ink}
            strokeWidth="2.5"
            filter="url(#cut)"
          />
          <path d="M-40,-13 H40 M0,-26 V-13 M-20,-13 V0 M20,-13 V0" stroke="#7d2f19" strokeWidth="1.5" />
          {i === 0 ? (
            <text y="-6" textAnchor="middle" fontFamily={font.poster} fontSize="18" fill={paper.light}>
              BUILD
            </text>
          ) : null}
        </g>
      )
    })}
  </g>
)

// A brass pressure gauge with a red zone, its needle at `needle` degrees from straight up. Drawn about its middle.
export const Gauge = ({
  x,
  y,
  r = 44,
  needle,
  label
}: {
  x: number
  y: number
  r?: number
  needle: number
  label: string
}) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <circle r={r + 8} fill="url(#goldMetal)" stroke={ink} strokeWidth="3" />
    <circle r={r} fill={paper.light} stroke={ink} strokeWidth="2" />
    <path
      d={`M${r * 0.85 * Math.cos(-0.1 * Math.PI)},${r * 0.85 * Math.sin(-0.1 * Math.PI)} A${r * 0.85},${r * 0.85} 0 0 1 ${r * 0.85 * Math.cos(0.25 * Math.PI)},${r * 0.85 * Math.sin(0.25 * Math.PI)}`}
      fill="none"
      stroke="#c0161c"
      strokeWidth="7"
    />
    {Array.from({ length: 9 }, (_, i) => -120 + i * 30).map((angle) => (
      <line key={angle} y1={-r * 0.9} y2={-r * 0.74} stroke={ink} strokeWidth="2.5" transform={`rotate(${angle})`} />
    ))}
    <text y={r * 0.5} textAnchor="middle" fontFamily={font.caps} fontSize={r * 0.3} fill={ink}>
      {label}
    </text>
    <line y2={-r * 0.8} stroke="#b3191f" strokeWidth="4" strokeLinecap="round" transform={`rotate(${needle})`} />
    <circle r="6" fill={ink} />
  </g>
)

// A cuckoo clock stopped at half past five, its doors swung open by `open`. Hangs from (x, y), about 220 tall.
export const CuckooClock = ({ x, y, open, scale = 1 }: { x: number; y: number; open: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} filter="url(#cut)" strokeLinejoin="round">
    <path d="M-104,-60 L0,-150 L104,-60 Z" fill={wood.dark} stroke={ink} strokeWidth="3" />
    {[-1, 1].map((side) => (
      <path
        key={side}
        d={`M0,-150 ${Array.from({ length: 5 }, (_, i) => `L${side * (20 + i * 18)},${-132 + i * 16} l${side * 10},4`).join(" ")}`}
        fill="none"
        stroke={wood.light}
        strokeWidth="5"
      />
    ))}
    <rect x="-82" y="-64" width="164" height="184" fill={wood.base} stroke={ink} strokeWidth="3" />
    <rect x="-36" y="-58" width="72" height="54" fill="#1b0f08" stroke={ink} strokeWidth="2" />
    {[-1, 1].map((side) => (
      <rect
        key={side}
        x={side < 0 ? -36 : 36 - 36 * (1 - open * 0.85)}
        y="-58"
        width={36 * (1 - open * 0.85)}
        height="54"
        fill={wood.light}
        stroke={ink}
        strokeWidth="2"
      />
    ))}
    <circle cx="0" cy="54" r="50" fill={paper.light} stroke={ink} strokeWidth="3" />
    {Array.from({ length: 12 }, (_, i) => i * 30).map((angle) => (
      <line
        key={angle}
        x1="0"
        y1="14"
        x2="0"
        y2="20"
        stroke={ink}
        strokeWidth="3"
        transform={`rotate(${angle} 0 54)`}
      />
    ))}
    <line x1="0" y1="54" x2="0" y2="88" stroke={ink} strokeWidth="5" strokeLinecap="round" />
    <line
      x1="0"
      y1="54"
      x2="0"
      y2="30"
      stroke={ink}
      strokeWidth="6"
      strokeLinecap="round"
      transform="rotate(165 0 54)"
    />
    <path d="M-20,120 V200 M20,120 V170" stroke={gold.dark} strokeWidth="3" />
    <path d="M-28,200 h16 l-3,30 h-10 Z M12,170 h16 l-3,30 h-10 Z" fill={gold.base} stroke={ink} strokeWidth="2" />
  </g>
)

// The Teams call painted on the office wall: six portraits in gilt frames, `lit` of them with their cameras on.
export const TeamsWall = ({ lit, t }: { lit: number; t: number }) => (
  <g>
    <rect x="150" y="130" width="1620" height="660" fill="#4b2f45" />
    {Array.from({ length: 28 }, (_, i) => 150 + i * 60).map((x) => (
      <path key={x} d={`M${x + 30},130 V790`} stroke="#5a3a53" strokeWidth="16" />
    ))}
    <rect x="150" y="640" width="1620" height="150" fill={wood.dark} stroke={ink} strokeWidth="3" />
    <path d="M150,640 H1770" stroke={wood.light} strokeWidth="8" />
    {Array.from({ length: 6 }, (_, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const x = 740 + col * 220
      const y = 240 + row * 190
      const on = lit > i
      const colors = ["#6a8caf", "#c98b5d", "#7fa36b", "#b06a8d", "#d6b85a", "#5f8f8a"]
      const bob = on ? Math.sin(t * 6 + i * 1.7) * 3 : 0
      return (
        <g key={i} filter="url(#cut)">
          <rect x={x - 96} y={y - 76} width="192" height="152" fill="url(#goldMetal)" stroke={ink} strokeWidth="3" />
          <rect
            x={x - 82}
            y={y - 62}
            width="164"
            height="124"
            fill={on ? colors[i] : "#1a1a1e"}
            stroke={ink}
            strokeWidth="2"
          />
          {on ? (
            <g transform={`translate(${x} ${y + 62 + bob})`} fill="#2b1b10" opacity="0.85">
              <circle cy="-78" r="26" />
              <path d="M-52,0 Q-50,-44 0,-48 Q50,-44 52,0 Z" />
              {i === 2 ? <path d="M-30,-96 L-20,-118 L-8,-100 M30,-96 L20,-118 L8,-100" fill="#2b1b10" /> : null}
            </g>
          ) : (
            <circle cx={x} cy={y} r="22" fill="#3a3a44" stroke="#6a6a74" strokeWidth="2" />
          )}
        </g>
      )
    })}
  </g>
)

// A door in its frame with a sign over it, swung open by `open`. Its sill on (x, y), 330 tall.
export const Door = ({
  x,
  y,
  open,
  label,
  scale = 1
}: {
  x: number
  y: number
  open: number
  label: string
  scale?: number
}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} filter="url(#cut)">
    <rect x="-110" y="-330" width="220" height="330" fill="#1a1210" stroke={ink} strokeWidth="5" />
    <g transform={`translate(-100 0) scale(${Math.max(0.08, 1 - open * 0.92)} 1)`}>
      <rect x="0" y="-320" width="200" height="320" fill={wood.base} stroke={ink} strokeWidth="4" />
      <rect x="24" y="-296" width="152" height="120" fill={wood.dark} stroke={ink} strokeWidth="2" />
      <rect x="24" y="-150" width="152" height="120" fill={wood.dark} stroke={ink} strokeWidth="2" />
      <circle cx="176" cy="-160" r="9" fill={gold.base} stroke={ink} strokeWidth="2" />
    </g>
    <rect x="-100" y="-386" width="200" height="42" fill={paper.light} stroke={ink} strokeWidth="3" />
    <text y="-358" textAnchor="middle" fontFamily={font.caps} fontSize="22" fill={ink}>
      {label}
    </text>
  </g>
)

// A grey dialog box with a blue title bar, the way Windows asked things for a very long time. Top-left at (x, y).
export const Dialog = ({
  x,
  y,
  title,
  text,
  buttons,
  pressed
}: {
  x: number
  y: number
  title: string
  text: string
  buttons: readonly string[]
  pressed?: number
}) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <rect width="420" height="190" fill="#c3c3c3" stroke={ink} strokeWidth="3" />
    <path d="M3,187 V3 H417" stroke="#fff" strokeWidth="3" fill="none" />
    <defs>
      <linearGradient id="titleBar" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#000a80" />
        <stop offset="1" stopColor="#1a84d0" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="408" height="34" fill="url(#titleBar)" />
    <text x="16" y="30" fontFamily={font.sans} fontWeight="700" fontSize="19" fill="#fff">
      {title}
    </text>
    <rect x="384" y="11" width="24" height="22" fill="#c3c3c3" stroke={ink} strokeWidth="1.5" />
    <path d="M390,16 L402,28 M402,16 L390,28" stroke={ink} strokeWidth="2.5" />
    <text x="24" y="90" fontFamily={font.sans} fontSize="21" fill="#000">
      {text}
    </text>
    {buttons.map((label, i) => {
      const down = pressed === i
      return (
        <g key={label} transform={`translate(${70 + i * 150} 124)`}>
          <rect width="130" height="40" fill="#c3c3c3" stroke={ink} strokeWidth="2" />
          <path d={down ? "M2,38 H128 V2" : "M2,38 V2 H128"} stroke="#fff" strokeWidth="2.5" fill="none" />
          <path d={down ? "M2,38 V2 H128" : "M2,38 H128 V2"} stroke="#6b6b6b" strokeWidth="2.5" fill="none" />
          <text
            x={65 + (down ? 2 : 0)}
            y={27 + (down ? 2 : 0)}
            textAnchor="middle"
            fontFamily={font.sans}
            fontSize="19"
            fill="#000"
          >
            {label}
          </text>
        </g>
      )
    })}
  </g>
)
