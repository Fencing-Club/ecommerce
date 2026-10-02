import { Easing, random } from "remotion"
import { cards } from "../acts"
import { Clippy } from "../cast/clippy"
import { Copilot } from "../cast/copilot"
import { Duck } from "../cast/duck"
import { Atom, Cane, Engineer, type EngineerPose } from "../cast/engineer"
import { Guard, guardLegs } from "../cast/guard"
import { Kraken } from "../cast/kraken"
import { Lamp } from "../cast/lamp"
import { SadLady } from "../cast/sad-lady"
import { SchoolDataSync, sdsLegs } from "../cast/sds"
import { WindowsPhone } from "../cast/windows-phone"
import { Choir } from "../choir"
import { Biplane, Moon, ServerRack, Torus } from "../machines"
import { during, fly, hop, keys, mix, onTwos, ramp, settle, shake } from "../motion"
import { Chair, Desk, Gauge, Laptop } from "../office"
import { Camera, Canvas, Cut } from "../paper"
import { Balloon, Say } from "../props"
import { Cloud, NightSky, Sky, WaveRow } from "../sets"
import { HouseCurtain, Spot, Theatre } from "../theatre"
import { font, gold, ink, paper, velvet, wood } from "../theme"
import { at, beats } from "../timeline"
import { walk } from "../walk"

// Act II, Cloud First: up to the cloud and back down into Torus, the deprecation cart, flags all the way down, Kusto
// by moonlight, the gauges on fire, HMS Code, and the Kraken of IcM.

// "Bring out your deprecated!": a handcart with the late lamented aboard.
const Cart = ({ x, y, t, phone }: { x: number; y: number; t: number; phone: boolean }) => {
  const turn = t * 160
  const heads = [
    { label: "Silverlight", color: "#c9ced6", glyph: "\u25c6" },
    { label: "IE", color: "#2b7bd4", glyph: "e" },
    { label: "Skype", color: "#00aff0", glyph: "S" },
    { label: "Cortana", color: "#3a7bd5", glyph: "\u25ef" },
    { label: "Flip", color: "#e76f51", glyph: "F" }
  ]
  return (
    <g transform={`translate(${x} ${y})`}>
      {heads.map(({ label, color, glyph }, i) => (
        <g
          key={label}
          transform={`translate(${-150 + i * 72} ${-150 - (i % 2) * 18}) rotate(${-10 + i * 6})`}
          filter="url(#cut)"
        >
          <rect x="-30" y="-30" width="60" height="60" rx="10" fill={color} stroke={ink} strokeWidth="3" />
          <text y="12" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="32" fill="#fff">
            {glyph}
          </text>
          <path d="M-16,-12 l8,8 M-8,-12 l-8,8 M8,-12 l8,8 M16,-12 l-8,8" stroke={ink} strokeWidth="2.5" />
        </g>
      ))}
      {phone ? (
        <g transform="translate(170 -120) rotate(-70)">
          <WindowsPhone x={0} y={0} scale={0.5} armL={150} armR={160} face="o" legL={60} legR={20} />
        </g>
      ) : null}
      <g filter="url(#cut)">
        <path
          d="M-220,-110 H220 L200,-30 H-200 Z"
          fill={wood.base}
          stroke={ink}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {[-150, -50, 50, 150].map((px) => (
          <path key={px} d={`M${px},-108 V-32`} stroke={wood.dark} strokeWidth="5" />
        ))}
        <path d="M-220,-90 L-330,-150" stroke={wood.dark} strokeWidth="10" strokeLinecap="round" />
        {[-120, 120].map((wx) => (
          <g key={wx} transform={`translate(${wx} -20) rotate(${turn})`}>
            <circle r="52" fill="none" stroke={ink} strokeWidth="10" />
            <circle r="52" fill="none" stroke={wood.light} strokeWidth="5" />
            {[0, 45, 90, 135].map((a) => (
              <path key={a} d="M-50,0 H50" stroke={wood.dark} strokeWidth="5" transform={`rotate(${a})`} />
            ))}
            <circle r="9" fill={gold.base} stroke={ink} strokeWidth="2" />
          </g>
        ))}
      </g>
    </g>
  )
}

