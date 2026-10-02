import { Easing, random } from "remotion"
import { cards } from "../acts"
import { Agent } from "../cast/agent"
import { Copilot } from "../cast/copilot"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { SadLady } from "../cast/sad-lady"
import { Choir } from "../choir"
import { KickLine } from "../company"
import { AirBalloon } from "../machines"
import { during, fly, hop, keys, mix, onTwos, ramp, settle, shake } from "../motion"
import { Camera, Canvas, Cut } from "../paper"
import { Bolt, KnifeSwitch, OrgChart, type Seat, Say, Slab, TeslaCoil } from "../props"
import { ChorusCloth, Laboratory, Plain } from "../sets"
import { Spot, Theatre } from "../theatre"
import { font, gold, ink, paper, velvet, wood } from "../theme"
import { at, beats } from "../timeline"
import { walk } from "../walk"

// Act III, AI First: Copilot leads the line, context windows shatter, Copilot finds the cause and changes seventeen
// files, the act card gets graffiti, the agents wake and take over the org chart, and the build, once, succeeds.

const soap = 1100
const slabs = [690, 960, 1230]
const wakes = [127.06, 127.42, 127.7]

// A sash window in a flat, its size painted over it, shattering as `smash` goes from 0 to 1.
const ContextWindow = ({ x, y, label, smash }: { x: number; y: number; label: string; smash: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <g filter="url(#cut)">
      <rect x="-110" y="-150" width="220" height="300" fill={paper.light} stroke={ink} strokeWidth="5" />
      <rect
        x="-96"
        y="-136"
        width="192"
        height="272"
        fill={smash > 0 ? "#1d2a3a" : "#bfe3ff"}
        stroke={ink}
        strokeWidth="3"
      />
      <path d="M0,-136 V136 M-96,0 H96" stroke={wood.base} strokeWidth="10" />
      <rect x="-80" y="-196" width="160" height="40" fill={velvet.base} stroke={ink} strokeWidth="3" />
      <text y="-166" textAnchor="middle" fontFamily={font.poster} fontSize="28" fill={gold.light}>
        {label}
      </text>
    </g>
    {smash > 0
      ? Array.from({ length: 14 }, (_, i) => {
          const a = random(`sa${label}${i}`) * Math.PI * 2
          const d = smash * (160 + random(`sd${label}${i}`) * 260)
          return (
            <path
              key={i}
              d="M0,-18 L16,10 L-14,12 Z"
              transform={`translate(${Math.cos(a) * d} ${Math.sin(a) * d + smash * smash * 300}) rotate(${a * 200 + smash * 400}) scale(${1 + random(`ss${label}${i}`)})`}
              fill="#d6efff"
              stroke={ink}
              strokeWidth="2"
              opacity={1 - smash * 0.6}
            />
          )
        })
      : null}
  </g>
)

// The scroll with the entire monorepo on it, rolled up and far too big.
const Monorepo = ({ x, y, rotate }: { x: number; y: number; rotate: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate})`} filter="url(#cut)">
    <rect x="-150" y="-50" width="300" height="100" rx="12" fill={paper.light} stroke={ink} strokeWidth="4" />
    <ellipse cx="-150" cy="0" rx="22" ry="50" fill={paper.shade} stroke={ink} strokeWidth="4" />
    <ellipse cx="150" cy="0" rx="22" ry="50" fill={paper.shade} stroke={ink} strokeWidth="4" />
    <text y="-6" textAnchor="middle" fontFamily={font.caps} fontSize="24" fill={ink}>
      The Entire
    </text>
    <text y="24" textAnchor="middle" fontFamily={font.caps} fontSize="24" fill={ink}>
      Monorepo
    </text>
  </g>
)

// A magnifying glass held out at arm's length, the lens to the left.
const MagnifyingGlass = () => (
  <g transform="translate(0 4) rotate(100)" filter="url(#cut)">
    <path d="M0,0 V60" stroke={wood.dark} strokeWidth="12" strokeLinecap="round" />
    <circle cy="100" r="44" fill="#d6efff" fillOpacity="0.6" stroke={gold.base} strokeWidth="10" />
    <circle cy="100" r="44" fill="none" stroke={ink} strokeWidth="2" />
  </g>
)

// A ladle, `tilt` degrees round from hanging straight down.
const Ladle = ({ tilt }: { tilt: number }) => (
  <g transform={`translate(0 6) rotate(${tilt})`}>
    <path d="M0,0 V110" stroke="#9aa3ad" strokeWidth="8" strokeLinecap="round" />
    <path d="M-26,110 A26,22 0 0 0 26,110 Z" fill="#9aa3ad" stroke={ink} strokeWidth="2.5" />
  </g>
)

// A can of spray paint, nozzle up and to the left, misting toward whatever is there.
const SprayCan = ({ t }: { t: number }) => (
  <g transform="translate(0 2) rotate(-60)" filter="url(#cut)">
    <rect x="-12" y="0" width="24" height="54" rx="4" fill="#e63946" stroke={ink} strokeWidth="2.5" />
    <rect x="-5" y="-10" width="10" height="10" fill="#ccc" stroke={ink} strokeWidth="2" />
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const out = (t * 3 + i / 6) % 1
      return (
        <circle
          key={i}
          cx={Math.sin(i * 2.4) * out * 18}
          cy={-16 - out * 60}
          r={3 + out * 7}
          fill="#e63946"
          opacity={0.7 * (1 - out)}
        />
      )
    })}
  </g>
)

// The Microslop cauldron, its four squares melting down its side, bubbling over a fire.
const Cauldron = ({ x, y, t, scale = 1 }: { x: number; y: number; t: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    {[-40, 0, 40].map((dx, i) => {
      const lick = 1 + Math.sin(t * 15 + i) * 0.2
      return (
        <path
          key={dx}
          d={`M${dx - 30},0 Q${dx},${-110 * lick} ${dx + 30},0 Z`}
          fill={i === 1 ? "#ffcf4a" : "#ff7a2a"}
          stroke={ink}
          strokeWidth="2.5"
        />
      )
    })}
    <g filter="url(#cut)">
      <path
        d="M-180,-260 Q-200,-40 -60,-20 H60 Q200,-40 180,-260 Z"
        fill="#232227"
        stroke={ink}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <ellipse cx="0" cy="-260" rx="190" ry="34" fill="#3a3a40" stroke={ink} strokeWidth="5" />
      <ellipse cx="0" cy="-260" rx="168" ry="24" fill="#8b8f86" />
      {["#f25022", "#7fba00", "#00a4ef", "#ffb900"].map((color, i) => {
        const melt = 10 + Math.sin(t * 2 + i) * 6 + i * 6
        return (
          <path
            key={color}
            d={`M${-70 + (i % 2) * 74},${-200 + Math.floor(i / 2) * 74} h66 v${60 + melt} q-8,${12 + melt / 2} -16,0 q-10,${18 + melt} -20,0 q-12,${10 + melt / 3} -30,-${melt / 2} Z`}
            fill={color}
            stroke={ink}
            strokeWidth="2"
          />
        )
      })}
      <text y="-36" textAnchor="middle" fontFamily={font.poster} fontSize="30" fill={paper.light}>
        MICROSLOP
      </text>
    </g>
    {[0, 1, 2].map((i) => {
      const bub = (t * 1.3 + i / 3) % 1
      return (
        <circle
          key={i}
          cx={-90 + i * 90}
          cy={-266 - bub * 30}
          r={8 + bub * 14}
          fill="#9ca093"
          stroke={ink}
          strokeWidth="2"
          opacity={1 - bub}
        />
      )
    })}
  </g>
)

// A manila folder, `full` of slop.
const Folder = ({ x, y, full }: { x: number; y: number; full: number }) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <path d="M-34,0 V-56 H-10 L-4,-64 H34 V0 Z" fill="#e9c98f" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
    {full > 0 ? (
      <path
        d={`M-30,-50 Q-20,${-62 - full * 30} 0,${-56 - full * 22} Q22,${-64 - full * 30} 30,-50 V${-20 + full * 10} Q20,${full * 18} 10,-10 Q0,${full * 22} -10,-12 Q-22,${full * 14} -30,-20 Z`}
        fill="#8b8f86"
        stroke={ink}
        strokeWidth="2"
      />
    ) : null}
  </g>
)

// A Solitaire win: cards bouncing across the backcloth, each leaving its trail.
const Solitaire = ({ t, from }: { t: number; from: number }) => (
  <g>
    {Array.from({ length: 6 }, (_, k) => {
      const start = from + k * 0.28
      return Array.from({ length: 10 }, (_, trail) => {
        const age = t - start - trail * 0.05
        if (age < 0) {
          return null
        }
        const x = 260 + k * 60 + age * (380 + k * 40)
        const bounce = Math.abs(Math.sin(age * 3.6)) * 300 * Math.exp(-age * 0.6)
        const y = 700 - bounce
        return (
          <g key={`${k}-${trail}`} transform={`translate(${x} ${y})`}>
            <rect x="-30" y="-42" width="60" height="84" rx="6" fill="#fff" stroke={ink} strokeWidth="2" />
            <text y="10" textAnchor="middle" fontFamily={font.title} fontSize="34" fill={k % 2 === 0 ? "#c0161c" : ink}>
              {["A", "K", "Q", "J", "10", "9"][k]}
            </text>
          </g>
        )
      })
    })}
  </g>
)

export const Act3 = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const b = beats(s)
  const lab = during(t, at("agents"), at("meetingDue"))
  const kicking = during(t, at("soLong3"), at("windows")) || during(t, at("soLong4") + 0.9, at("agents"))

  const camera = {
    scale: keys(t, [
      [116, 1],
      [116.5, 1.25],
      [118.8, 1.25],
      [119.2, 1],
      [132.3, 1],
      [132.8, 1.2],
      [135.3, 1.2],
      [135.66, 1]
    ]),
    x: keys(t, [
      [116, 960],
      [116.5, 900],
      [118.8, 900],
      [119.2, 960],
      [132.3, 960],
      [132.8, 960],
      [135.3, 960],
      [135.66, 960]
    ]),
    y: keys(t, [
      [116, 540],
      [116.5, 520],
      [118.8, 520],
      [119.2, 540],
      [132.3, 540],
      [132.8, 470],
      [135.3, 470],
      [135.66, 540]
    ])
  }

  // Context windows: shove the monorepo at 128K on "broken", then at 1M.
  const shove128 = ramp(s, 113.9, 114.6, Easing.in(Easing.cubic))
  const smash128 = ramp(t, 114.7, 115.6, Easing.out(Easing.quad))
  const shove1m = ramp(s, 115, 115.45, Easing.in(Easing.cubic))
  const smash1m = ramp(t, 115.5, 116.3, Easing.out(Easing.quad))
  // Carried at a walk into the 128K window and knocked back off it, then at a run into the 1M.
  const charge =
    t < 115
      ? walk(s, { from: 113.9, to: 114.6, x0: 700, x1: 860, steps: 3, lean: 0, rush: true })
      : walk(s, { from: 115, to: 115.45, x0: 860, x1: 1100, steps: 3, gait: "run", lean: 0, rush: true })
  const recoil = t > 114.7 && t < 115 ? 60 : 0

  // Seventeen folders, a ladle each.
  const filled = Math.max(0, Math.min(17, (t - 119.2) / 0.11))
  const diff = Math.floor(Math.min(1, Math.max(0, (t - 119.2) / 1.9)) * 4812)

  // The lab: switch thrown, bolts, agents up, the org chart down and turning over seat by seat.
  const thrown = ramp(s, 126, 126.4, Easing.in(Easing.back(2)))
  const bolts = t > 126.4 && t < 127.9 && Math.floor(t * 14) % 3 !== 0
  const chartDown = ramp(t, 127.5, 128, Easing.out(Easing.bounce))
  const flip = (k: number) => Math.min(1, Math.max(0, (t - (128 + k * 0.22)) / 0.2))
  const rows: readonly (readonly Seat[])[] = [
    [{ title: "Leadership" }],
    [
      { title: "Manager", agent: flip(1) >= 1, flipping: flip(1) > 0 && flip(1) < 1 ? flip(1) : undefined },
      { title: "Manager" },
      { title: "Manager", agent: flip(3) >= 1, flipping: flip(3) > 0 && flip(3) < 1 ? flip(3) : undefined }
    ],
    [
      { title: "Engineer", agent: flip(0) >= 1, flipping: flip(0) > 0 && flip(0) < 1 ? flip(0) : undefined },
      { title: "Designer" },
      { title: "PM", agent: flip(2) >= 1, flipping: flip(2) > 0 && flip(2) < 1 ? flip(2) : undefined },
      { title: "Engineer", agent: flip(4) >= 1, flipping: flip(4) > 0 && flip(4) < 1 ? flip(4) : undefined },
      { title: "You", you: true, agent: flip(5) >= 1, flipping: flip(5) > 0 && flip(5) < 1 ? flip(5) : undefined },
      { title: "Researcher", agent: flip(4) >= 1 }
    ]
  ]
  const awake = (k: number) => t > (wakes[k] ?? 99)
  const rising = (k: number) => ramp(t, wakes[k] ?? 99, (wakes[k] ?? 99) + 0.4, Easing.out(Easing.back(1.5)))

  // The agents' chorus line, and the one good build.
  const succeeded = t >= 133.34
  const unveil = ramp(s, 134, 134.5)

  let pose: EngineerPose = { armR: 40, cane: { hand: "right", angle: 15 }, mouth: "sing", look: { x: 0.5, y: 0 } }
  if (during(t, at("windows"), at("cause"))) {
    pose = {
      armL: 70,
      elbowL: 60,
      armR: 70,
      elbowR: 60,
      openL: true,
      openR: true,
      cane: "hood",
      stride: charge.stride,
      mouth: smash128 > 0 ? "o" : "flat",
      look: { x: 0.4, y: -0.6 }
    }
  } else if (during(t, at("cause"), at("seventeen"))) {
    const me = t > 117.6
    pose = {
      armR: me ? 160 : 30,
      elbowR: me ? 165 : 10,
      cane: { hand: "right", angle: me ? -150 : 12 },
      armL: me ? 60 : 20,
      elbowL: me ? 60 : 10,
      openL: me,
      mouth: me ? "o" : "flat",
      look: { x: 1, y: 0 }
    }
  } else if (during(t, at("seventeen"), at("soLong4"))) {
    pose = { armR: 20, cane: { hand: "right", angle: 6 }, armL: 20, mouth: "flat", look: { x: 0.8, y: 0.6 } }
  } else if (lab) {
    pose = {
      armL: 150,
      elbowL: 40,
      armR: 150,
      elbowR: 40,
      openL: true,
      openR: true,
      cane: "hood",
      mouth: "o",
      look: { x: 0.8, y: -0.6 },
      legL: during(t, 129, 129.3) ? 30 : 0
    }
  }

  const card = cards.act3 && { ...cards.act3, scrawl: t >= 123 ? ["AI", "Everything"] : undefined }

  return (
    <Canvas>
      <Camera scale={camera.scale} look={{ x: camera.x, y: camera.y }}>
        <Theatre
          card={card}
          boxes={{ left: <Choir t={t} side="left" mood="sing" />, right: <Choir t={t} side="right" mood="sing" /> }}
          backdrop={
            lab ? (
              <Laboratory />
            ) : (
              <g>
                <ChorusCloth />
                {during(t, at("windows"), at("soLong4")) ? <Plain color="#5b4a6e" /> : null}
              </g>
            )
          }
          stage={
            <g>
              {during(t, 108.9, 117) ? (
                <AirBalloon
                  x={mix(1700, -700, ramp(t, 108.9, 117, Easing.linear))}
                  y={360 + Math.sin(t * 1.5) * 14}
                  scale={0.6}
                  banner={["HYBRID: BEST OF BOTH WORLDS"]}
                />
              ) : null}
              {kicking ? <KickLine t={t} lead="copilot" agents={t >= at("soLong4")} /> : null}
              {during(t, at("windows"), at("cause")) ? (
                <g transform={`translate(0 ${fly(t, at("windows") - 0.3)})`}>
                  <path d="M640,130 V300 M1280,130 V300" stroke={ink} strokeWidth="2" />
                  <ContextWindow x={640} y={470} label="8K" smash={0} />
                  <ContextWindow x={960} y={470} label="128K" smash={smash128} />
                  <ContextWindow x={1280} y={470} label="1M" smash={smash1m} />
                </g>
              ) : null}
              {during(t, at("windows"), at("cause")) ? (
                <Cut>
                  <Engineer x={charge.x - recoil} y={charge.y} scale={0.8} pose={pose} />
                  {smash128 < 0.4 || t > 115 ? (
                    <Monorepo
                      x={charge.x + mix(60, 40, shove128) - recoil}
                      y={mix(640, 520, shove128) - (t > 115 ? shove1m * 40 : 0)}
                      rotate={-8 + shake(t, 2)}
                    />
                  ) : null}
                </Cut>
              ) : null}
              {during(t, at("cause"), at("soLong4") + 1) ? (
                <g filter="url(#cut)" opacity={1 - ramp(t, at("soLong4") + 0.6, at("soLong4") + 0.9)}>
                  <rect x={soap - 100} y="692" width="200" height="98" fill={wood.base} stroke={ink} strokeWidth="3" />
                  <text x={soap} y="754" textAnchor="middle" fontFamily={font.caps} fontSize="24" fill={paper.light}>
                    SOAP
                  </text>
                </g>
              ) : null}
              {during(t, at("cause"), at("seventeen")) ? (
                <g>
                  <Cut>
                    <Copilot
                      x={soap}
                      y={696 - hop(t) * 6}
                      scale={0.72}
                      hat="deerstalker"
                      armL={t > 117.34 ? 60 : 105}
                      armR={t > 117.34 ? 150 : 40}
                      holdL={<MagnifyingGlass />}
                      mouth={t > 117.34 ? "grin" : "o"}
                      look={{ x: -1, y: 0 }}
                    />
                    <Engineer x={640} y={898} scale={0.8} pose={pose} />
                  </Cut>
                </g>
              ) : null}
              {during(t, at("seventeen"), at("soLong4") + 1) ? (
                <g opacity={1 - ramp(t, at("soLong4") + 0.6, at("soLong4") + 0.9)}>
                  <Cauldron x={860} y={790} t={t} scale={0.8} />
                  <Cut>
                    <Copilot
                      x={soap}
                      y={696 - hop(t) * 4}
                      scale={0.72}
                      hat="deerstalker"
                      armL={t > 121.12 ? 160 : 150}
                      armR={t > 121.12 ? 160 : 40}
                      holdL={t > 121.12 ? undefined : <Ladle tilt={76 + Math.sin(t * 16) * 12} />}
                      mouth={t > 121.12 ? "smile" : "grin"}
                      look={{ x: -0.6, y: 0.6 }}
                    />
                    <Engineer x={520} y={898} scale={0.8} pose={pose} />
                  </Cut>
                  {Array.from({ length: 17 }, (_, i) => (
                    <Folder key={i} x={470 + i * 61} y={898} full={Math.min(1, Math.max(0, filled - i))} />
                  ))}
                  <g transform="translate(960 300)" filter="url(#cut)">
                    <rect
                      x="-150"
                      y="-50"
                      width="300"
                      height="100"
                      rx="8"
                      fill="#1b1c1f"
                      stroke={gold.base}
                      strokeWidth="6"
                    />
                    <text x="-80" y="16" textAnchor="middle" fontFamily={font.typewriter} fontSize="40" fill="#4fe07a">
                      +{diff.toLocaleString("en-US")}
                    </text>
                    <text x="90" y="16" textAnchor="middle" fontFamily={font.typewriter} fontSize="40" fill="#e23b3b">
                      {"\u2212"}3
                    </text>
                  </g>
                </g>
              ) : null}
              {lab ? (
                <g>
                  {t >= 127.5 ? (
                    <g transform={`translate(0 ${(chartDown - 1) * 700})`}>
                      <OrgChart x={960} y={176} rows={rows} />
                    </g>
                  ) : null}
                  {t < at("planned") ? (
                    <Cut>
                      <TeslaCoil x={560} y={860} scale={0.8} />
                      <TeslaCoil x={1360} y={860} scale={0.8} />
                      <KnifeSwitch x={1500} y={700} thrown={thrown} label="AWAKEN AGENTS" />
                      {slabs.map((x, k) => {
                        const up = rising(k)
                        return (
                          <g key={x}>
                            <Slab x={x} y={900} />
                            <Agent
                              x={x + 80 * (1 - up)}
                              y={mix(774, 815, up)}
                              scale={0.9}
                              rotate={-86 * (1 - up)}
                              awake={awake(k)}
                              armL={mix(20, 150, up)}
                              armR={mix(20, 160, up)}
                              tint={["#c9d0dc", "#d8c7a1", "#b9d4c4"][k]}
                            />
                          </g>
                        )
                      })}
                      <Copilot
                        x={1530}
                        y={880}
                        scale={0.7}
                        goggles
                        armL={thrown > 0 ? 80 : 150}
                        armR={120}
                        mouth="grin"
                        look={{ x: -1, y: -0.2 }}
                      />
                      <Engineer x={470} y={898} scale={0.74} pose={pose} />
                    </Cut>
                  ) : null}
                  {bolts ? (
                    <g>
                      <Bolt
                        points={[
                          { x: 560, y: 650 },
                          { x: 610, y: 600 },
                          { x: 650, y: 690 },
                          { x: 700, y: 650 },
                          { x: 730, y: 770 }
                        ]}
                      />
                      <Bolt
                        points={[
                          { x: 1360, y: 650 },
                          { x: 1310, y: 600 },
                          { x: 1270, y: 690 },
                          { x: 1220, y: 650 },
                          { x: 1190, y: 770 }
                        ]}
                      />
                      <Bolt
                        points={[
                          { x: 730, y: 770 },
                          { x: 820, y: 710 },
                          { x: 890, y: 770 },
                          { x: 960, y: 760 }
                        ]}
                      />
                    </g>
                  ) : null}
                  {t >= at("planned") ? (
                    <g>
                      {succeeded ? <Solitaire t={t} from={133.5} /> : null}
                      <g transform="translate(960 380)" filter="url(#cut)">
                        <rect
                          x="-240"
                          y="-110"
                          width="480"
                          height="200"
                          rx="16"
                          fill="url(#goldMetal)"
                          stroke={ink}
                          strokeWidth="5"
                        />
                        <rect
                          x="-210"
                          y="-82"
                          width="420"
                          height="140"
                          rx="8"
                          fill="#14181a"
                          stroke={ink}
                          strokeWidth="3"
                        />
                        <text
                          y="-6"
                          textAnchor="middle"
                          fontFamily={font.typewriter}
                          fontSize="44"
                          fill={succeeded ? "#4fe07a" : "#e23b3b"}
                        >
                          {succeeded ? "Build succeeded" : "Build failed"}
                        </text>
                        <text y="40" textAnchor="middle" fontFamily={font.typewriter} fontSize="22" fill="#9aa3ad">
                          {succeeded ? "0 errors. Somehow." : "17 errors"}
                        </text>
                      </g>
                      {unveil < 1 && succeeded ? null : null}
                      <Cut>
                        {[
                          { x: 520, tint: "#c9d0dc", at: 129.44 },
                          { x: 800, tint: "#d8c7a1", at: 130.06 },
                          { x: 1080, tint: "#b9d4c4", at: 130.7 },
                          { x: 1360, tint: "#e2c9e6", at: 131.4 }
                        ].map((agent, k) => {
                          const on = t >= agent.at
                          const kick = Math.max(0, Math.sin(Math.PI * (b - Math.floor(b))))
                          const lean = k % 2 === 0 ? -1 : 1
                          let arms = { l: 30, r: 30 }
                          if (succeeded) {
                            arms = { l: 160, r: 160 }
                          } else if (on) {
                            arms = { l: 120, r: 150 }
                          }
                          return (
                            <Agent
                              key={agent.x}
                              x={agent.x}
                              y={898 - (on ? hop(t) * 8 : 0)}
                              scale={0.92}
                              rotate={on ? lean * kick * 6 : 0}
                              armL={arms.l}
                              armR={arms.r}
                              tint={agent.tint}
                            />
                          )
                        })}
                      </Cut>
                      {t >= 129.44 && t < 133.3 ? (
                        <g transform="translate(520 560) rotate(-6)" filter="url(#cut)">
                          <rect x="-110" y="-70" width="220" height="140" fill="#2e5cb8" stroke={ink} strokeWidth="3" />
                          <path d="M-90,-40 H90 M-90,0 H40 M-90,40 H70 M0,-60 V60" stroke="#dbe7ff" strokeWidth="3" />
                          <text y="-50" textAnchor="middle" fontFamily={font.caps} fontSize="18" fill="#fff">
                            The Plan
                          </text>
                        </g>
                      ) : null}
                      {t >= 130.06 && t < 133.3 ? (
                        <Say
                          x={630}
                          y={420}
                          width={340}
                          lines={["Thought for", "47 seconds\u2026"]}
                          tail={{ x: 800, y: 640 }}
                        />
                      ) : null}
                      {t >= 130.7 && t < 133.3 ? (
                        <g transform={`translate(1100 ${mix(500, 600, settle(t, 130.9, 12, 300))}) rotate(-10)`}>
                          <rect x="-80" y="-30" width="160" height="60" fill="none" stroke="#2f7d4f" strokeWidth="6" />
                          <text y="16" textAnchor="middle" fontFamily={font.poster} fontSize="40" fill="#2f7d4f">
                            LGTM
                          </text>
                        </g>
                      ) : null}
                      {[1080, 1360].map((x, k) =>
                        t >= (k === 0 ? 130.7 : 131.4) ? (
                          <g key={x}>
                            <circle
                              cx={x + 14}
                              cy={898 - 0.92 * 214}
                              r="16"
                              fill="none"
                              stroke={gold.base}
                              strokeWidth="4"
                            />
                            {k === 1 ? (
                              <circle
                                cx={x + 14}
                                cy={898 - 0.92 * 214}
                                r="26"
                                fill="none"
                                stroke={gold.base}
                                strokeWidth="4"
                              />
                            ) : null}
                          </g>
                        ) : null
                      )}
                      {succeeded ? (
                        <g transform="translate(960 660)" filter="url(#cut)">
                          <rect
                            x="-200"
                            y="-56"
                            width="400"
                            height="112"
                            rx="10"
                            fill="url(#goldMetal)"
                            stroke={ink}
                            strokeWidth="4"
                          />
                          <text y="-12" textAnchor="middle" fontFamily={font.caps} fontSize="24" fill={ink}>
                            On this spot in 2026
                          </text>
                          <text y="24" textAnchor="middle" fontFamily={font.caps} fontSize="24" fill={ink}>
                            the build succeeded
                          </text>
                          <g
                            transform={`translate(${unveil * 520} ${-unveil * 260}) rotate(${unveil * 40})`}
                            opacity={1 - unveil * 0.8}
                          >
                            <rect
                              x="-220"
                              y="-70"
                              width="440"
                              height="140"
                              fill={velvet.base}
                              stroke={ink}
                              strokeWidth="3"
                            />
                          </g>
                        </g>
                      ) : null}
                    </g>
                  ) : null}
                </g>
              ) : null}
              {t >= 115.5 && t < 116.9 ? (
                <g
                  transform={`translate(1520 ${mix(1000, 620, settle(t, 115.5, 9, 180)) + ramp(t, 116.5, 116.9) * 400})`}
                >
                  <SadLady x={0} y={0} scale={0.8} />
                </g>
              ) : null}
            </g>
          }
          front={
            <g>
              {t >= 117.34 && t < 118.94 ? (
                <Say x={1140} y={300} width={400} lines={["I found the cause!"]} tail={{ x: soap + 10, y: 470 }} />
              ) : null}
              {t >= 121.12 && t < 122.48 ? (
                <Say x={1160} y={380} width={330} lines={["Just because."]} tail={{ x: soap + 20, y: 470 }} />
              ) : null}
            </g>
          }
          light={
            <g>
              {bolts ? (
                <rect
                  x="150"
                  y="130"
                  width="1620"
                  height="780"
                  fill="#dff6ff"
                  opacity="0.25"
                  style={{ mixBlendMode: "screen" }}
                />
              ) : null}
              <Spot x={960} y={870} rx={420} ry={80} />
            </g>
          }
        />
        {during(t, at("soLong4"), at("soLong4") + 1.2) ? (
          <Cut>
            <Copilot
              x={540}
              y={900}
              scale={0.62}
              armL={130 + Math.sin(t * 30) * 6}
              armR={40}
              holdL={<SprayCan t={t} />}
              mouth="grin"
              look={{ x: -1, y: -0.4 }}
            />
          </Cut>
        ) : null}
      </Camera>
    </Canvas>
  )
}
