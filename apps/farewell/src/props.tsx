import { type ReactNode, useContext } from "react"
import { random } from "remotion"
import { Agent } from "./cast/agent"
import { Song } from "./song"
import { chalkboard, font, gold, ink, paper, skin, velvet, wood } from "./theme"
import { beats } from "./timeline"

// The playbill flown in on two lines before the curtain goes up.
export const Playbill = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <line x1="-250" y1="-240" x2="-244" y2="6" stroke={ink} strokeWidth="3" />
    <line x1="250" y1="-240" x2="244" y2="6" stroke={ink} strokeWidth="3" />
    <rect x="-320" y="0" width="640" height="560" fill={paper.light} stroke={ink} strokeWidth="3" filter="url(#cut)" />
    <rect x="-306" y="14" width="612" height="532" fill="none" stroke={ink} strokeWidth="1.5" />
    <rect x="-298" y="22" width="596" height="516" fill="none" stroke={ink} strokeWidth="4" />
    {[
      [-298, 22],
      [298, 22],
      [-298, 538],
      [298, 538]
    ].map(([cx = 0, cy = 0]) => (
      <path
        key={`${cx}${cy}`}
        d={`M${cx - 12},${cy} L${cx},${cy - 12} L${cx + 12},${cy} L${cx},${cy + 12} Z`}
        fill={velvet.base}
        stroke={ink}
        strokeWidth="2"
      />
    ))}
    <text y="70" textAnchor="middle" fontFamily={font.caps} fontSize="25" letterSpacing="7" fill={velvet.base}>
      Theatre Royal, Redmond
    </text>
    <path d="M-200,88 H-14 M14,88 H200" stroke={ink} strokeWidth="2" />
    <path d="M0,80 L8,88 L0,96 L-8,88 Z" fill={ink} />
    <text y="150" textAnchor="middle" fontFamily={font.script} fontSize="58" fill={ink}>
      The EDU Players
    </text>
    <text y="186" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="28" fill={ink}>
      present
    </text>
    <text y="272" textAnchor="middle" fontFamily={font.poster} fontSize="84" fill={ink}>
      SO LONG,
    </text>
    <text y="318" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="34" fill={ink}>
      and thanks for all the
    </text>
    <text y="412" textAnchor="middle" fontFamily={font.poster} fontSize="98" fill={velvet.base} letterSpacing="4">
      TOKENS
    </text>
    <path d="M-220,438 H220" stroke={ink} strokeWidth="2" />
    <text y="474" textAnchor="middle" fontFamily={font.caps} fontSize="24" letterSpacing="2" fill={ink}>
      A Farewell in Five Acts and One Incident
    </text>
    <text y="512" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="21" fill={velvet.dark}>
      Positively the last performance. No refunds.
    </text>
  </g>
)

// The assistant's yellow balloon: a line or two and some round blue options, its tail pointing at whoever's talking.
// It grows out of its tail as `pop` goes from 0 to 1, and the `chosen` option shows as clicked.
export const Balloon = ({
  x,
  y,
  width,
  title,
  body,
  options = [],
  tail,
  pop = 1,
  chosen
}: {
  x: number
  y: number
  width: number
  title: string
  body?: string
  options?: readonly string[]
  tail: { x: number; y: number }
  pop?: number
  chosen?: number
}) => {
  const top = body ? 116 : 98
  const height = top + options.length * 40 - (options.length > 0 ? 8 : 34)
  const base = Math.min(Math.max(tail.x, x + 50), x + width - 50)
  return (
    <g transform={`translate(${tail.x} ${tail.y}) scale(${pop}) translate(${-tail.x} ${-tail.y})`}>
      <defs>
        <radialGradient id="bullet" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#bfe0ff" />
          <stop offset="1" stopColor="#2c63c9" />
        </radialGradient>
      </defs>
      <path
        d={`M${base - 22},${y + height - 2} L${tail.x},${tail.y} L${base + 16},${y + height - 2} Z`}
        fill="#fff6c2"
        stroke="#000"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x={x} y={y} width={width} height={height} rx="16" fill="#fff6c2" stroke="#000" strokeWidth="2.5" />
      <path d={`M${base - 19},${y + height - 1.5} H${base + 13}`} stroke="#fff6c2" strokeWidth="4" />
      <text x={x + 24} y={y + 44} fontFamily={font.sans} fontWeight="700" fontSize="25" fill="#000">
        {title}
      </text>
      {body ? (
        <text x={x + 24} y={y + 80} fontFamily={font.sans} fontSize="23" fill="#000">
          {body}
        </text>
      ) : null}
      {options.map((option, i) => (
        <g key={option}>
          {chosen === i ? (
            <rect x={x + 18} y={y + top - 20 + i * 40} width={width - 36} height="38" rx="6" fill="#cfe3ff" />
          ) : null}
          <circle
            cx={x + 38}
            cy={y + top + i * 40}
            r="11"
            fill={chosen === i ? "#1d3f8f" : "url(#bullet)"}
            stroke="#1d3f8f"
            strokeWidth="1.5"
          />
          <text
            x={x + 60}
            y={y + top + 8 + i * 40}
            fontFamily={font.sans}
            fontWeight={chosen === i ? "700" : "400"}
            fontSize="24"
            fill="#000"
          >
            {option}
          </text>
        </g>
      ))}
    </g>
  )
}