const flagLabels = [
  "flag_v2",
  "hide_old",
  "enable_flags",
  "kill_switch",
  "flag_flag",
  "beta_beta",
  "temp_fix",
  "do_not_ship"
]
const flagColors = ["#e63946", "#f1c453", "#2a9d8f", "#457b9d", "#e76f51", "#8338ec"]

// One feature flag on its stick, planted at (x, y): a swallowtail with its name on.
const Flag = ({ x, y, i, rise }: { x: number; y: number; i: number; rise: number }) => {
  const label = flagLabels[i % flagLabels.length] ?? ""
  return (
    <g transform={`translate(${x} ${y}) rotate(${(random(`fr${i}`) - 0.5) * 50}) scale(${rise})`}>
      <path d="M0,0 V-122" stroke={wood.dark} strokeWidth="5" />
      <path
        d="M0,-124 H130 L114,-103 L130,-82 H0 Z"
        fill={flagColors[i % flagColors.length]}
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <text
        x="8"
        y="-97"
        fontFamily={font.typewriter}
        fontSize="15"
        fill={ink}
        textLength={label.length > 10 ? 100 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {label}
      </text>
    </g>
  )
}

// A typewriter on a little table, the paper rising with each line of KQL typed.
const Typewriter = ({ x, y, lines }: { x: number; y: number; lines: number }) => {
  const kql = [
    "StormEvents",
    "| where Timestamp > ago(1d)",
    "| summarize count()",
    "  by bin(Timestamp, 1h)",
    "| render timechart"
  ]
  return (
    <g transform={`translate(${x} ${y})`}>
      <g filter="url(#cut)">
        <rect x="-190" y="-150" width="380" height="18" fill={wood.light} stroke={ink} strokeWidth="3" />
        <path d="M-170,-132 V0 M170,-132 V0" stroke={wood.dark} strokeWidth="12" />
      </g>
      <g transform={`translate(0 ${-150 - lines * 29})`}>
        <rect x="-130" y="-60" width="260" height={70 + lines * 29} fill="#fffdf4" stroke={ink} strokeWidth="2" />
        {kql.slice(0, Math.floor(lines)).map((line, i) => (
          <text key={line} x="-120" y={-32 + i * 27} fontFamily={font.typewriter} fontSize="15" fill={ink}>
            {line}
          </text>
        ))}
      </g>
      <g filter="url(#cut)">
        <path
          d="M-140,-150 L-124,-210 H124 L140,-150 Z"
          fill="#26282c"
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect x="-140" y="-226" width="280" height="22" rx="10" fill="#1b1c1f" stroke={ink} strokeWidth="2.5" />
        {Array.from({ length: 11 }, (_, i) => (
          <circle key={i} cx={-100 + i * 20} cy="-170" r="7" fill="#e8e6df" stroke={ink} strokeWidth="1.5" />
        ))}
      </g>
    </g>
  )
}

// HMS Code: a little steamer with a flag, rolling on the swell.
const Ship = ({ x, y, roll }: { x: number; y: number; roll: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${roll})`} filter="url(#cut)">
    <path d="M-60,-160 V-300 M60,-150 V-260" stroke={wood.dark} strokeWidth="8" />
    <path d="M-60,-300 L40,-270 L-60,-240 Z" fill="#fff" stroke={ink} strokeWidth="3" />
    <path d="M60,-260 L120,-245 L60,-230 Z" fill={velvet.base} stroke={ink} strokeWidth="3" />
    <rect x="-20" y="-200" width="40" height="70" fill="#1b1c1f" stroke={ink} strokeWidth="3" />
    <rect x="-24" y="-210" width="48" height="12" fill={velvet.base} stroke={ink} strokeWidth="2" />
    <path d="M-220,-130 H220 L170,0 H-170 Z" fill="#2b2f3a" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
    <path d="M-210,-110 H210" stroke={paper.light} strokeWidth="5" />
    <text y="-62" textAnchor="middle" fontFamily={font.caps} fontSize="34" letterSpacing="4" fill={gold.light}>
      HMS Code
    </text>
    {[-130, -70, 70, 130].map((px) => (
      <circle key={px} cx={px} cy="-24" r="10" fill="#9fd3ff" stroke={ink} strokeWidth="2" />
    ))}
  </g>
)

// A railway signal: arm level for stop, dropped and lit green for go.
const Signal = ({ x, y, go }: { x: number; y: number; go: number }) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <path d="M0,0 V-420" stroke="#3a3a40" strokeWidth="12" />
    <g transform={`translate(0 -400) rotate(${go * 40})`}>
      <rect x="0" y="-14" width="150" height="28" fill="#c0161c" stroke={ink} strokeWidth="3" />
      <rect x="110" y="-14" width="14" height="28" fill="#fff" />
    </g>
    <circle cx="-26" cy="-360" r="16" fill={go > 0.5 ? "#4fe07a" : "#e23b3b"} stroke={ink} strokeWidth="3" />
    {go > 0.5 ? <circle cx="-26" cy="-360" r="40" fill="#4fe07a" opacity="0.3" /> : null}
  </g>
)

// Paper flames licking up around a gauge.
const Flames = ({ x, y, t, size = 1 }: { x: number; y: number; t: number; size?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${size})`}>
    {[-30, 0, 30].map((dx, i) => {
      const lick = 1 + Math.sin(t * 17 + i * 2) * 0.18
      return (
        <path
          key={dx}
          d={`M${dx - 22},0 Q${dx - 26},${-50 * lick} ${dx},${-96 * lick} Q${dx + 26},${-50 * lick} ${dx + 22},0 Z`}
          fill={i === 1 ? "#ffcf4a" : "#ff7a2a"}
          stroke={ink}
          strokeWidth="2.5"
        />
      )
    })}
  </g>
)

