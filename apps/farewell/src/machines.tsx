import { font, gold, ink, paper, velvet, wood } from "./theme"

// How big a banner is: wide enough for its longest line, a stripe of lettering per line.
const bannerSize = (lines: readonly string[]) => ({
  width: Math.max(...lines.map((line) => line.length)) * 28 + 80,
  height: 22 + lines.length * 40
})

// A banner towed or hung across the sky, its left edge at x and its middle at y.
const Banner = ({
  x,
  y,
  lines,
  color = velvet.base
}: {
  x: number
  y: number
  lines: readonly string[]
  color?: string
}) => {
  const { width, height } = bannerSize(lines)
  return (
    <g transform={`translate(${x} ${y - height / 2})`}>
      <path
        d={`M0,0 Q${width * 0.25},-8 ${width * 0.5},0 T${width},0 L${width},${height} Q${width * 0.75},${height - 8} ${width * 0.5},${height} T0,${height} Z`}
        fill={paper.light}
        stroke={ink}
        strokeWidth="3"
      />
      <path d={`M10,8 H${width - 10} M10,${height - 8} H${width - 10}`} stroke={color} strokeWidth="3" />
      {lines.map((line, i) => (
        <text
          key={line}
          x={width / 2}
          y={44 + i * 40}
          textAnchor="middle"
          fontFamily={font.poster}
          fontSize="34"
          fill={color}
          letterSpacing="1"
        >
          {line}
        </text>
      ))}
    </g>
  )
}

// A flying machine of 1910, on wires from the flies, towing a banner behind it. It flies toward the picture's left.
export const Biplane = ({
  x,
  y,
  scale = 1,
  banner,
  wires = true
}: {
  x: number
  y: number
  scale?: number
  banner?: readonly string[]
  wires?: boolean
}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    {wires ? <path d="M-40,-60 V-1200 M50,-60 V-1200" stroke={ink} strokeWidth="1.5" opacity="0.5" /> : null}
    {banner ? (
      <g>
        <path d="M150,0 Q170,8 196,0" stroke={ink} strokeWidth="2.5" fill="none" />
        <Banner x={196} y={0} lines={banner} />
      </g>
    ) : null}
    <g filter="url(#cut)">
      <path
        d="M120,-6 L150,-34 L156,-34 L148,6 Z"
        fill="#e9d7b0"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M118,2 L160,-4 L160,6 Z" fill="#e9d7b0" stroke={ink} strokeWidth="2.5" />
      <path d="M-86,-12 L136,-4 L136,6 L-86,16 Z" fill="#e9d7b0" stroke={ink} strokeWidth="2.5" />
      <path d="M-60,-10 L-20,14 L20,-8 L60,10 L100,-6" stroke={wood.dark} strokeWidth="2" fill="none" />
      <rect x="-74" y="-60" width="140" height="10" rx="5" fill="#f2e6c6" stroke={ink} strokeWidth="2.5" />
      <rect x="-64" y="18" width="120" height="9" rx="4" fill="#f2e6c6" stroke={ink} strokeWidth="2.5" />
      <path d="M-50,-50 V18 M30,-50 V18 M-50,-50 L30,18 M30,-50 L-50,18" stroke={ink} strokeWidth="2" />
      <path d="M-30,27 L-40,48 M0,27 L-6,48" stroke={ink} strokeWidth="3" />
      <circle cx="-40" cy="52" r="11" fill="#2b2420" stroke={ink} strokeWidth="2" />
      <circle cx="-6" cy="52" r="11" fill="#2b2420" stroke={ink} strokeWidth="2" />
      <ellipse cx="-92" cy="2" rx="6" ry="38" fill="#cfd5dc" opacity="0.55" stroke={ink} strokeWidth="1.5" />
      <circle cx="-90" cy="2" r="6" fill={gold.base} stroke={ink} strokeWidth="2" />
      <circle cx="0" cy="-22" r="14" fill="#f4cba3" stroke={ink} strokeWidth="2.5" />
      <path d="M-14,-24 Q-14,-40 0,-40 Q14,-40 14,-24 Z" fill="#6b4423" stroke={ink} strokeWidth="2" />
      <circle cx="-8" cy="-26" r="5" fill="#cfe9f5" stroke={gold.dark} strokeWidth="2.5" />
      <path
        d="M12,-14 Q50,-24 70,-10 Q90,4 116,-12"
        stroke="#c62828"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  </g>
)