// The link-select hand cursor, pixel for pixel: B is outline, W is fill.
const hand = [
  "......BB..........",
  ".....BWWB.........",
  ".....BWWB.........",
  ".....BWWB.........",
  ".....BWWB.........",
  ".....BWWBBB.......",
  ".....BWWBWWBBB....",
  ".....BWWBWWBWWBB..",
  ".BB..BWWBWWBWWBWWB",
  "BWWB.BWWWWWWWWWWWB",
  "BWWWBBWWWWWWWWWWWB",
  ".BWWWWWWWWWWWWWWWB",
  "..BWWWWWWWWWWWWWWB",
  "..BWWWWWWWWWWWWWWB",
  "...BWWWWWWWWWWWWWB",
  "...BWWWWWWWWWWWWB.",
  "....BWWWWWWWWWWWB.",
  "....BWWWWWWWWWWWB.",
  ".....BWWWWWWWWWB..",
  ".....BWWWWWWWWWB..",
  ".....BBBBBBBBBBB.."
]
const runs = (pattern: RegExp) =>
  hand.flatMap((row, r) =>
    [...row.matchAll(pattern)].map((run) => ({ r, c: run.index, n: run[0].length, dark: run[0][0] === "B" }))
  )
const handPixels = runs(/B+|W+/g)
const handShadow = runs(/[BW]+/g)
const pixel = 5

// The hand cursor, its fingertip at (x, y), pressing in as it clicks.
export const Pointer = ({ x, y, pressed = 0 }: { x: number; y: number; pressed?: number }) => (
  <g
    transform={`translate(${x} ${y}) scale(${1 - 0.1 * pressed}) translate(${-7 * pixel} 0)`}
    shapeRendering="crispEdges"
  >
    <g transform="translate(5 7)" opacity="0.35" filter="url(#soft)">
      {handShadow.map(({ r, c, n }) => (
        <rect key={`${r}-${c}`} x={c * pixel} y={r * pixel} width={n * pixel} height={pixel} fill="#000" />
      ))}
    </g>
    {handPixels.map(({ r, c, n, dark }) => (
      <rect
        key={`${r}-${c}`}
        x={c * pixel}
        y={r * pixel}
        width={n * pixel}
        height={pixel}
        fill={dark ? "#000" : "#fff"}
      />
    ))}
  </g>
)

