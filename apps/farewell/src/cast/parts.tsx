import { type ReactNode, useContext } from "react"
import { Song } from "../song"
import { ink } from "../theme"
import { type Voice, voiceAt } from "../voice"
import type { Bend, Build, Stride } from "../walk"

type Point = { x: number; y: number }
export type Curve = readonly [Point, Point, Point, Point]

const along = ([a, b, c, d]: Curve, t: number) => {
  const u = 1 - t
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y
  }
}

// A tentacle along joined Bézier curves, `from` wide at the root and narrowing to `to` at the tip, with a row of
// suckers down one side if it has them.
export const Tentacle = ({
  curves,
  from,
  to,
  fill,
  suckers
}: {
  curves: readonly Curve[]
  from: number
  to: number
  fill: string
  suckers?: string
}) => {
  const steps = 16
  const spine = curves.flatMap((curve, c) =>
    Array.from({ length: c === curves.length - 1 ? steps + 1 : steps }, (_, i) => along(curve, i / steps))
  )
  const last = spine.length - 1
  const edges = spine.map((point, i) => {
    const before = spine[Math.max(0, i - 1)] ?? point
    const after = spine[Math.min(last, i + 1)] ?? point
    const length = Math.hypot(after.x - before.x, after.y - before.y) || 1
    const half = (from + ((to - from) * i) / last) / 2
    const nx = -(after.y - before.y) / length
    const ny = (after.x - before.x) / length
    return {
      left: { x: point.x + nx * half, y: point.y + ny * half },
      right: { x: point.x - nx * half, y: point.y - ny * half },
      nx,
      ny,
      half
    }
  })
  const outline = [...edges.map(({ left }) => left), ...edges.map(({ right }) => right).reverse()]
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" L")
  return (
    <g>
      <path d={`M${outline} Z`} fill={fill} stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
      {suckers
        ? edges
            .filter((_, i) => i % 4 === 2 && i < last - 4)
            .map(({ right, nx, ny, half }) => (
              <circle
                key={`${right.x}-${right.y}`}
                cx={right.x + nx * half * 0.45}
                cy={right.y + ny * half * 0.45}
                r={Math.max(1.5, half * 0.32)}
                fill={suckers}
              />
            ))
        : null}
    </g>
  )
}

// A white cartoon glove, fingers pointing down the arm.
export const Glove = ({ open = false }: { open?: boolean }) => (
  <g>
    {open ? (
      <path
        d="M-13,0 Q-16,14 -12,22 L-14,36 Q-12,40 -8,36 L-6,26 L-5,40 Q-1,44 2,40 L2,27 L6,39 Q10,42 12,37 L9,25 L14,32 Q18,34 18,29 L12,16 Q13,4 8,-2 Z"
        fill="#fff"
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    ) : (
      <g>
        <ellipse cx="0" cy="10" rx="14" ry="15" fill="#fff" stroke={ink} strokeWidth="3" />
        <ellipse
          cx="-12"
          cy="4"
          rx="6"
          ry="10"
          transform="rotate(-28 -12 4)"
          fill="#fff"
          stroke={ink}
          strokeWidth="3"
        />
        <path d="M-3,16 V23 M4,16 V24 M10,13 V20" stroke={ink} strokeWidth="2" />
      </g>
    )}
    <path d="M-11,-2 H11" stroke={ink} strokeWidth="2" />
  </g>
)

type ArmProps = {
  x: number
  y: number
  // -1 for the arm on the picture's left, 1 for the right.
  side: -1 | 1
  // Swing away from the body at the shoulder, and bend at the elbow, in degrees. 0 hangs straight down.
  swing: number
  bend?: number
  sleeve: string
  cuff?: string
  length?: number
  open?: boolean
  children?: ReactNode
}

// An arm on a split pin at the shoulder and another at the elbow, the way a paper cut-out's limbs swing.
export const Arm = ({ x, y, side, swing, bend = 0, sleeve, cuff = "#fff", length = 60, open, children }: ArmProps) => (
  <g transform={`translate(${x} ${y}) rotate(${-side * swing})`}>
    <path
      d={`M-12,-6 Q-15,${length / 2} -11,${length + 4} L11,${length + 4} Q15,${length / 2} 12,-6 Z`}
      fill={sleeve}
      stroke={ink}
      strokeWidth="3"
    />
    <g transform={`translate(0 ${length}) rotate(${-side * bend})`}>
      <path d={`M-11,-2 L-10,${length - 6} L10,${length - 6} L11,-2 Z`} fill={sleeve} stroke={ink} strokeWidth="3" />
      <rect x="-12" y={length - 12} width="24" height="10" fill={cuff} stroke={ink} strokeWidth="2.5" />
      <g transform={`translate(0 ${length})`}>
        {children}
        <Glove open={open} />
      </g>
      <circle cx="0" cy="0" r="3" fill="#c9a24a" stroke={ink} strokeWidth="1" />
    </g>
    <circle cx="0" cy="0" r="3.5" fill="#c9a24a" stroke={ink} strokeWidth="1" />
  </g>
)