// A striped hot-air balloon, drifting, with a banner hung under its basket.
export const AirBalloon = ({
  x,
  y,
  scale = 1,
  banner,
  colors = ["#e53935", "#fdd835"]
}: {
  x: number
  y: number
  scale?: number
  banner?: readonly string[]
  colors?: readonly [string, string]
}) => {
  const envelope =
    "M0,-260 C90,-260 120,-180 110,-120 C100,-70 50,-40 30,-10 L-30,-10 C-50,-40 -100,-70 -110,-120 C-120,-180 -90,-260 0,-260 Z"
  const size = banner ? bannerSize(banner) : undefined
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <clipPath id={`gores${x}`}>
          <path d={envelope} />
        </clipPath>
      </defs>
      <g filter="url(#cut)">
        <path d={envelope} fill={colors[0]} />
        <g clipPath={`url(#gores${x})`}>
          {[-90, -30, 30, 90].map((gx) => (
            <path
              key={gx}
              d={`M${gx - 16},-270 Q${gx * 1.25},-130 ${gx * 0.3 - 8},0 L${gx * 0.3 + 8},0 Q${gx * 1.25 + 30},-130 ${gx + 16},-270 Z`}
              fill={colors[1]}
            />
          ))}
        </g>
        <path d={envelope} fill="none" stroke={ink} strokeWidth="3" />
        <ellipse cx="-44" cy="-200" rx="22" ry="12" transform="rotate(-30 -44 -200)" fill="#fff" opacity="0.35" />
        <path d="M-30,-10 L-24,30 M30,-10 L24,30 M-10,-10 L-8,30 M10,-10 L8,30" stroke={ink} strokeWidth="2" />
        <rect x="-28" y="30" width="56" height="40" rx="4" fill={wood.light} stroke={ink} strokeWidth="2.5" />
        <path d="M-28,42 H28 M-28,54 H28 M-14,30 V70 M0,30 V70 M14,30 V70" stroke={wood.dark} strokeWidth="1.5" />
        <path d="M-28,46 Q-40,56 -36,70 Q-30,76 -26,66" fill="#c9a46b" stroke={ink} strokeWidth="2" />
      </g>
      {banner && size ? (
        <g>
          <path
            d={`M-24,70 L${-size.width / 2 + 18},136 M24,70 L${size.width / 2 - 18},136`}
            stroke={ink}
            strokeWidth="2.5"
          />
          <Banner x={-size.width / 2} y={136 + size.height / 2} lines={banner} color="#1f4d8c" />
        </g>
      ) : null}
    </g>
  )
}

// A bullet of a rocket with a name painted down its side, its nose toward `toward`.
export const Rocket = ({ label = "SKILLING", toward = "right" }: { label?: string; toward?: "left" | "right" }) => {
  const s = toward === "right" ? 1 : -1
  return (
    <g>
      <g transform={`scale(${s} 1)`}>
        <path
          d="M-70,-20 H40 Q78,-18 96,0 Q78,18 40,20 H-70 Z"
          fill="#cfd5dc"
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M52,-19 Q80,-14 96,0 Q80,14 52,19 Z"
          fill={velvet.base}
          stroke={ink}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M-70,-20 L-92,-40 L-80,-20 Z M-70,20 L-92,40 L-80,20 Z"
          fill="#6d7584"
          stroke={ink}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M-30,-20 V20 M10,-20 V20" stroke="#8a929c" strokeWidth="2" />
      </g>
      <text
        x={-14 * s}
        y="7"
        textAnchor="middle"
        fontFamily={font.poster}
        fontSize="22"
        fill={velvet.dark}
        textLength="110"
        lengthAdjust="spacingAndGlyphs"
      >
        {label}
      </text>
    </g>
  )
}