// A plain speech bubble for anyone who isn't the assistant, its tail pointing at the speaker.
export const Say = ({
  x,
  y,
  width,
  lines,
  tail
}: {
  x: number
  y: number
  width: number
  lines: readonly string[]
  tail: { x: number; y: number }
}) => {
  const height = 28 + lines.length * 34
  const base = Math.min(Math.max(tail.x, x + 40), x + width - 40)
  return (
    <g filter="url(#cut)">
      <path
        d={`M${base - 18},${y + height - 2} L${tail.x},${tail.y} L${base + 14},${y + height - 2} Z`}
        fill="#fffdf6"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x={x} y={y} width={width} height={height} rx="22" fill="#fffdf6" stroke={ink} strokeWidth="2.5" />
      <path d={`M${base - 15},${y + height - 1.5} H${base + 11}`} stroke="#fffdf6" strokeWidth="4" />
      {lines.map((line, i) => (
        <text
          key={line}
          x={x + width / 2}
          y={y + 42 + i * 34}
          textAnchor="middle"
          fontFamily={font.book}
          fontSize="27"
          fill={ink}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

const sparkle = (r: number) =>
  `M0,${-r} Q${r * 0.2},${-r * 0.2} ${r},0 Q${r * 0.2},${r * 0.2} 0,${r} Q${-r * 0.2},${r * 0.2} ${-r},0 Q${-r * 0.2},${-r * 0.2} 0,${-r} Z`

// A brass token, `turn` its spin: 1 face on, 0 edge on.
export const Token = ({
  x,
  y,
  r = 16,
  turn = 1,
  rotate = 0
}: {
  x: number
  y: number
  r?: number
  turn?: number
  rotate?: number
}) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${Math.max(0.12, Math.abs(turn))} 1)`}>
    <circle r={r} fill={gold.base} stroke={gold.deep} strokeWidth="2.5" />
    <circle r={r * 0.74} fill={gold.light} stroke={gold.dark} strokeWidth="1.5" />
    <path d={sparkle(r * 0.5)} fill={gold.dark} />
  </g>
)

// Tokens falling from the flies, scattered the same way every time for the same `seed`.
export const TokenRain = ({
  count,
  seed,
  area
}: {
  count: number
  seed: string
  area: { x: number; y: number; width: number; height: number }
}) => (
  <g>
    {Array.from({ length: count }, (_, i) => (
      <Token
        key={i}
        x={area.x + random(`${seed}x${i}`) * area.width}
        y={area.y + random(`${seed}y${i}`) * area.height}
        r={11 + random(`${seed}r${i}`) * 9}
        turn={Math.cos(random(`${seed}t${i}`) * Math.PI)}
        rotate={random(`${seed}a${i}`) * 60 - 30}
      />
    ))}
  </g>
)

// The painted sunburst every variety number is sung in front of.
export const Sunburst = ({
  cx,
  cy,
  rays = 28,
  colors = ["#f7e2b1", "#eac378"]
}: {
  cx: number
  cy: number
  rays?: number
  colors?: readonly [string, string]
}) => (
  <g>
    {Array.from({ length: rays }, (_, i) => {
      const from = (i / rays) * Math.PI * 2
      const to = ((i + 1) / rays) * Math.PI * 2
      return (
        <path
          key={i}
          d={`M${cx},${cy} L${cx + 2000 * Math.cos(from)},${cy + 2000 * Math.sin(from)} L${cx + 2000 * Math.cos(to)},${cy + 2000 * Math.sin(to)} Z`}
          fill={colors[i % 2]}
        />
      )
    })}
  </g>
)

// A sign lit by a border of bulbs. In the show they chase clockwise round it on the eighth notes and all flash on the
// first beat of every bar, and the lettering glows brighter on each beat.
export const Marquee = ({
  x,
  y,
  width,
  height,
  text
}: {
  x: number
  y: number
  width: number
  height: number
  text: string
}) => {
  const song = useContext(Song)
  const step = 32
  const across = Math.floor((width - 24) / step)
  const down = Math.floor((height - 24) / step)
  const [left, right, top, bottom] = [x + 12, x + width - 12, y + 12, y + height - 12]
  const bulbs = [
    ...Array.from({ length: across }, (_, i) => ({ bx: left + (i * (right - left)) / across, by: top })),
    ...Array.from({ length: down }, (_, i) => ({ bx: right, by: top + (i * (bottom - top)) / down })),
    ...Array.from({ length: across }, (_, i) => ({ bx: right - (i * (right - left)) / across, by: bottom })),
    ...Array.from({ length: down }, (_, i) => ({ bx: left, by: bottom - (i * (bottom - top)) / down }))
  ]
  const b = song === undefined ? undefined : beats(song)
  const chase = b === undefined ? 0 : Math.floor(b * 2)
  const flash = b === undefined || ((b % 4) + 4) % 4 < 0.14
  const pulse = b === undefined ? 1 : Math.max(0, 1 - (((b % 1) + 1) % 1) * 3)
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="20"
        fill="#5a0d12"
        stroke={gold.deep}
        strokeWidth="6"
        filter="url(#cut)"
      />
      <rect
        x={x + 24}
        y={y + 24}
        width={width - 48}
        height={height - 48}
        rx="10"
        fill="#2a0508"
        stroke={gold.base}
        strokeWidth="3"
      />
      {bulbs.map(({ bx, by }, i) =>
        flash || (((i - chase) % 3) + 3) % 3 === 0 ? (
          <g key={`${bx}-${by}`}>
            <circle cx={bx} cy={by} r="14" fill="#ffd56b" opacity="0.45" />
            <circle cx={bx} cy={by} r="6.5" fill="#fff6d2" stroke="#b78a2a" strokeWidth="1.5" />
          </g>
        ) : (
          <circle key={`${bx}-${by}`} cx={bx} cy={by} r="6.5" fill="#7a5a2a" stroke="#4a3418" strokeWidth="1.5" />
        )
      )}
      <text
        x={x + width / 2}
        y={y + height / 2 + height * 0.2}
        textAnchor="middle"
        fontFamily={font.poster}
        fontSize={height * 0.56}
        fill="#ffd56b"
        filter="url(#soft)"
        opacity={0.55 + 0.4 * pulse}
      >
        {text}
      </text>
      <text
        x={x + width / 2}
        y={y + height / 2 + height * 0.2}
        textAnchor="middle"
        fontFamily={font.poster}
        fontSize={height * 0.56}
        fill="#fff1c1"
        stroke="#a36a00"
        strokeWidth="2"
      >
        {text}
      </text>
    </g>
  )
}

// A schoolroom chalkboard on a stand; `children` are drawn in chalk, from the board's top-left corner.
export const Chalkboard = ({
  x,
  y,
  width,
  height,
  children
}: {
  x: number
  y: number
  width: number
  height: number
  children: ReactNode
}) => (
  <g transform={`translate(${x} ${y})`}>
    <line
      x1={width * 0.2}
      y1={height}
      x2={width * 0.12}
      y2={height + 170}
      stroke={wood.dark}
      strokeWidth="14"
      strokeLinecap="round"
    />
    <line
      x1={width * 0.8}
      y1={height}
      x2={width * 0.88}
      y2={height + 170}
      stroke={wood.dark}
      strokeWidth="14"
      strokeLinecap="round"
    />
    <rect
      x="-16"
      y="-16"
      width={width + 32}
      height={height + 32}
      rx="8"
      fill={wood.base}
      stroke={ink}
      strokeWidth="3.5"
      filter="url(#cut)"
    />
    <rect x="0" y="0" width={width} height={height} fill={chalkboard.board} stroke={ink} strokeWidth="2" />
    <rect x="0" y="0" width={width} height={height} fill="url(#boardSmear)" opacity="0.5" />
    <rect
      x="-24"
      y={height + 8}
      width={width + 48}
      height="16"
      rx="4"
      fill={wood.dark}
      stroke={ink}
      strokeWidth="2.5"
    />
    <g filter="url(#chalky)">{children}</g>
  </g>
)

// A gold star, as stuck on good work.
export const GoldStar = ({ x, y, size = 60, label }: { x: number; y: number; size?: number; label?: string }) => {
  const points = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? size : size * 0.45
    const angle = (i * Math.PI) / 5 - Math.PI / 2
    return `${r * Math.cos(angle)},${r * Math.sin(angle)}`
  }).join(" ")
  return (
    <g transform={`translate(${x} ${y}) rotate(-12)`}>
      <polygon
        points={points}
        fill={gold.base}
        stroke={gold.deep}
        strokeWidth="3"
        strokeLinejoin="round"
        filter="url(#cut)"
      />
      <polygon points={points} fill="url(#goldMetal)" opacity="0.6" transform="scale(0.8)" />
      {label ? (
        <text
          y={size + 34}
          textAnchor="middle"
          fontFamily={font.chalk}
          fontSize={size * 0.5}
          fill="#ffe27a"
          transform="rotate(12)"
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}

// A pennant on a stick, held about the end of the stick, its tip drooping `droop`. `mirrored` when whoever holds it is
// drawn reversed, so the lettering's turned back to read.
export const Pennant = ({ text, droop = 14, mirrored }: { text: string; droop?: number; mirrored?: boolean }) => {
  const tilt = (Math.atan2(droop, 530) * 180) / Math.PI
  return (
    <g>
      <line x1="0" y1="0" x2="34" y2="-6" stroke={wood.dark} strokeWidth="7" strokeLinecap="round" />
      <path
        d={`M30,-44 L560,${6 + droop} L30,56 Z`}
        fill={velvet.base}
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
        filter="url(#cut)"
      />
      <text
        x={mirrored ? -50 : 50}
        y="18"
        textAnchor={mirrored ? "end" : "start"}
        fontFamily={font.poster}
        fontSize="30"
        fill="#fff4d6"
        transform={mirrored ? `scale(-1 1) rotate(${-tilt} -50 18)` : `rotate(${tilt} 50 18)`}
      >
        {text}
      </text>
    </g>
  )
}

// Two musical notes, for whoever's singing.
export const Notes = ({ x, y, scale = 1, color = ink }: { x: number; y: number; scale?: number; color?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color} stroke={color}>
    <ellipse cx="0" cy="0" rx="9" ry="7" transform="rotate(-20)" stroke="none" />
    <path d="M8,-2 V-44 Q20,-36 22,-24" strokeWidth="3.5" fill="none" />
    <ellipse cx="34" cy="-12" rx="9" ry="7" transform="rotate(-20 34 -12)" stroke="none" />
    <ellipse cx="62" cy="-20" rx="9" ry="7" transform="rotate(-20 62 -20)" stroke="none" />
    <path d="M42,-14 V-56 L70,-64 V-22" strokeWidth="3.5" fill="none" />
    <path d="M42,-52 L70,-60" strokeWidth="7" />
  </g>
)

export type Seat = { title: string; agent?: boolean; flipping?: number; you?: boolean }

const Portrait = ({ index, agent }: { index: number; agent: boolean }) => {
  if (agent) {
    return (
      <g transform="translate(0 30) scale(0.42)">
        <Agent x={0} y={0} />
      </g>
    )
  }
  const hair = ["#5a3a1e", "#2b2321", "#a8743c", "#7b7b7b", "#3b2a1a", "#c98c4f"][index % 6] ?? "#5a3a1e"
  const style = index % 4
  return (
    <g>
      <path d="M-30,30 Q-28,8 0,6 Q28,8 30,30 Z" fill="#4a5a78" stroke={ink} strokeWidth="2" />
      <circle cx="0" cy="-10" r="15" fill={skin.base} stroke={ink} strokeWidth="2" />
      {style === 0 ? (
        <path d="M-16,-12 Q-16,-30 0,-30 Q16,-30 16,-12 Q8,-22 -16,-12 Z" fill={hair} stroke={ink} strokeWidth="1.5" />
      ) : null}
      {style === 1 ? (
        <path
          d="M-17,-6 Q-20,-32 0,-31 Q20,-32 17,-6 Q20,6 14,10 L12,-14 Q0,-22 -12,-14 L-14,10 Q-20,6 -17,-6 Z"
          fill={hair}
          stroke={ink}
          strokeWidth="1.5"
        />
      ) : null}
      {style === 2 ? (
        <path d="M-14,-20 L-12,-40 L12,-40 L14,-20 Z M-22,-20 H22" fill="#1f1a19" stroke={ink} strokeWidth="2" />
      ) : null}
      {style === 3 ? <circle cx="0" cy="-30" r="8" fill={hair} stroke={ink} strokeWidth="1.5" /> : null}
      <circle cx="-5" cy="-10" r="1.8" fill={ink} />
      <circle cx="5" cy="-10" r="1.8" fill={ink} />
      <path d="M-5,-3 Q0,1 5,-3" stroke={ink} strokeWidth="1.5" fill="none" />
    </g>
  )
}

// One seat on the org chart: a portrait and a title, part way through turning over when `flipping` is set.
const Box = ({ x, y, seat, index }: { x: number; y: number; seat: Seat; index: number }) => {
  const turn = seat.flipping === undefined ? 1 : Math.abs(Math.cos(seat.flipping * Math.PI))
  const showsAgent = seat.flipping === undefined ? Boolean(seat.agent) : seat.flipping > 0.5
  let title = seat.title
  if (showsAgent) {
    title = seat.you ? "Agent (Preview)" : "Agent"
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${Math.max(0.04, turn)} 1)`}>
      <rect
        x="-74"
        y="-58"
        width="148"
        height="116"
        rx="6"
        fill={showsAgent ? "#e6f6f8" : "#fffaf0"}
        stroke={seat.you ? velvet.base : ink}
        strokeWidth={seat.you ? 4 : 2.5}
      />
      <ellipse
        cx="0"
        cy="-14"
        rx="34"
        ry="36"
        fill={showsAgent ? "#cdeff3" : paper.shade}
        stroke={ink}
        strokeWidth="2"
      />
      <g transform="translate(0 -10)">
        <Portrait index={index} agent={showsAgent} />
      </g>
      <rect
        x="-74"
        y="30"
        width="148"
        height="28"
        fill={showsAgent ? "#0f8f9c" : "#efe2c4"}
        stroke={ink}
        strokeWidth="2"
      />
      <text
        y="50"
        textAnchor="middle"
        fontFamily={font.caps}
        fontSize="17"
        fill={showsAgent ? "#fff" : ink}
        textLength={title.length > 12 ? 136 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {title}
      </text>
    </g>
  )
}

// The org chart as a classroom pull-down map: a wooden roller, a paper sheet, rows of seats joined by lines.
export const OrgChart = ({ x, y, rows }: { x: number; y: number; rows: readonly (readonly Seat[])[] }) => {
  const width = 1160
  const rowY = [150, 300, 450]
  const columns = (count: number) => Array.from({ length: count }, (_, i) => -width / 2 + ((i + 0.5) * width) / count)
  let index = 0
  return (
    <g transform={`translate(${x} ${y})`}>
      <line x1={-width / 2 + 40} y1="-300" x2={-width / 2 + 40} y2="-6" stroke={ink} strokeWidth="3" />
      <line x1={width / 2 - 40} y1="-300" x2={width / 2 - 40} y2="-6" stroke={ink} strokeWidth="3" />
      <rect
        x={-width / 2 - 10}
        y="0"
        width={width + 20}
        height="540"
        fill={paper.light}
        stroke={ink}
        strokeWidth="3"
        filter="url(#cut)"
      />
      <rect
        x={-width / 2 - 34}
        y="-16"
        width={width + 68}
        height="28"
        rx="14"
        fill={wood.base}
        stroke={ink}
        strokeWidth="3"
      />
      <circle cx={-width / 2 - 34} cy="-2" r="18" fill={wood.dark} stroke={ink} strokeWidth="3" />
      <circle cx={width / 2 + 34} cy="-2" r="18" fill={wood.dark} stroke={ink} strokeWidth="3" />
      <text y="58" textAnchor="middle" fontFamily={font.title} fontSize="44" fill={ink}>
        Org Chart
      </text>
      <text y="86" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="22" fill={velvet.dark}>
        (updated hourly)
      </text>
      {rows.slice(1).map((row, r) => {
        const parents = columns(rows[r]?.length ?? 1)
        const children = columns(row.length)
        const top = rowY[r] ?? 0
        const bottom = rowY[r + 1] ?? 0
        const busY = (top + 58 + bottom - 58) / 2
        return (
          <g key={`links${r}`} stroke={ink} strokeWidth="2.5" fill="none">
            {children.map((cx, c) => {
              const parent = parents[Math.floor((c * parents.length) / children.length)] ?? 0
              return <path key={cx} d={`M${parent},${top + 58} V${busY} H${cx} V${bottom - 58}`} />
            })}
          </g>
        )
      })}
      {rows.map((row, r) =>
        columns(row.length).map((cx, c) => {
          const seat = row[c]
          index += 1
          return seat ? <Box key={`${r}-${cx}`} x={cx} y={rowY[r] ?? 0} seat={seat} index={index} /> : null
        })
      )}
      <circle cx="0" cy="556" r="14" fill="none" stroke={wood.dark} strokeWidth="5" />
    </g>
  )
}

// A forked bolt of electricity through the given points, glowing.
export const Bolt = ({
  points,
  color = "#bff6ff"
}: {
  points: readonly { x: number; y: number }[]
  color?: string
}) => {
  const d = points.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ")
  return (
    <g fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} stroke={color} strokeWidth="22" opacity="0.35" filter="url(#soft)" />
      <path d={d} stroke={color} strokeWidth="8" opacity="0.8" />
      <path d={d} stroke="#fff" strokeWidth="3" />
    </g>
  )
}

// A Tesla coil: a wooden base, a copper winding and a polished sphere on top.
export const TeslaCoil = ({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} filter="url(#cut)">
    <rect x="-50" y="-40" width="100" height="40" rx="4" fill={wood.base} stroke={ink} strokeWidth="3" />
    <rect x="-24" y="-250" width="48" height="210" fill="#b8692e" stroke={ink} strokeWidth="3" />
    {Array.from({ length: 20 }, (_, i) => -244 + i * 10.5).map((cy) => (
      <line key={cy} x1="-24" y1={cy} x2="24" y2={cy + 3} stroke="#7a3d12" strokeWidth="2" />
    ))}
    <ellipse cx="0" cy="-262" rx="58" ry="20" fill="#cfd5dc" stroke={ink} strokeWidth="3" />
    <ellipse cx="-14" cy="-268" rx="22" ry="6" fill="#fff" opacity="0.7" />
  </g>
)

// A lab table with a sheet over it.
export const Slab = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <line x1="-100" y1="-60" x2="-110" y2="0" stroke={wood.deep} strokeWidth="10" />
    <line x1="100" y1="-60" x2="110" y2="0" stroke={wood.deep} strokeWidth="10" />
    <rect x="-130" y="-76" width="260" height="22" rx="4" fill={wood.base} stroke={ink} strokeWidth="3" />
    <path
      d="M-136,-80 Q0,-94 136,-80 L130,-44 Q118,-36 112,-48 Q96,-34 84,-46 L-84,-46 Q-96,-34 -112,-48 Q-118,-36 -130,-44 Z"
      fill="#f4f1e8"
      stroke={ink}
      strokeWidth="2.5"
    />
  </g>
)