type LegProps = {
  x: number
  y: number
  swing: number
  // Bend at the knee, folding the shin back from the toes, and the toe tipped up at the ankle, in degrees.
  knee?: number
  ankle?: number
  trousers: string
  shoe: string
  length?: number
  facing?: 1 | -1
  // For jeans: the stitched seam down the outside, and the hem rolled up into a cuff.
  seam?: string
  turnup?: string
  // For dress uniform: a stripe down the outside seam.
  stripe?: string
  // A trainer's rubber sole.
  sole?: string
}

// A leg pinned at the hip and hinged at the knee, halfway down to the ankle at the top of the shoe; positive swing
// kicks it forward, toward where the shoe points. Drawn pointing right and mirrored to face left.
export const Leg = ({
  x,
  y,
  swing,
  knee = 0,
  ankle = 0,
  trousers,
  shoe,
  length = 150,
  facing = 1,
  seam,
  turnup,
  stripe,
  sole
}: LegProps) => {
  const heel = length - 12
  const hinge = heel / 2
  const fold = (Math.min(140, Math.max(0, knee)) * Math.PI) / 180
  // A point on the shin, measured from the knee, where it lands on the leg.
  const shin = (across: number, down: number) =>
    `${(across * Math.cos(fold) - down * Math.sin(fold)).toFixed(2)},${(hinge + across * Math.sin(fold) + down * Math.cos(fold)).toFixed(2)}`
  const width = 17 - (3 * (hinge + 4)) / (length - 4)
  const stitch = 12.5 - (2 * (hinge - 2)) / (length - 30)
  // A line down the outside of the leg, `inset` in from the seam, round the knee and on down to `bottom`.
  const outside = (inset: number, bottom: number) =>
    `M${12.5 - inset},2 L${stitch - inset},${hinge} A${stitch - inset} ${stitch - inset} 0 0 1 ${shin(stitch - inset, 0)} L${shin(10.5 - inset, bottom - hinge)}`
  return (
    <g transform={`translate(${x} ${y}) scale(${facing} 1) rotate(${-swing})`}>
      <path
        d={`M-17,-4 L17,-4 L${width},${hinge} A${width} ${width} 0 0 1 ${shin(width, 0)} L${shin(14, length - 8 - hinge)} L${shin(-14, length - 8 - hinge)} L${-width},${hinge - width * Math.tan(fold / 2)} Z`}
        fill={trousers}
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {seam ? (
        <path d={outside(0, length - 28)} stroke={seam} strokeWidth="1.6" strokeDasharray="4 3" fill="none" />
      ) : null}
      {stripe ? <path d={outside(3, length - 10)} stroke={stripe} strokeWidth="4" fill="none" /> : null}
      <g transform={`translate(0 ${hinge}) rotate(${(fold * 180) / Math.PI})`}>
        {turnup ? (
          <path
            d={`M-16.5,${length - 28 - hinge} H16.5 L15.5,${length - 8 - hinge} H-15.5 Z`}
            fill={turnup}
            stroke={ink}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        ) : null}
        <g transform={`translate(0 ${heel - hinge}) rotate(${-ankle})`}>
          <path
            d="M-12,0 Q6,-10 34,8 Q38,20 22,20 L-16,20 Q-20,12 -12,0 Z"
            fill={shoe}
            stroke={ink}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {sole ? <path d="M-15,16 H27" stroke={sole} strokeWidth="5" strokeLinecap="round" /> : null}
          <path d="M8,6 Q20,4 28,11" stroke="#fff" strokeWidth="2" opacity="0.45" fill="none" />
        </g>
      </g>
      <circle cx="0" cy="0" r="3.5" fill="#c9a24a" stroke={ink} strokeWidth="1" />
    </g>
  )
}

type LegsProps = Omit<LegProps, "x" | "y" | "swing" | "knee" | "ankle" | "facing" | "length"> & {
  build: Build
  // Kick at each hip standing still, in degrees.
  swingL?: number
  swingR?: number
  stride?: Stride
}

// A pair of legs on `build`, bent to a stride from `walk` or kicked from the hips, the nearer one drawn last.
export const Legs = ({ build, swingL = 0, swingR = 0, stride, ...look }: LegsProps) => {
  const bends: Bend[] = stride
    ? [stride.left, stride.right]
    : [
        { hip: -build.spread, facing: -1, swing: swingL, knee: 0, ankle: 0 },
        { hip: build.spread, facing: 1, swing: swingR, knee: 0, ankle: 0 }
      ]
  const legs = bends.map((leg) => (
    <Leg
      key={leg.hip < 0 ? "left" : "right"}
      x={leg.hip}
      y={-build.hip}
      swing={leg.swing}
      knee={leg.knee}
      ankle={leg.ankle}
      facing={leg.facing}
      length={2 * build.bone + 12}
      {...look}
    />
  ))
  return <g>{stride?.near === -1 ? [...legs].reverse() : legs}</g>
}

