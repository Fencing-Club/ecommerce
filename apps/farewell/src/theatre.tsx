import { type ReactNode, useContext } from "react"
import { Easing, random } from "remotion"
import { Glove } from "./cast/parts"
import { mix, ramp, shake } from "./motion"
import { Song } from "./song"
import { font, gold, ink, paper, velvet, wood } from "./theme"
import { changes, meter, parts, tokenRate, tokensAt } from "./timeline"

// How far down the lights are for a quick change at `t`: snapped down just before it and brought back up after.
const blink = (t: number) =>
  Math.max(0, ...changes.map((at) => (t < at ? 1 - (at - t) / 0.06 : 1 - (t - at) / 0.16))) * 0.45

// The proscenium opening: x 150 to 1770, the top at 140 and the apron's edge at 905, with the camera at home.
const openingPath = "M150,905 V250 Q150,140 260,140 H1660 Q1770,140 1770,250 V905 Z"

// Inside the opening, down to the apron's edge, so nothing on stage spills over the gilt.
export const StageClip = () => (
  <clipPath id="stageClip">
    <path d="M150,990 V250 Q150,140 260,140 H1660 Q1770,140 1770,250 V990 Z" />
  </clipPath>
)

// The auditorium's front wall: red damask with the proscenium cut out of it, and darker away from the stage.
const Wall = () => (
  <g>
    <path d={`M-900,-600 H2820 V1700 H-900 Z ${openingPath}`} fill="url(#damask)" fillRule="evenodd" />
    <path
      d={`M-900,-600 H2820 V1700 H-900 Z ${openingPath}`}
      fill="url(#wallDim)"
      fillRule="evenodd"
      style={{ mixBlendMode: "multiply" }}
    />
  </g>
)

const beads = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)

// A rosette of eight petals, for the arch's corners.
const Rosette = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <g transform={`translate(${x} ${y})`}>
    {beads(0, 315, 45).map((angle) => (
      <ellipse
        key={angle}
        cx="0"
        cy={-r * 0.55}
        rx={r * 0.28}
        ry={r * 0.5}
        transform={`rotate(${angle})`}
        fill={gold.light}
        stroke={gold.deep}
        strokeWidth="2"
      />
    ))}
    <circle r={r * 0.32} fill={gold.base} stroke={gold.deep} strokeWidth="2.5" />
  </g>
)