// The big knife switch on the laboratory wall, its blade `thrown` from 0 (open) to 1 (closed).
export const KnifeSwitch = ({ x, y, thrown, label }: { x: number; y: number; thrown: number; label: string }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect
      x="-70"
      y="-190"
      width="140"
      height="210"
      rx="6"
      fill="#3b3f46"
      stroke={ink}
      strokeWidth="3"
      filter="url(#cut)"
    />
    <rect x="-56" y="-176" width="112" height="28" fill={paper.light} stroke={ink} strokeWidth="2" />
    <text
      y="-156"
      textAnchor="middle"
      fontFamily={font.caps}
      fontSize="15"
      fill={velvet.base}
      textLength="100"
      lengthAdjust="spacingAndGlyphs"
    >
      {label}
    </text>
    <rect x="-34" y="-30" width="20" height="30" fill="#c27a3a" stroke={ink} strokeWidth="2" />
    <rect x="14" y="-30" width="20" height="30" fill="#c27a3a" stroke={ink} strokeWidth="2" />
    <rect x="-34" y="-128" width="20" height="24" fill="#c27a3a" stroke={ink} strokeWidth="2" />
    <rect x="14" y="-128" width="20" height="24" fill="#c27a3a" stroke={ink} strokeWidth="2" />
    <g transform={`translate(0 -16) rotate(${-160 + thrown * 150})`}>
      <rect x="-30" y="-6" width="12" height="104" fill="#d9d9d9" stroke={ink} strokeWidth="2" />
      <rect x="18" y="-6" width="12" height="104" fill="#d9d9d9" stroke={ink} strokeWidth="2" />
      <rect x="-36" y="96" width="72" height="12" fill="#d9d9d9" stroke={ink} strokeWidth="2" />
      <rect x="-12" y="104" width="24" height="44" rx="10" fill={wood.dark} stroke={ink} strokeWidth="2.5" />
    </g>
  </g>
)