// A rocket lobbed from `from` to `to` over an arc `lift` high, `u` of the way along, its nose along its path.
export const RocketFlight = ({
  from,
  to,
  lift,
  u,
  scale = 1,
  label
}: {
  from: readonly [number, number]
  to: readonly [number, number]
  lift: number
  u: number
  scale?: number
  label?: string
}) => {
  const [x0, y0] = from
  const [x1, y1] = to
  const x = x0 + (x1 - x0) * u
  const y = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * lift
  const heading = (Math.atan2(y1 - y0 - Math.cos(u * Math.PI) * Math.PI * lift, x1 - x0) * 180) / Math.PI
  // Flown nose-left when heading left, so the name down its side never reads upside down.
  const left = Math.abs(heading) > 90
  return (
    <g transform={`translate(${x} ${y}) rotate(${left ? heading - 180 : heading}) scale(${scale})`}>
      <Rocket label={label} toward={left ? "left" : "right"} />
    </g>
  )
}

// The moon of the old trick films, a face in the sky; `hit` sticks a rocket in its eye.
export const Moon = ({ x, y, r = 110, hit = false }: { x: number; y: number; r?: number; hit?: boolean }) => (
  <g transform={`translate(${x} ${y}) scale(${r / 110})`}>
    <g filter="url(#cut)">
      <circle r="110" fill="#f3ebd2" stroke={ink} strokeWidth="3" />
      <circle r="110" fill="url(#hatch)" opacity="0.12" />
      {[
        [-50, -60, 14],
        [58, 54, 18],
        [-66, 40, 10],
        [20, -78, 9]
      ].map(([cx = 0, cy = 0, cr = 0]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={cr} fill="#e2d6b4" stroke={ink} strokeWidth="1.5" />
      ))}
      <path d="M-46,-20 Q-30,-32 -14,-20" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="-30" cy="-12" r="6" fill={ink} />
      <path d="M-2,-6 Q8,18 -6,26" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path
        d={hit ? "M-36,50 Q-24,40 -12,50 Q0,60 12,48 Q24,38 34,50" : "M-34,48 Q0,32 30,50"}
        stroke={ink}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {hit ? null : (
        <g>
          <path d="M14,-22 Q30,-34 46,-22" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="30" cy="-12" r="6" fill={ink} />
        </g>
      )}
    </g>
    {hit ? (
      <g>
        <path
          d="M4,-14 Q4,-40 26,-38 Q40,-50 50,-34 Q66,-26 56,-10 Q60,8 40,8 Q26,20 14,6 Q-6,4 4,-14 Z"
          fill="#fffdf6"
          stroke={ink}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="-4" cy="14" r="4" fill="#fffdf6" stroke={ink} strokeWidth="1.5" />
        <circle cx="62" cy="10" r="3" fill="#fffdf6" stroke={ink} strokeWidth="1.5" />
        <g transform="translate(98 -80) rotate(-45)">
          <Rocket toward="left" />
        </g>
      </g>
    ) : null}
  </g>
)