// A thin ink leg bent to `leg`: thigh and shin `bone` long, a knee between them, and `foot` at the ankle, toes along +x.
export const ThinLeg = ({
  y,
  bone,
  leg,
  width = 7,
  foot
}: {
  y: number
  bone: number
  leg: Bend
  width?: number
  foot: ReactNode
}) => {
  const line = `M0,0 Q${bone * 0.1},${bone / 2} 0,${bone}`
  return (
    <g transform={`translate(${leg.hip} ${y}) scale(${leg.facing} 1) rotate(${-leg.swing})`}>
      <path d={line} stroke={ink} strokeWidth={width} fill="none" strokeLinecap="round" />
      <g transform={`translate(0 ${bone}) rotate(${leg.knee})`}>
        <path d={line} stroke={ink} strokeWidth={width} fill="none" strokeLinecap="round" />
        <g transform={`translate(0 ${bone}) rotate(${-leg.ankle})`}>{foot}</g>
      </g>
    </g>
  )
}

export type Mouth = "smile" | "sing" | "o" | "flat" | "grin" | "sad"

// A mouth for a face drawn in ink, centred on (x, y). A singing mouth follows the vocal through the song, shaped by
// each syllable, and rests in a smile between words; given a `voice`, any mouth sings it and rests as itself.
export const MouthShape = ({
  x,
  y,
  mouth,
  size = 1,
  voice
}: {
  x: number
  y: number
  mouth: Mouth
  size?: number
  voice?: Voice
}) => {
  const t = useContext(Song)
  const sung = voice ?? (mouth === "sing" && t !== undefined ? voiceAt(t) : undefined)
  const s = size
  if (sung && sung.open > 0.12) {
    const rx = (sung.round ? 7.5 : 11) * s
    return (
      <g transform={`translate(${x} ${y})`}>
        <ellipse
          cx="0"
          cy={4 * sung.open * s}
          rx={rx}
          ry={(2.5 + 11.5 * sung.open) * s}
          fill="#5a1414"
          stroke={ink}
          strokeWidth="2.5"
        />
        {sung.open > 0.45 ? (
          <ellipse cx="0" cy={(4 + 8 * sung.open) * s} rx={rx * 0.55} ry={4 * sung.open * s} fill="#d9605a" />
        ) : null}
      </g>
    )
  }
  if (sung && mouth === "sing") {
    return <MouthShape x={x} y={y} mouth="smile" size={size} />
  }
  if (mouth === "sing") {
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <ellipse cx="0" cy="4" rx="11" ry="14" fill="#5a1414" stroke={ink} strokeWidth="2.5" />
        <ellipse cx="0" cy="12" rx="6" ry="4" fill="#d9605a" />
      </g>
    )
  }
  if (mouth === "o") {
    return <ellipse cx={x} cy={y + 2} rx={6 * s} ry={7 * s} fill="#5a1414" stroke={ink} strokeWidth="2.5" />
  }
  if (mouth === "flat") {
    return <path d={`M${x - 10 * s},${y} H${x + 10 * s}`} stroke={ink} strokeWidth="3" strokeLinecap="round" />
  }
  if (mouth === "sad") {
    return (
      <path
        d={`M${x - 11 * s},${y + 5 * s} Q${x},${y - 6 * s} ${x + 11 * s},${y + 5 * s}`}
        stroke={ink}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    )
  }
  if (mouth === "grin") {
    return (
      <g>
        <path
          d={`M${x - 16 * s},${y - 3 * s} Q${x},${y + 18 * s} ${x + 16 * s},${y - 3 * s} Z`}
          fill="#fff"
          stroke={ink}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d={`M${x - 14 * s},${y + 1 * s} H${x + 14 * s}`} stroke={ink} strokeWidth="1.5" />
      </g>
    )
  }
  return (
    <path
      d={`M${x - 13 * s},${y - 2 * s} Q${x},${y + 11 * s} ${x + 13 * s},${y - 2 * s}`}
      stroke={ink}
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
    />
  )
}

// Two round eyes with a glint, looking toward (lookX, lookY) from their middles.
export const Eyes = ({
  x,
  y,
  gap,
  r,
  look = { x: 0, y: 0 },
  white = true
}: {
  x: number
  y: number
  gap: number
  r: number
  look?: { x: number; y: number }
  white?: boolean
}) => (
  <g>
    {[-1, 1].map((side) => (
      <g key={side} transform={`translate(${x + (side * gap) / 2} ${y})`}>
        {white ? <ellipse rx={r} ry={r * 1.15} fill="#fff" stroke={ink} strokeWidth="2.5" /> : null}
        <circle cx={look.x * r * 0.4} cy={look.y * r * 0.4} r={white ? r * 0.5 : r} fill={ink} />
        <circle cx={look.x * r * 0.4 - r * 0.18} cy={look.y * r * 0.4 - r * 0.2} r={r * 0.17} fill="#fff" />
      </g>
    ))}
  </g>
)