// The gilt frame around the opening: mouldings, a row of beads, fluted pilasters and a frieze along the top.
const Arch = () => (
  <g>
    <path
      d={`M40,985 V210 Q40,28 230,28 H1690 Q1880,28 1880,210 V985 Z ${openingPath}`}
      fill="url(#goldMetal)"
      fillRule="evenodd"
      stroke={gold.deep}
      strokeWidth="5"
    />
    <path
      d="M58,985 V214 Q58,46 232,46 H1688 Q1862,46 1862,214 V985"
      fill="none"
      stroke={gold.light}
      strokeWidth="3"
      opacity="0.8"
    />
    <path
      d="M128,905 V246 Q128,118 256,118 H1664 Q1792,118 1792,246 V905"
      fill="none"
      stroke={gold.deep}
      strokeWidth="7"
    />
    {beads(268, 1652, 26).map((x) => (
      <circle key={`t${x}`} cx={x} cy="129" r="6" fill={gold.light} stroke={gold.deep} strokeWidth="1.5" />
    ))}
    {beads(262, 892, 26).flatMap((y) => [
      <circle key={`l${y}`} cx="139" cy={y} r="6" fill={gold.light} stroke={gold.deep} strokeWidth="1.5" />,
      <circle key={`r${y}`} cx="1781" cy={y} r="6" fill={gold.light} stroke={gold.deep} strokeWidth="1.5" />
    ])}
    {[0, 1].map((side) => (
      <g key={side} transform={side === 1 ? "translate(1920 0) scale(-1 1)" : undefined}>
        <rect x="62" y="262" width="52" height="690" fill="url(#goldSide)" stroke={gold.deep} strokeWidth="3" />
        {beads(72, 104, 8).map((x) => (
          <line key={x} x1={x} y1="276" x2={x} y2="938" stroke={gold.deep} strokeWidth="2.5" opacity="0.7" />
        ))}
        <path d="M54,262 H122 L114,232 H62 Z" fill={gold.base} stroke={gold.deep} strokeWidth="3" />
        <path d="M54,952 H122 V985 H54 Z" fill={gold.base} stroke={gold.deep} strokeWidth="3" />
        <Rosette x={88} y={176} r={34} />
      </g>
    ))}
    {[
      [270, 690],
      [1230, 1650]
    ].map(([from = 0, to = 0]) => (
      <g key={from}>
        {beads(from, to - 70, 70).map((x) => (
          <g key={x}>
            <path
              d={`M${x + 8},62 Q${x + 35},104 ${x + 62},62`}
              stroke={gold.deep}
              strokeWidth="9"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M${x + 8},62 Q${x + 35},104 ${x + 62},62`}
              stroke={gold.light}
              strokeWidth="4"
              fill="none"
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          </g>
        ))}
        {beads(from, to, 70).map((x) => (
          <circle key={x} cx={x} cy="60" r="9" fill={gold.light} stroke={gold.deep} strokeWidth="2.5" />
        ))}
      </g>
    ))}
  </g>
)

const wheels = 8
// Where each odometer wheel's window starts, the wheels in twos and threes like the digits of 99,999,999.
const wheelX = (i: number) => 815 + i * 34 + (i >= 2 ? 12 : 0) + (i >= 5 ? 12 : 0)

// One wheel of the odometer, `roll` of the way on to its next digit; spinning too fast to read, it blurs.
const Wheel = ({ i, digit, roll, spinning }: { i: number; digit: number; roll: number; spinning: boolean }) => {
  const x = wheelX(i)
  return (
    <g>
      <clipPath id={`wheel${i}`}>
        <rect x={x} y="66" width="28" height="48" rx="4" />
      </clipPath>
      <rect x={x} y="66" width="28" height="48" rx="4" fill="url(#odometer)" stroke="#000" strokeWidth="1.5" />
      <g clipPath={`url(#wheel${i})`} filter={spinning ? "url(#spin)" : undefined}>
        {[-1, 0, 1].map((k) => (
          <text
            key={k}
            x={x + 14}
            y={101 + (k - roll) * 48}
            textAnchor="middle"
            fontFamily={font.sans}
            fontWeight="700"
            fontSize="30"
            fill="#f7f1e1"
          >
            {(digit + k + 10) % 10}
          </text>
        ))}
      </g>
    </g>
  )
}

// A coiled spring from (x, y) up to `length` long, leaning by `lean` degrees.
const Coil = ({
  x,
  y,
  length,
  lean,
  width = 14
}: {
  x: number
  y: number
  length: number
  lean: number
  width?: number
}) => (
  <path
    transform={`translate(${x} ${y}) rotate(${lean})`}
    d={`M0,0 ${Array.from({ length: 9 }, (_, k) => `L${k % 2 === 0 ? width : -width},${(-(k + 1) * length) / 9}`).join(" ")}`}
    fill="none"
    stroke="#c9ced6"
    strokeWidth="5"
    strokeLinejoin="round"
  />
)

// The parts that fly out when the meter bursts.
const debris = Array.from({ length: 36 }, (_, i) => ({
  angle: -Math.PI * (0.06 + random(`da${i}`) * 0.88),
  speed: 520 + random(`dv${i}`) * 900,
  spin: (random(`ds${i}`) - 0.5) * 1400,
  kind: (["spring", "bolt", "cog", "wheel", "shard", "shard"] as const)[i % 6] ?? "shard"
}))

const Part = ({ kind, i }: { kind: (typeof debris)[number]["kind"]; i: number }) => {
  if (kind === "spring") {
    return <Coil x={0} y={22} length={44} lean={0} width={9} />
  }
  if (kind === "bolt") {
    return (
      <g>
        <path d="M-12,-7 L0,-14 L12,-7 V7 L0,14 L-12,7 Z" fill="#9aa3ad" stroke={ink} strokeWidth="2" />
        <circle r="5" fill="#3a3f46" />
      </g>
    )
  }
  if (kind === "cog") {
    return (
      <g>
        {Array.from({ length: 8 }, (_, k) => (
          <rect
            key={k}
            x="-4"
            y="-21"
            width="8"
            height="10"
            fill={gold.base}
            stroke={ink}
            strokeWidth="1.5"
            transform={`rotate(${k * 45})`}
          />
        ))}
        <circle r="14" fill={gold.base} stroke={ink} strokeWidth="2" />
        <circle r="5" fill="#1d120b" />
      </g>
    )
  }
  if (kind === "wheel") {
    return (
      <g>
        <rect x="-14" y="-24" width="28" height="48" rx="4" fill="url(#odometer)" stroke="#000" strokeWidth="1.5" />
        <text y="11" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="30" fill="#f7f1e1">
          {i % 3 === 0 ? 0 : 9}
        </text>
      </g>
    )
  }
  return <path d="M-14,-10 L16,-4 L-2,14 Z" fill="#cfe9f5" stroke="#8fb3c6" strokeWidth="1.5" opacity="0.8" />
}

// The house's brass odometer, the crest above the stage: every token the show spends, rolling faster and faster.
// With every wheel on 9 it strains and shakes, then bursts into springs, bolts, cogs, wheels and glass, and from then on
// it hangs there wrecked and smoking.
const TokenMeter = () => {
  const song = useContext(Song) ?? 0
  const value = tokensAt(song)
  const rate = tokenRate(song)
  const digits = Array.from({ length: wheels }, (_, i) => Math.floor(value / 10 ** (wheels - 1 - i)) % 10)
  // A wheel rolls on only while every wheel to its right is rolling over from 9.
  const rolls = digits.reduceRight<number[]>((acc, _, i) => {
    if (i === wheels - 1) {
      return [value % 1]
    }
    return [digits[i + 1] === 9 ? (acc[0] ?? 0) : 0, ...acc]
  }, [])
  const straining = song >= meter.full && song < meter.burst
  const wrecked = song >= meter.burst
  const age = song - meter.burst
  return (
    <g>
      <defs>
        <filter id="spin" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="0 6" />
        </filter>
      </defs>
      <g transform={straining ? `translate(${shake(song, 5)} ${shake(song + 1, 3)})` : undefined}>
        <path
          d="M700,40 Q700,16 736,16 H1184 Q1220,16 1220,40 V112 Q1220,138 1184,138 H736 Q700,138 700,112 Z"
          fill="url(#goldMetal)"
          stroke={gold.deep}
          strokeWidth="5"
        />
        <circle cx="694" cy="77" r="22" fill={gold.base} stroke={gold.deep} strokeWidth="4" />
        <circle cx="1226" cy="77" r="22" fill={gold.base} stroke={gold.deep} strokeWidth="4" />
        <rect x="722" y="30" width="476" height="96" rx="10" fill="#1d120b" stroke={gold.deep} strokeWidth="3" />
        <g transform={wrecked ? "rotate(9 840 50)" : undefined}>
          <text
            x="960"
            y="57"
            textAnchor="middle"
            fontFamily={font.caps}
            fontSize="25"
            letterSpacing="4"
            fill={gold.light}
          >
            Tokens Consumed
          </text>
        </g>
        {wrecked ? (
          <g>
            <Wheel i={0} digit={9} roll={0} spinning={false} />
            <g transform="rotate(16 873 90)">
              <Wheel i={1} digit={9} roll={0} spinning={false} />
            </g>
            <g transform={`rotate(${38 + Math.sin(age * 4) * 24 * Math.exp(-age * 0.4)} 1006 70)`}>
              <path d="M1006,70 V96" stroke="#9aa3ad" strokeWidth="2" />
              <Wheel i={5} digit={9} roll={0} spinning={false} />
            </g>
            <Wheel i={7} digit={9} roll={0} spinning={false} />
            <path
              d="M760,66 L776,78 L768,92 L784,112 M1150,66 L1136,80 L1146,96 L1130,114"
              stroke="#cfe9f5"
              strokeWidth="2.5"
              fill="none"
              opacity="0.7"
            />
            <Coil
              x={938}
              y={112}
              length={86 + Math.sin(age * 15) * 32 * Math.exp(-age * 1.5)}
              lean={-12 + Math.sin(age * 9) * 8 * Math.exp(-age)}
            />
            {[0, 1, 2, 3].map((k) => {
              const rise = (age * 0.6 + k / 4) % 1
              return (
                <circle
                  key={k}
                  cx={940 + k * 18 + Math.sin(rise * 6 + k) * 16}
                  cy={66 - rise * 150}
                  r={16 + rise * 38}
                  fill="#6b6b70"
                  opacity={0.55 * (1 - rise)}
                />
              )
            })}
          </g>
        ) : (
          <g>
            {digits.map((digit, i) => (
              <g key={i}>
                {i === 2 || i === 5 ? (
                  <text
                    x={wheelX(i) - 9}
                    y="110"
                    textAnchor="middle"
                    fontFamily={font.sans}
                    fontSize="26"
                    fill={gold.light}
                  >
                    ,
                  </text>
                ) : null}
                <Wheel i={i} digit={digit} roll={rolls[i] ?? 0} spinning={rate / 10 ** (wheels - 1 - i) > 12} />
              </g>
            ))}
            {straining && song > meter.full + 0.15 ? (
              <path d="M846,70 L872,86 L862,98 L900,114" stroke="#fff" strokeWidth="2" fill="none" opacity="0.8" />
            ) : null}
          </g>
        )}
      </g>
      {wrecked && age < 0.35 ? (
        <circle cx="960" cy="77" r={60 + age * 900} fill="#fff6d0" opacity={0.9 * (1 - age / 0.35)} />
      ) : null}
      {wrecked && age < 2.6
        ? debris.map(({ angle, speed, spin, kind }, i) => (
            <g
              key={i}
              transform={`translate(${960 + Math.cos(angle) * speed * age} ${77 + Math.sin(angle) * speed * age + 1100 * age * age}) rotate(${spin * age})`}
            >
              <Part kind={kind} i={i} />
            </g>
          ))
        : null}
    </g>
  )
}

// One swag of the pelmet between two points, with its folds and a gold fringe.
const Swag = ({ from, to, depth }: { from: number; to: number; depth: number }) => {
  const mid = (from + to) / 2
  return (
    <g>
      <path d={`M${from},128 Q${mid},${128 + depth * 2} ${to},128 Z`} fill={velvet.base} />
      <path d={`M${from},128 Q${mid},${128 + depth * 2} ${to},128 Z`} fill="url(#velvetShade)" opacity="0.7" />
      {[0.35, 0.6, 0.82].map((k) => (
        <path
          key={k}
          d={`M${from + 12},130 Q${mid},${128 + depth * 2 * k} ${to - 12},130`}
          fill="none"
          stroke={velvet.dark}
          strokeWidth="5"
          opacity="0.7"
        />
      ))}
      <path
        d={`M${from},128 Q${mid},${128 + depth * 2} ${to},128`}
        fill="none"
        stroke={gold.base}
        strokeWidth="18"
        strokeDasharray="3 4"
      />
      <path
        d={`M${from + 6},134 Q${mid},${124 + depth * 2} ${to - 6},134`}
        fill="none"
        stroke={gold.dark}
        strokeWidth="4"
      />
    </g>
  )
}

const Tassel = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <line x1="0" y1="-30" x2="0" y2="0" stroke={gold.dark} strokeWidth="5" />
    <circle cy="6" r="11" fill={gold.base} stroke={gold.deep} strokeWidth="2.5" />
    <path d="M-12,14 L12,14 L18,70 L-18,70 Z" fill={gold.base} stroke={gold.deep} strokeWidth="2.5" />
    {beads(-12, 12, 6).map((dx) => (
      <line key={dx} x1={dx} y1="20" x2={dx * 1.4} y2="68" stroke={gold.deep} strokeWidth="1.5" />
    ))}
  </g>
)

// The pelmet across the top of the opening: a band of velvet and five swags, tassels between them.
const Valance = () => {
  const edges = beads(150, 1770, 324)
  return (
    <g>
      <rect x="150" y="118" width="1620" height="58" fill="url(#velvetFolds)" />
      <rect x="150" y="118" width="1620" height="58" fill="url(#velvetShade)" />
      {edges.slice(0, -1).map((from, i) => (
        <Swag key={from} from={from} to={edges[i + 1] ?? 1770} depth={62} />
      ))}
      {edges.slice(1, -1).map((x) => (
        <Tassel key={x} x={x} y={176} />
      ))}
    </g>
  )
}

// The tall drapes either side of the opening.
const Legs = () => (
  <g>
    {[0, 1].map((side) => (
      <g key={side} transform={side === 1 ? "translate(1920 0) scale(-1 1)" : undefined}>
        <path d="M150,140 H262 Q250,520 268,905 H150 Z" fill="url(#velvetFolds)" />
        <path d="M150,140 H262 Q250,520 268,905 H150 Z" fill="url(#velvetShade)" />
        <path d="M262,140 Q250,520 268,905" fill="none" stroke={velvet.deep} strokeWidth="6" opacity="0.6" />
      </g>
    ))}
  </g>
)

// The four-pane window embroidered on the house curtain, in gold thread.
const Emblem = ({ x, y, size }: { x: number; y: number; size: number }) => {
  const pane = size * 0.46
  const gap = size * 0.08
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2})`}>
      {[
        [0, 0],
        [pane + gap, 0],
        [0, pane + gap],
        [pane + gap, pane + gap]
      ].map(([px = 0, py = 0]) => (
        <g key={`${px}-${py}`}>
          <rect x={px} y={py} width={pane} height={pane} fill="none" stroke={gold.base} strokeWidth="7" />
          <rect
            x={px + 9}
            y={py + 9}
            width={pane - 18}
            height={pane - 18}
            fill="none"
            stroke={gold.dark}
            strokeWidth="2"
          />
          <path
            d={`M${px + pane / 2},${py + 12} Q${px + pane - 12},${py + pane / 2} ${px + pane / 2},${py + pane - 12} Q${px + 12},${py + pane / 2} ${px + pane / 2},${py + 12} Z`}
            fill="none"
            stroke={gold.light}
            strokeWidth="2.5"
          />
        </g>
      ))}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.62}
        fill="none"
        stroke={gold.base}
        strokeWidth="3"
        strokeDasharray="2 7"
      />
    </g>
  )
}

// The house curtain, `drawn` from 0 (closed) to 1 (bunched against the legs).
export const HouseCurtain = ({ drawn = 0 }: { drawn?: number }) => {
  const width = 1 - 0.86 * drawn
  return (
    <g>
      {[0, 1].map((side) => (
        <g
          key={side}
          transform={`${side === 1 ? "translate(1920 0) scale(-1 1) " : ""}translate(150 0) scale(${width} 1) translate(-150 0)`}
        >
          <rect x="150" y="150" width="812" height="740" fill="url(#velvetFolds)" />
          <rect x="150" y="150" width="812" height="740" fill="url(#velvetShade)" />
          <rect x="150" y="842" width="812" height="22" fill="url(#goldMetal)" stroke={gold.deep} strokeWidth="2" />
          <line x1="150" y1="880" x2="962" y2="880" stroke={gold.base} strokeWidth="26" strokeDasharray="3 5" />
          <line x1="958" y1="150" x2="958" y2="892" stroke={velvet.deep} strokeWidth="8" opacity="0.8" />
        </g>
      ))}
      {drawn === 0 && <Emblem x={960} y={500} size={170} />}
    </g>
  )
}

// The house curtain caught back in swags either side, the way it hangs while a scene plays.
export const Drapes = () => (
  <g>
    {[0, 1].map((side) => (
      <g key={side} transform={side === 1 ? "translate(1920 0) scale(-1 1)" : undefined}>
        <path d="M150,140 H660 C575,265 372,470 252,598 L150,598 Z" fill="url(#velvetSwag)" />
        <path d="M150,140 H660 C575,265 372,470 252,598 L150,598 Z" fill="url(#velvetShade)" opacity="0.6" />
        <path d="M660,140 C575,265 372,470 252,598" fill="none" stroke={velvet.deep} strokeWidth="7" />
        <path d="M150,598 L252,598 C266,700 284,820 312,905 L150,905 Z" fill="url(#velvetFolds)" />
        <path d="M150,598 L252,598 C266,700 284,820 312,905 L150,905 Z" fill="url(#velvetShade)" opacity="0.8" />
        <path
          d="M150,882 L312,882"
          stroke={gold.base}
          strokeWidth="24"
          strokeDasharray="3 5"
          clipPath="url(#drapeHem)"
        />
        <path d="M146,585 Q205,566 262,592 Q205,622 146,612 Z" fill={gold.base} stroke={gold.deep} strokeWidth="3" />
        <Tassel x={258} y={622} />
      </g>
    ))}
  </g>
)

// The stage floor in perspective: boards running upstage and a few seams across them.
const Floor = () => {
  const squeeze = (1610 - 310) / (1770 - 150)
  return (
    <g>
      <path d="M150,905 L1770,905 L1610,770 L310,770 Z" fill="url(#floorBoards)" />
      {beads(150, 1770, 72).map((x) => (
        <line
          key={x}
          x1={x}
          y1="905"
          x2={960 + (x - 960) * squeeze}
          y2="770"
          stroke={wood.deep}
          strokeWidth="2"
          opacity="0.55"
        />
      ))}
      {[784, 806, 836, 872].map((y) => (
        <line key={y} x1="150" y1={y} x2="1770" y2={y} stroke={wood.deep} strokeWidth="1.5" opacity="0.35" />
      ))}
      <path d="M150,905 L1770,905 L1610,770 L310,770 Z" fill="url(#floorWash)" />
    </g>
  )
}

const footlights = beads(250, 1670, 94.6)

// How bright footlight `i` is when a fraction `lit` of the row has come up, left to right.
const brightness = (lit: number, i: number) => Math.min(1, Math.max(0, (lit * footlights.length - i) * 2))

// Pools of warm light the footlights throw upstage, under whoever is standing there.
const FootGlow = ({ lit }: { lit: number }) => (
  <g>
    {footlights.map((x, i) => (
      <ellipse
        key={x}
        cx={x}
        cy="860"
        rx="120"
        ry="70"
        fill="url(#footGlow)"
        opacity={0.55 * brightness(lit, i)}
        style={{ mixBlendMode: "screen" }}
      />
    ))}
  </g>
)

// The front of the stage and its row of footlights.
const Apron = ({ lit }: { lit: number }) => (
  <g>
    <path d="M40,903 H1880 V990 H40 Z" fill={wood.dark} />
    <path d="M40,903 H1880 V990 H40 Z" fill="url(#hatch)" opacity="0.18" />
    <rect x="40" y="898" width="1840" height="12" fill="url(#goldMetal)" stroke={gold.deep} strokeWidth="2" />
    {footlights.map((x, i) => (
      <g key={x}>
        <path d={`M${x - 26},906 Q${x},872 ${x + 26},906 Z`} fill="#2e2016" stroke={gold.deep} strokeWidth="2" />
        <ellipse cx={x} cy="899" rx="11" ry="6" fill="#5a4a35" />
        <ellipse cx={x} cy="899" rx="11" ry="6" fill="#fff4cf" opacity={brightness(lit, i)} />
      </g>
    ))}
  </g>
)

// A theatre box on the side wall, with whoever is sitting in it.
const Box = ({ x, children }: { x: number; children?: ReactNode }) => (
  <g transform={`translate(${x} 0)`}>
    <rect x="-130" y="330" width="260" height="230" fill="#160605" />
    <path d="M-150,330 H150 V352 Q75,420 0,360 Q-75,420 -150,352 Z" fill="url(#velvetFolds)" />
    <path d="M-150,330 H150 V352 Q75,420 0,360 Q-75,420 -150,352 Z" fill="url(#velvetShade)" />
    <rect x="-162" y="316" width="324" height="18" fill="url(#goldMetal)" stroke={gold.deep} strokeWidth="2" />
    {children}
    <path
      d="M-160,548 Q0,520 160,548 L150,640 Q0,668 -150,640 Z"
      fill="url(#goldMetal)"
      stroke={gold.deep}
      strokeWidth="4"
    />
    <path
      d="M-160,548 Q0,520 160,548 L158,566 Q0,538 -158,566 Z"
      fill={velvet.base}
      stroke={gold.deep}
      strokeWidth="2"
    />
    {beads(-120, 120, 40).map((dx) => (
      <ellipse
        key={dx}
        cx={dx}
        cy={600 + Math.abs(dx) * 0.05}
        rx="13"
        ry="20"
        fill={gold.light}
        stroke={gold.deep}
        strokeWidth="2"
      />
    ))}
  </g>
)

type Head = { x: number; y: number; scale: number; kind: string }

// The audience, two rows of silhouettes between us and the stage.
const audience: Head[] = [
  { x: -250, y: 1120, scale: 1, kind: "bonnet" },
  { x: -95, y: 1107, scale: 0.86, kind: "plain" },
  { x: 60, y: 1113, scale: 0.9, kind: "top" },
  { x: 215, y: 1105, scale: 0.84, kind: "bun" },
  { x: 370, y: 1111, scale: 0.86, kind: "bowler" },
  { x: 525, y: 1105, scale: 0.82, kind: "plain" },
  { x: 680, y: 1110, scale: 0.86, kind: "headset" },
  { x: 835, y: 1105, scale: 0.82, kind: "bald" },
  { x: 990, y: 1110, scale: 0.86, kind: "bouffant" },
  { x: 1145, y: 1105, scale: 0.82, kind: "plain" },
  { x: 1300, y: 1111, scale: 0.86, kind: "hood" },
  { x: 1455, y: 1105, scale: 0.82, kind: "bowler" },
  { x: 1610, y: 1110, scale: 0.86, kind: "pigtails" },
  { x: 1765, y: 1113, scale: 0.9, kind: "top" },
  { x: 1920, y: 1107, scale: 0.86, kind: "plain" },
  { x: 2080, y: 1120, scale: 1, kind: "bonnet" },
  { x: -170, y: 1230, scale: 1.1, kind: "plain" },
  { x: 150, y: 1236, scale: 1.12, kind: "cap" },
  { x: 470, y: 1230, scale: 1.1, kind: "plain" },
  { x: 1450, y: 1230, scale: 1.1, kind: "bun" },
  { x: 1770, y: 1236, scale: 1.12, kind: "plain" },
  { x: 2090, y: 1230, scale: 1.1, kind: "cap" }
]

const hats: Record<string, string> = {
  plain: "",
  bald: "",
  top: "M-25,-118 L-23,-196 L23,-196 L25,-118 Z M-40,-118 Q0,-108 40,-118 Q0,-128 -40,-118 Z",
  bowler: "M-31,-114 Q-30,-166 0,-168 Q30,-166 31,-114 Z M-44,-113 Q0,-103 44,-113 Q0,-123 -44,-113 Z",
  bun: "M-13,-140 A15,15 0 1 1 13,-140 A15,15 0 1 1 -13,-140 Z",
  bonnet:
    "M-44,-70 Q-58,-150 0,-162 Q58,-150 44,-70 L34,-76 Q40,-138 0,-144 Q-40,-138 -34,-76 Z M30,-150 Q70,-210 92,-176 Q66,-180 40,-140 Z",
  headset: "M-38,-108 L38,-108 L42,-90 L-42,-90 Z M-36,-108 Q0,-150 36,-108",
  hood: "M-52,-60 Q-62,-150 0,-160 Q62,-150 52,-60 Z",
  bouffant: "M-50,-92 A30,30 0 1 1 -10,-150 A34,34 0 1 1 46,-118 A28,28 0 1 1 50,-80 Z",
  pigtails: "M-42,-98 A13,13 0 1 1 -42,-97 Z M42,-98 A13,13 0 1 0 42,-97 Z",
  cap: "M-34,-112 Q-30,-140 0,-142 Q34,-140 36,-112 Z M20,-114 Q56,-116 62,-104 L24,-104 Z"
}

const Silhouette = ({ kind, color }: { kind: string; color: string }) => (
  <g fill={color}>
    <path d="M-82,240 V40 Q-78,-44 -30,-56 Q0,-62 30,-56 Q78,-44 82,40 V240 Z" />
    <rect x="-15" y="-74" width="30" height="24" />
    {kind !== "hood" && <circle cy="-96" r="33" />}
    {hats[kind] ? <path d={hats[kind]} /> : null}
  </g>
)

export const Audience = () => (
  <g>
    {audience.map(({ x, y, scale, kind }) => (
      <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${scale})`}>
        <g transform="translate(0 -3)">
          <Silhouette kind={kind} color="#5a2e18" />
        </g>
        <Silhouette kind={kind} color="#120705" />
      </g>
    ))}
  </g>
)