// Torus, where everything moved for security's sake: a fortified doughnut with a portcullis and a password.
export const Torus = ({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <g filter="url(#cut)">
      <ellipse cx="0" cy="-120" rx="300" ry="130" fill="#d9995a" stroke={ink} strokeWidth="3" />
      <path d="M-300,-120 Q-300,-30 0,-10 Q300,-30 300,-120" fill="url(#hatch)" opacity="0.2" />
      <path
        d="M-286,-150 Q-280,-246 0,-250 Q280,-246 286,-150 Q270,-128 250,-150 Q232,-110 206,-140 Q180,-104 150,-132 Q110,-96 70,-126 Q30,-92 -10,-124 Q-50,-92 -90,-126 Q-130,-98 -170,-134 Q-206,-108 -230,-142 Q-260,-120 -286,-150 Z"
        fill="#f48fb1"
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="0" cy="-176" rx="92" ry="32" fill="#2a1a10" stroke={ink} strokeWidth="3" />
      {[
        { sx: -200, sy: -200, color: "#64b5f6", angle: 20 },
        { sx: -140, sy: -226, color: "#fff176", angle: -30 },
        { sx: -60, sy: -232, color: "#81c784", angle: 60 },
        { sx: 70, sy: -230, color: "#fff", angle: -10 },
        { sx: 150, sy: -214, color: "#64b5f6", angle: 40 },
        { sx: 220, sy: -186, color: "#ffb74d", angle: -50 },
        { sx: -230, sy: -168, color: "#fff", angle: 70 },
        { sx: 120, sy: -150, color: "#81c784", angle: 10 },
        { sx: -120, sy: -150, color: "#ffb74d", angle: -20 }
      ].map(({ sx, sy, color, angle }) => (
        <rect
          key={`${sx}${sy}`}
          x={sx}
          y={sy}
          width="18"
          height="6"
          rx="3"
          fill={color}
          stroke={ink}
          strokeWidth="1.2"
          transform={`rotate(${angle} ${sx} ${sy})`}
        />
      ))}
      {[-240, -160, -80, 0, 80, 160, 240].map((bx) => (
        <rect
          key={bx}
          x={bx - 16}
          y={-262 + Math.abs(bx) * 0.12}
          width="32"
          height="26"
          fill="#9aa0a8"
          stroke={ink}
          strokeWidth="2.5"
        />
      ))}
      <path d="M-70,-10 V-90 Q0,-140 70,-90 V-10 Z" fill="#2a1a10" stroke={ink} strokeWidth="3" />
      <path
        d="M-56,-14 V-84 M-28,-14 V-112 M0,-14 V-118 M28,-14 V-112 M56,-14 V-84 M-66,-40 H66 M-68,-70 H68 M-50,-100 H50"
        stroke="#8d939b"
        strokeWidth="5"
      />
      <path d="M-16,-66 V-80 Q0,-100 16,-80 V-66" stroke="#c9ced6" strokeWidth="7" fill="none" />
      <path d="M-16,-66 V-80 Q0,-100 16,-80 V-66" stroke={ink} strokeWidth="2" fill="none" />
      <rect x="-26" y="-68" width="52" height="44" rx="6" fill={gold.base} stroke={ink} strokeWidth="2.5" />
      <circle cx="0" cy="-50" r="6" fill={ink} />
      <path d="M-3,-48 L-5,-34 H5 L3,-48 Z" fill={ink} />
      <line x1="-150" y1="-246" x2="-150" y2="-330" stroke={ink} strokeWidth="4" />
      <path d="M-150,-330 L-80,-314 L-150,-298 Z" fill={velvet.base} stroke={ink} strokeWidth="2.5" />
      <line x1="150" y1="-246" x2="150" y2="-330" stroke={ink} strokeWidth="4" />
      <path d="M150,-330 L220,-314 L150,-298 Z" fill={velvet.base} stroke={ink} strokeWidth="2.5" />
    </g>
    <g transform="translate(190 -40) rotate(4)" filter="url(#cut)">
      <rect x="-100" y="-50" width="200" height="100" fill={paper.light} stroke={ink} strokeWidth="3" />
      <text y="-8" textAnchor="middle" fontFamily={font.title} fontSize="38" fill={ink}>
        TORUS
      </text>
      <text y="30" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="22" fill={velvet.dark}>
        Please sign in again
      </text>
    </g>
  </g>
)

// A rack of servers on castors, lights blinking.
export const ServerRack = ({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} filter="url(#cut)">
    <rect x="-46" y="-190" width="92" height="180" rx="4" fill="#2e3440" stroke={ink} strokeWidth="3" />
    {[-174, -144, -114, -84, -54].map((sy, i) => (
      <g key={sy}>
        <rect x="-38" y={sy} width="76" height="24" rx="2" fill="#3b4252" stroke={ink} strokeWidth="1.5" />
        <circle cx="-26" cy={sy + 12} r="3.5" fill={i % 2 === 0 ? "#7cff8a" : "#ffcf5a"} />
        <circle cx="-15" cy={sy + 12} r="3.5" fill="#5fd4ff" />
        <path d={`M0,${sy + 8} H30 M0,${sy + 16} H30`} stroke="#5a6375" strokeWidth="2" />
      </g>
    ))}
    <circle cx="-34" cy="-2" r="8" fill="#1b1f27" stroke={ink} strokeWidth="2" />
    <circle cx="34" cy="-2" r="8" fill="#1b1f27" stroke={ink} strokeWidth="2" />
  </g>
)