// Clippy's deckchair, striped canvas, with a cup of tea.
const Deckchair = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <path d="M-80,0 L60,-200 M80,0 L-40,-150" stroke={wood.dark} strokeWidth="9" />
    <path d="M-60,-40 Q0,-30 40,-180 L70,-170 Q30,-20 -40,-10 Z" fill="#e63946" stroke={ink} strokeWidth="3" />
    <path d="M-50,-30 Q8,-26 46,-170" stroke="#fff" strokeWidth="9" fill="none" />
  </g>
)

const Teacup = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <path d="M-20,-24 H20 L14,0 H-14 Z" fill="#fff" stroke={ink} strokeWidth="2.5" />
    <path d="M20,-18 q12,0 10,10 q-2,8 -12,6" fill="none" stroke={ink} strokeWidth="2.5" />
    <ellipse cy="2" rx="28" ry="5" fill="#fff" stroke={ink} strokeWidth="2" />
  </g>
)

export const Act2 = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const b = beats(s)
  const curtainUp = ramp(t, at("cloud") - 0.1, at("cloud") + 0.5)
  const night = t >= at("kusto") && t < at("shipped")
  const sea = t >= at("shipped") - 0.2

  // Up to the cloud and down into Torus.
  const haul = ramp(s, 83.5, 84.6, Easing.inOut(Easing.cubic))
  const lower = ramp(s, 85, 85.6, Easing.inOut(Easing.cubic))
  const intoTorus = ramp(s, 85.6, 86.4, Easing.in(Easing.cubic))
  const lift = haul * (1 - lower)
  const torusIn =
    ramp(s, at("movedAgain"), 85.4, Easing.out(Easing.cubic)) * (1 - ramp(s, 86.6, 87.2, Easing.in(Easing.cubic)))
  // The Guard runs on ahead of Torus, and off after it.
  const guard =
    t < 86
      ? walk(t, { from: 84.2, to: 85.2, x0: 1810, x1: 1150, steps: 7, gait: "run", scale: 0.72, build: guardLegs })
      : walk(t, { from: 86.5, to: 87.4, x0: 1150, x1: 1810, steps: 7, gait: "run", scale: 0.72, build: guardLegs })

  // The cart, and the frameworks spinning on the hoodie.
  const cartX = mix(-420, 2300, ramp(t, 86.4, 90, Easing.linear))
  const phoneOn = t > 88.6
  // School Data Sync brings Windows Phone on, drops it in the cart as it passes, and follows it off.
  const carrier = phoneOn
    ? walk(t, { from: 88.8, to: 89.8, x0: 1400, x1: 1850, steps: 7, scale: 0.66, build: sdsLegs })
    : walk(t, { from: 87.4, to: 88.4, x0: 1800, x1: 1400, steps: 7, scale: 0.66, build: sdsLegs })
  const spinning = during(t, 86.6, 89.04)

  // Flags: one, one to hide it, then flags from flags until only the cane shows.
  const flagCount = (() => {
    if (t < 90.58) {
      return 0
    }
    if (t < 91.48) {
      return 1
    }
    return Math.min(140, 2 + Math.floor(2 ** ((t - 92) * 1.35)))
  })()
  const buried = ramp(t, 94.4, 95.6)

  // Kusto at night.
  const typed = ramp(t, 96.6, 99.3, Easing.linear) * 5
  const typewriter = 1080

  const kraken = {
    rise: ramp(t, 106, 106.9, Easing.out(Easing.cubic)),
    grab: ramp(t, 106.9, 107.6, Easing.inOut(Easing.cubic))
  }
  const sink = ramp(t, 107.7, 108.7, Easing.in(Easing.quad))
  const shipX = mix(-420, 980, ramp(t, 104.5, 105.9, Easing.out(Easing.cubic)))
  const signal = ramp(s, 103.8, 104)
  const scrawl = (() => {
    if (t >= 108) {
      return ["INCIDENT"]
    }
    return t >= 85.62 ? ["Security", "First"] : undefined
  })()

  const camera = {
    scale: keys(t, [
      [99.5, 1],
      [100, 1.3],
      [102.8, 1.3],
      [103.2, 1]
    ]),
    x: keys(t, [
      [99.5, 960],
      [100, 1080],
      [102.8, 1080],
      [103.2, 960]
    ]),
    y: keys(t, [
      [99.5, 540],
      [100, 600],
      [102.8, 600],
      [103.2, 540]
    ])
  }

  let pose: EngineerPose = {
    armR: 130 + Math.sin(t * 10) * 15,
    elbowR: 20,
    cane: { hand: "right", angle: 160 + Math.sin(t * 10) * 20 },
    armL: 20,
    mouth: "sing",
    look: { x: 0.3, y: -0.8 }
  }
  if (t >= at("movedAgain")) {
    pose = { ...pose, armR: 60, cane: { hand: "right", angle: 70 }, look: { x: 1, y: 0 } }
  }
  if (t >= at("frameworks")) {
    pose = {
      armL: 20,
      elbowL: 20,
      armR: 30,
      cane: { hand: "right", angle: 8 },
      mouth: spinning ? "o" : "smile",
      look: { x: 0, y: spinning ? 1 : 0 },
      tilt: spinning ? 12 : 0,
      chest: spinning ? (
        <g>
          <Atom spin={t * 1400} />
          <text y="12" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="34" fill="#61dafb">
            {["$", "ng", "{ }", "K", "</>"][Math.floor(t * 8) % 5]}
          </text>
        </g>
      ) : undefined
    }
  }
  if (t >= at("flags")) {
    const plant = ramp(s, 91.3, 91.6)
    pose = {
      armR: mix(40, 90, plant),
      elbowR: 40,
      cane: { hand: "right", angle: mix(10, 60, plant) },
      armL: 40,
      elbowL: 60,
      holdL: undefined,
      mouth: "o",
      look: { x: 0.6, y: -0.4 }
    }
  }
  if (night) {
    const key = Math.sin(Math.PI * 2 * b)
    pose = {
      armL: 24,
      elbowL: 30,
      armR: 50,
      elbowR: 20 + key * 10,
      mouth: "flat",
      look: { x: 1, y: 0.1 },
      dress: "nightcap"
    }
  }
  const shuffle = walk(s, { from: 86.4, to: 86.9, x0: 600, x1: 560, steps: 2, gait: "side" })
  const cross = walk(s, { from: 89.8, to: 90.7, x0: 560, x1: 760, steps: 3 })
  const footing = t < 89.8 ? shuffle : cross
  if (during(s, 86.4, 86.9) || during(s, 89.8, 90.7)) {
    pose = { ...pose, stride: footing.stride }
  }
  // The bounce on the beat stops while he steps across.
  const bounce = 1 - ramp(s, 86.3, 86.4) * (1 - ramp(s, 86.9, 87))

  return (
    <Canvas>
      <Camera scale={camera.scale} look={{ x: camera.x, y: camera.y }}>
        <Theatre
          card={{ ...cards.act2, title: ["Cloud First"], scrawl }}
          boxes={{ left: <Choir t={t} side="left" mood="watch" />, right: <Choir t={t} side="right" mood="watch" /> }}
          backdrop={
            night || during(t, at("telemetry"), at("shipped")) ? (
              <g>
                <NightSky t={t} />
                <g transform={`translate(760 ${fly(t, at("kusto") - 0.2, 102.8, 700) + 290})`}>
                  <path d="M0,-90 V-700" stroke={ink} strokeWidth="2" />
                  <Moon x={0} y={0} r={90} hit />
                </g>
              </g>
            ) : (
              <Sky>
                <Cloud x={1360} y={300} scale={0.5} />
                <Cloud x={600} y={260} scale={0.4} />
                {t >= at("incident") ? (
                  <rect x="150" y="130" width="1620" height="660" fill="#2a2f45" opacity={0.5 * ramp(t, 106, 107)} />
                ) : null}
              </Sky>
            )
          }
          stage={
            <g>
              {t < 89.8 ? (
                <Biplane
                  x={mix(1480, -160, ramp(t, 83, 89.8, Easing.linear))}
                  y={300 + Math.sin(t * 2) * 8}
                  scale={0.85}
                  banner={["WORK FROM HOME", "IMPROVES PRODUCTIVITY"]}
                />
              ) : null}
              {t < 86.6 ? (
                <g transform={`translate(${intoTorus * 520} ${-lift * 380})`} opacity={1 - ramp(s, 86.2, 86.4)}>
                  <Cloud x={720} y={mix(1100, 820, lift)} scale={0.95} label="The Cloud" />
                  <Cut>
                    <Chair x={680} y={850} scale={0.62} />
                    <Copilot
                      x={680}
                      y={830}
                      scale={0.42}
                      armL={60}
                      armR={140}
                      mouth="grin"
                      holdR={<Laptop x={0} y={-10} scale={0.5} />}
                    />
                    <ServerRack x={860} y={700} scale={0.7} />
                  </Cut>
                  <Desk x={700} y={858} scale={0.62} />
                </g>
              ) : null}
              {t < 87.3 ? (
                <g>
                  <path
                    d={`M1480,130 V${560 + Math.sin(t * 10) * 20}`}
                    stroke="#c9a86a"
                    strokeWidth="6"
                    opacity={t < 85 ? 1 : 0}
                  />
                  <Cut>
                    <SchoolDataSync
                      x={1480}
                      y={898}
                      scale={0.7}
                      armL={150 + Math.sin(t * 10) * 15}
                      armR={150 - Math.sin(t * 10) * 15}
                      elbowL={10}
                      elbowR={10}
                      mouth="smile"
                      look={{ x: -0.6, y: -0.6 }}
                    />
                  </Cut>
                </g>
              ) : null}
              {torusIn > 0 ? (
                <Cut>
                  <Torus x={mix(2300, 1330, torusIn)} y={836} scale={0.9} />
                </Cut>
              ) : null}
              {during(t, 84.2, 87.4) ? (
                <Cut>
                  <Guard x={guard.x} y={guard.y} scale={0.72} stride={guard.stride} />
                </Cut>
              ) : null}
              {during(t, 86.4, 90.2) ? (
                <Cut>
                  <Cart x={cartX} y={898} t={t} phone={phoneOn} />
                  <Clippy
                    x={cartX - 380}
                    y={896}
                    scale={0.6}
                    hat
                    bowtie
                    brows={-0.5}
                    mouth="o"
                    rotate={Math.sin(t * 8) * 4}
                  />
                  {during(t, 87.4, 89.8) ? (
                    <g>
                      <SchoolDataSync
                        x={carrier.x}
                        y={carrier.y}
                        scale={0.66}
                        stride={carrier.stride}
                        armL={phoneOn ? 30 : 150}
                        armR={phoneOn ? 30 : 150}
                        mouth="flat"
                      />
                      {phoneOn ? null : (
                        <WindowsPhone
                          x={carrier.x}
                          y={carrier.y - 300 * 0.66}
                          scale={0.6}
                          armL={150 + Math.sin(t * 20) * 20}
                          armR={150 - Math.sin(t * 20) * 20}
                          legL={Math.sin(t * 22) * 40}
                          legR={-Math.sin(t * 22) * 40}
                          face="o"
                        />
                      )}
                    </g>
                  ) : null}
                </Cut>
              ) : null}
              {during(t, 89.8, 96.4) ? (
                <g>
                  {Array.from({ length: Math.min(flagCount, 140) }, (_, i) => {
                    const fx = [1000, 940][i] ?? 220 + random(`fx${i}`) * 1480
                    const fy = i < 2 ? 898 : 898 - random(`fy${i}`) * 260 * buried
                    return (
                      <Flag
                        key={i}
                        x={fx}
                        y={fy}
                        i={i}
                        rise={settle(t, 90.58 + (i < 2 ? i * 0.9 : 1.4 + Math.log2(i) / 1.35), 10, 220)}
                      />
                    )
                  })}
                  {Array.from({ length: Math.max(0, Math.min(6, Math.floor((t - 93.2) * 2.4))) }, (_, row) => (
                    <g key={row}>
                      <path
                        d={`M150,${170 + row * 70} Q960,${300 + row * 80} 1770,${170 + row * 70}`}
                        fill="none"
                        stroke={ink}
                        strokeWidth="2"
                      />
                      {Array.from({ length: 22 }, (_, k) => {
                        const u = (k + 0.5) / 22
                        const bx = 150 + u * 1620
                        const by = 170 + row * 70 + 4 * u * (1 - u) * (130 + row * 10)
                        return (
                          <path
                            key={k}
                            d={`M${bx - 26},${by} L${bx + 26},${by} L${bx},${by + 48} Z`}
                            fill={flagColors[(k + row) % flagColors.length]}
                            stroke={ink}
                            strokeWidth="2"
                          />
                        )
                      })}
                    </g>
                  ))}
                  {buried > 0 ? (
                    <g>
                      <path
                        d={`M150,898 V${898 - 300 * buried} Q560,${820 - 380 * buried} 960,${880 - 420 * buried} Q1360,${820 - 380 * buried} 1770,${898 - 300 * buried} V898 Z`}
                        fill={flagColors[0]}
                        stroke={ink}
                        strokeWidth="3"
                      />
                      {Array.from({ length: 60 }, (_, i) => (
                        <path
                          key={i}
                          d={`M${170 + (i % 20) * 80},${898 - (Math.floor(i / 20) + 1) * 110 * buried} l40,-30 l20,46 Z`}
                          fill={flagColors[i % flagColors.length]}
                          stroke={ink}
                          strokeWidth="2"
                        />
                      ))}
                    </g>
                  ) : null}
                  {buried > 0.9 ? (
                    <g transform={`translate(960 ${430 + Math.sin(t * 9) * 6}) rotate(${Math.sin(t * 9) * 16})`}>
                      <Cane />
                    </g>
                  ) : null}
                </g>
              ) : null}
              {night ? (
                <g>
                  <Cut>
                    <Engineer x={880} y={898} scale={0.78} pose={pose} />
                    <Typewriter x={typewriter} y={898} lines={typed} />
                    <Duck x={typewriter + 160} y={748} scale={0.5} nightcap flip rotate={Math.sin(t * 2) * 6} />
                    <Lamp
                      x={1380}
                      y={898}
                      scale={0.8}
                      flip
                      lean={-20}
                      aim={-70}
                      beam={280}
                      look={{ x: -0.6, y: 0.6 }}
                    />
                  </Cut>
                </g>
              ) : null}
              {during(t, at("telemetry"), at("shipped")) ? (
                <g>
                  <Deckchair x={1080} y={898} />
                  {[
                    { x: 820, y: 640, label: "LATENCY" },
                    { x: 1340, y: 600, label: "ERRORS" },
                    { x: 920, y: 420, label: "CPU" },
                    { x: 1260, y: 380, label: "SEV" }
                  ].map((g, i) => (
                    <g key={g.label}>
                      <Flames x={g.x} y={g.y + 60} t={t + i} size={1.1} />
                      <Gauge
                        x={g.x}
                        y={g.y}
                        r={60}
                        needle={i === 1 && t > 100.4 ? 300 + (t - 100.4) * 900 : 110 + shake(t + i, 8)}
                        label={g.label}
                      />
                    </g>
                  ))}
                  <Cut>
                    <Clippy
                      x={1060}
                      y={860}
                      scale={0.6}
                      hat
                      bowtie
                      brows={0.4}
                      look={{ x: 0.3, y: -0.2 }}
                      rotate={-14}
                    />
                    <Teacup x={1150} y={mix(720, 640, ramp(s, 101.4, 101.7))} />
                  </Cut>
                </g>
              ) : null}
              {sea ? (
                <g>
                  <g transform={`translate(0 ${(1 - ramp(t, at("shipped") - 0.2, at("shipped") + 0.5)) * 300})`}>
                    <WaveRow t={t} y={720} phase={0} color="#2f6f9f" />
                  </g>
                  {t >= 105.8 ? (
                    <Kraken
                      x={1060}
                      y={760}
                      t={t}
                      rise={kraken.rise}
                      grab={kraken.grab}
                      prey={{ x: shipX - 1060 + 0, y: -120 }}
                    />
                  ) : null}
                  {t >= 104.4 ? (
                    <g transform={`translate(0 ${sink * 380})`}>
                      <Ship x={shipX} y={770 + Math.sin(t * 2.4) * 8} roll={Math.sin(t * 2.4) * 4 + sink * 30} />
                      <Cut>
                        <Engineer
                          x={shipX - 120}
                          y={650 + Math.sin(t * 2.4) * 8}
                          scale={0.5}
                          pose={{
                            armR: 150,
                            elbowR: 150,
                            cane: { hand: "right", angle: 92, grip: 0.9 },
                            armL: 30,
                            mouth: t > 106.86 ? "o" : "smile",
                            look: { x: 1, y: -0.2 }
                          }}
                        />
                      </Cut>
                    </g>
                  ) : null}
                  <g transform={`translate(0 ${(1 - ramp(t, at("shipped") - 0.1, at("shipped") + 0.6)) * 300})`}>
                    <WaveRow t={t} y={800} phase={2} color="#3d86b8" />
                    <WaveRow t={t} y={870} phase={4} color="#4f9fd0" />
                  </g>
                  {t > 108.6 ? (
                    <g
                      transform={`translate(${900 + Math.sin(t * 3) * 30} ${790 + Math.sin(t * 2.4) * 8}) rotate(${Math.sin(t * 6) * 20})`}
                    >
                      <Cane grip={1} />
                    </g>
                  ) : null}
                  <Signal x={500} y={898} go={signal} />
                </g>
              ) : null}
              {t < 89.8 && t >= at("cloud") ? (
                <Cut>
                  <Engineer x={shuffle.x} y={shuffle.y - hop(t) * 4 * bounce} scale={0.8} pose={pose} />
                </Cut>
              ) : null}
              {during(t, 89.8, 96.4) && buried < 0.9 ? (
                <Cut>
                  <Engineer x={cross.x} y={cross.y + buried * 200} scale={0.8} pose={pose} />
                </Cut>
              ) : null}
            </g>
          }
          front={
            <g>
              {curtainUp < 1 ? (
                <g transform={`translate(0 ${-820 * curtainUp})`}>
                  <HouseCurtain />
                </g>
              ) : null}
              {during(t, 85.2, 86.55) ? (
                <Say
                  x={760}
                  y={380}
                  width={430}
                  lines={["Approve the sign-in", "on your phone."]}
                  tail={{ x: 1150, y: 560 }}
                />
              ) : null}
              {during(t, 86.6, 88) ? (
                <Say
                  x={cartX - 560}
                  y={420}
                  width={420}
                  lines={["Bring out your", "deprecated!"]}
                  tail={{ x: cartX - 380, y: 680 }}
                />
              ) : null}
              {during(t, 88, 88.9) ? (
                <Say
                  x={1180}
                  y={300}
                  width={360}
                  lines={["I\u2019m not dead yet!"]}
                  tail={phoneOn ? { x: cartX + 150, y: 730 } : { x: carrier.x + 30, y: 600 }}
                />
              ) : null}
              {during(t, 101.5, 102.95) ? (
                <Say x={760} y={420} width={330} lines={["Looks alright!"]} tail={{ x: 1040, y: 640 }} />
              ) : null}
              {during(t, 104.5, 106.6) ? (
                <g>
                  <Cut>
                    <Clippy
                      x={1500}
                      y={898 + (1 - settle(t, 104.5, 9, 160)) * 300}
                      scale={0.6}
                      hat
                      bowtie
                      brows={0.9}
                    />
                  </Cut>
                  <Balloon
                    x={830}
                    y={330}
                    width={680}
                    title={"It looks like you\u2019re shipping on a Friday."}
                    tail={{ x: 1490, y: 670 }}
                    pop={settle(t, 104.55, 10, 170) * (1 - ramp(t, 106.4, 106.6))}
                  />
                </g>
              ) : null}
              {t >= 107.8 ? (
                <g transform={`translate(1520 ${mix(1000, 620, settle(t, 107.8, 9, 180))})`}>
                  <SadLady x={0} y={0} scale={0.8} />
                </g>
              ) : null}
            </g>
          }
          light={
            <g>
              {night || during(t, at("telemetry"), at("shipped")) ? (
                <rect
                  x="150"
                  y="130"
                  width="1620"
                  height="780"
                  fill="#1a2350"
                  opacity="0.45"
                  style={{ mixBlendMode: "multiply" }}
                />
              ) : null}
              {night ? <Spot x={960} y={760} rx={300} ry={120} /> : null}
              {during(t, at("telemetry"), at("shipped")) ? (
                <ellipse
                  cx="1080"
                  cy="560"
                  rx="420"
                  ry="300"
                  fill="#ff9a3c"
                  opacity="0.18"
                  style={{ mixBlendMode: "screen" }}
                />
              ) : null}
            </g>
          }
        />
      </Camera>
    </Canvas>
  )
}