export type Card = { kicker?: string; title: readonly string[]; scrawl?: readonly string[] }

// The easel at the side of the stage that names the act. A `scrawl` strikes the title out, with its replacement
// written on a slip pinned underneath. At each change of part a stagehand's glove reaches in from the wings and turns
// the card over.
export const Easel = ({ kicker, title, scrawl }: Card) => {
  const t = useContext(Song) ?? 0
  const change = parts.find(({ from }) => from > 0 && Math.abs(t - from) < 0.45)?.from
  const turn = (() => {
    if (change === undefined) {
      return 1
    }
    return t < change
      ? 1 - ramp(t, change - 0.2, change, Easing.in(Easing.quad))
      : ramp(t, change, change + 0.2, Easing.out(Easing.quad))
  })()
  const reach =
    change === undefined ? 0 : ramp(t, change - 0.45, change - 0.2) * (1 - ramp(t, change + 0.2, change + 0.45))
  return (
    <g transform="translate(290 905)">
      <line x1="0" y1="-8" x2="0" y2="-272" stroke={wood.deep} strokeWidth="10" />
      <line x1="-78" y1="0" x2="-14" y2="-282" stroke={wood.dark} strokeWidth="12" strokeLinecap="round" />
      <line x1="78" y1="0" x2="14" y2="-282" stroke={wood.dark} strokeWidth="12" strokeLinecap="round" />
      <rect x="-98" y="-118" width="196" height="14" rx="3" fill={wood.base} stroke={wood.deep} strokeWidth="3" />
      <g transform={`translate(0 -196) rotate(-2.5) scale(${Math.max(0.02, turn)} 1)`}>
        <rect
          x="-128"
          y="-92"
          width="256"
          height="176"
          fill={paper.light}
          stroke={ink}
          strokeWidth="3"
          filter="url(#cut)"
        />
        <rect x="-118" y="-82" width="236" height="156" fill="none" stroke={ink} strokeWidth="1.5" />
        {kicker ? (
          <text y="-46" textAnchor="middle" fontFamily={font.caps} fontSize="26" letterSpacing="4" fill={velvet.base}>
            {kicker}
          </text>
        ) : null}
        {title.map((line, i) => (
          <text
            key={line}
            y={(kicker ? 22 : 14) + (i - (title.length - 1) / 2) * 40}
            textAnchor="middle"
            fontFamily={font.title}
            fontSize={title.length > 1 ? 36 : 44}
            fill={ink}
          >
            {line}
          </text>
        ))}
        {scrawl ? (
          <g>
            <path d="M-108,12 Q0,0 108,16" stroke="#c0161c" strokeWidth="7" fill="none" strokeLinecap="round" />
            <g transform="translate(36 80) rotate(6)">
              <rect
                x="-104"
                y="-44"
                width="208"
                height={34 + scrawl.length * 40}
                fill="#fff8e1"
                stroke={ink}
                strokeWidth="2.5"
                filter="url(#cut)"
              />
              <circle cy="-36" r="6" fill="#c0161c" stroke={ink} strokeWidth="1.5" />
              {scrawl.map((line, i) => (
                <text
                  key={line}
                  y={-2 + i * 40}
                  textAnchor="middle"
                  fontFamily={font.chalk}
                  fontSize="36"
                  fill="#c0161c"
                >
                  {line}
                </text>
              ))}
            </g>
          </g>
        ) : null}
      </g>
      {reach > 0 ? (
        <g transform={`translate(${mix(-330, -128 * turn - 14, reach)} -196) rotate(-90)`}>
          <rect x="-13" y="-300" width="26" height="292" fill="#1d1d22" stroke={ink} strokeWidth="2.5" />
          <Glove />
        </g>
      ) : null}
    </g>
  )
}

// A pool of light from the follow spot.
export const Spot = ({ x, y, rx, ry }: { x: number; y: number; rx: number; ry: number }) => (
  <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="url(#spotlight)" style={{ mixBlendMode: "screen" }} />
)

// Gradients only the theatre uses.
const TheatreDefs = () => (
  <defs>
    <StageClip />
    <linearGradient
      id="velvetSwag"
      x1="0"
      x2="96"
      y1="0"
      y2="0"
      gradientUnits="userSpaceOnUse"
      spreadMethod="repeat"
      gradientTransform="rotate(-38)"
    >
      <stop offset="0" stopColor={velvet.dark} />
      <stop offset="0.3" stopColor={velvet.base} />
      <stop offset="0.52" stopColor={velvet.light} />
      <stop offset="0.72" stopColor={velvet.base} />
      <stop offset="1" stopColor={velvet.dark} />
    </linearGradient>
    <radialGradient id="wallDim" cx="960" cy="520" r="1500" gradientUnits="userSpaceOnUse">
      <stop offset="0.35" stopColor="#fff" />
      <stop offset="1" stopColor="#3a2a24" />
    </radialGradient>
    <linearGradient id="floorWash" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#ffcf7a" stopOpacity="0" />
      <stop offset="1" stopColor="#ffcf7a" stopOpacity="0.35" />
    </linearGradient>
    <linearGradient id="odometer" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#000" />
      <stop offset="0.3" stopColor="#3a3330" />
      <stop offset="0.7" stopColor="#3a3330" />
      <stop offset="1" stopColor="#000" />
    </linearGradient>
    <clipPath id="drapeHem">
      <path d="M150,598 L252,598 C266,700 284,820 312,905 L150,905 Z" />
    </clipPath>
  </defs>
)

type TheatreProps = {
  // The painted scenery at the back of the stage.
  backdrop?: ReactNode
  // Everything standing on the stage, behind the house curtain.
  stage?: ReactNode
  // 0 for the house curtain closed, 1 for drawn right back; undefined for the drapes caught up in swags.
  curtain?: number
  // Whatever plays in front of the curtain: flown cloths, someone poking through.
  front?: ReactNode
  card?: Card
  // Who sits in the theatre boxes either side, seen when the camera pulls back.
  boxes?: { left?: ReactNode; right?: ReactNode }
  // Light over everything on stage: spots, flashes.
  light?: ReactNode
  // Whoever is down in the orchestra pit, between the stage and the audience.
  pit?: ReactNode
  // How much of the row of footlights is up, left to right, and how dark the house is over everything.
  lit?: number
  dark?: number
}

// The Theatre Royal, Redmond: the stage and the house around it, layered back to front. The lights dip for a moment at
// every quick change, so the stage can be reset unseen.
export const Theatre = ({
  backdrop,
  stage,
  curtain,
  front,
  card,
  boxes,
  light,
  pit,
  lit = 1,
  dark = 0
}: TheatreProps) => {
  const song = useContext(Song)
  const shade = Math.max(dark, song === undefined ? 0 : blink(song))
  return (
    <g>
      <TheatreDefs />
      <g clipPath="url(#stageClip)">
        <rect x="150" y="130" width="1620" height="780" fill="#24140c" />
        {backdrop}
        <Floor />
        <FootGlow lit={lit} />
        {stage}
        {curtain === undefined ? <Drapes /> : <HouseCurtain drawn={curtain} />}
        {curtain === undefined ? null : <Legs />}
        {front}
        {light}
      </g>
      <Valance />
      <Wall />
      <Box x={-110}>{boxes?.left}</Box>
      <Box x={2030}>{boxes?.right}</Box>
      <Arch />
      <TokenMeter />
      <Apron lit={lit} />
      {card ? <Easel {...card} /> : null}
      {pit ? (
        <g>
          {pit}
          <rect x="360" y="950" width="1200" height="50" fill={wood.deep} stroke={ink} strokeWidth="2.5" />
          {beads(380, 1540, 40).map((x) => (
            <rect key={x} x={x} y="952" width="8" height="46" fill={gold.dark} />
          ))}
          <rect
            x="350"
            y="942"
            width="1220"
            height="12"
            rx="6"
            fill="url(#goldMetal)"
            stroke={gold.deep}
            strokeWidth="2"
          />
        </g>
      ) : null}
      <Audience />
      {shade > 0 ? (
        <g>
          <rect x="-900" y="-600" width="3720" height="2300" fill="#050202" opacity={shade} />
          {footlights.map((x, i) => (
            <g key={x} opacity={brightness(lit, i) * shade}>
              <ellipse cx={x} cy="895" rx="46" ry="22" fill="url(#footGlow)" />
              <ellipse cx={x} cy="899" rx="11" ry="6" fill="#fff4cf" />
            </g>
          ))}
        </g>
      ) : null}
    </g>
  )
}
