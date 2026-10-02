import { Easing, random } from "remotion"
import { cards } from "../acts"
import { Crystal, PatentCube, patents } from "../awards"
import { Clippy } from "../cast/clippy"
import { Colonel, colonelLegs } from "../cast/colonel"
import { Copilot, Sparkle } from "../cast/copilot"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { Octocat, PullRequest } from "../cast/octocat"
import { SchoolDataSync, sdsLegs } from "../cast/sds"
import { bonk, Choir } from "../choir"
import { AirBalloon, Moon, RocketFlight } from "../machines"
import { during, fly, hop, keys, mix, onTwos, ramp, settle, shake, sway } from "../motion"
import { BankerLamp, Beetle, BuildTower, Chair, CuckooClock, Desk, Dialog, Gauge, Laptop, TeamsWall } from "../office"
import { Camera, Canvas, Cut } from "../paper"
import { Say } from "../props"
import { Heaven, Rome } from "../sets"
import { HouseCurtain, Spot, Theatre } from "../theatre"
import { font, ink, paper } from "../theme"
import { at, beats } from "../timeline"
import { walk } from "../walk"

// Act I, the first verse: the Engineer's office from the curtain up to logging off, by way of Rome, a tower of code,
// the Colonel, heaven, a crystal and three patent cubes.

const desk = { x: 600, y: 898 }
const centre = 980
// The cuckoo clock hangs over the right of the desk, clear of the swag above the Engineer.
const cuckoo = { x: 660, y: 450 }
// The moon on its string in Rome, and where a rocket in its eye sits.
const moon = { x: 700, y: 440, r: 70 }
const eye = { x: moon.x + (98 * moon.r) / 110, y: moon.y - (80 * moon.r) / 110 }

// A puff of smoke, for quick changes.
const Puff = ({ x, y, age }: { x: number; y: number; age: number }) =>
  age < 0 || age > 0.7 ? null : (
    <g opacity={1 - age / 0.7} fill="#f4efe4" stroke={ink} strokeWidth="3" filter="url(#cut)">
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2
        const r = 40 + age * 160
        return <circle key={i} cx={x + Math.cos(a) * r * 0.8} cy={y + Math.sin(a) * r * 0.5} r={46 + age * 40} />
      })}
    </g>
  )

// The red pill Teams shows when you've been talking to no one.
const MuteBanner = ({ x, y, pop }: { x: number; y: number; pop: number }) => (
  <g transform={`translate(${x} ${y}) scale(${pop})`} filter="url(#cut)">
    <rect x="-160" y="-26" width="320" height="52" rx="26" fill="#c4314b" stroke={ink} strokeWidth="3" />
    <text y="10" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="26" fill="#fff">
      {"You\u2019re on mute!"}
    </text>
  </g>
)

const ride = [
  { x: -230, y: 70 },
  { x: -170, y: -30 },
  { x: -120, y: 30 },
  { x: -50, y: -110 },
  { x: -10, y: -10 },
  { x: 60, y: -170 },
  { x: 120, y: 50 },
  { x: 170, y: -70 },
  { x: 240, y: -210 }
] as const

const along = (u: number) => {
  const f = Math.min(0.9999, Math.max(0, u)) * (ride.length - 1)
  const i = Math.floor(f)
  const a = ride[i] ?? ride[0]
  const b = ride[i + 1] ?? a
  const k = f - i
  return { x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

// "Endless thrills": the monthly chart on an easel, ridden end to end by Clippy in a switchback car.
const Coaster = ({ x, y, u }: { x: number; y: number; u: number }) => {
  const car = along(u)
  const hatGone = u > 0.68
  const hatFlight = Math.max(0, u - 0.68) * 3
  const floor = 898 - y
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={`M-200,${floor} L-150,-260 M200,${floor} L150,-260 M0,${floor} V-240`}
        stroke="#5a3818"
        strokeWidth="12"
      />
      <g filter="url(#cut)">
        <rect x="-290" y="-280" width="580" height="400" fill={paper.light} stroke={ink} strokeWidth="3" />
        <text y="-236" textAnchor="middle" fontFamily={font.caps} fontSize="26" letterSpacing="3" fill={ink}>
          Monthly Active Thrills
        </text>
        {[-150, -90, -30, 30, 90].map((gy) => (
          <path key={gy} d={`M-260,${gy} H260`} stroke="#c9b48a" strokeWidth="1.5" />
        ))}
      </g>
      <path
        d={`M${ride.map(({ x: px, y: py }) => `${px},${py}`).join(" L")}`}
        fill="none"
        stroke={ink}
        strokeWidth="9"
        strokeLinejoin="round"
      />
      <path
        d={`M${ride.map(({ x: px, y: py }) => `${px},${py}`).join(" L")}`}
        fill="none"
        stroke="#d63c3c"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {u > 0 && u < 1 ? (
        <g transform={`translate(${car.x} ${car.y}) rotate(${car.angle})`}>
          <Clippy x={0} y={-14} scale={0.2} brows={1} mouth="o" hat={!hatGone} />
          <rect x="-28" y="-24" width="56" height="22" rx="4" fill="#2e5cb8" stroke={ink} strokeWidth="2.5" />
          <circle cx="-16" cy="0" r="6" fill={ink} />
          <circle cx="16" cy="0" r="6" fill={ink} />
        </g>
      ) : null}
      {hatGone && hatFlight < 1.2 ? (
        <g
          transform={`translate(${60 + hatFlight * 160} ${-200 - hatFlight * 220 + hatFlight * hatFlight * 300}) rotate(${hatFlight * 500})`}
        >
          <rect x="-8" y="-16" width="16" height="16" fill="#1e1b1b" stroke={ink} strokeWidth="1.5" />
          <rect x="-12" y="-2" width="24" height="4" fill="#1e1b1b" />
        </g>
      ) : null}
    </g>
  )
}

// The pipeline in its hospital bed: copper pipes patched with tape, sitting up by `sit`.
const Bed = ({ x, y, sit, t }: { x: number; y: number; sit: number; t: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <g filter="url(#cut)">
      <path d="M-170,0 V-150 M170,0 V-110 M-170,-150 H-140 M-170,-100 H170" stroke="#9aa3ad" strokeWidth="8" />
      <circle cx="-150" cy="4" r="10" fill={ink} />
      <circle cx="150" cy="4" r="10" fill={ink} />
      <rect x="-160" y="-110" width="320" height="34" rx="10" fill="#f4f6f8" stroke={ink} strokeWidth="3" />
    </g>
    <g transform={`rotate(${-sit * 28} -120 -110)`}>
      <g filter="url(#cut)">
        <path
          d="M-130,-118 H40 Q80,-118 80,-160 V-200 Q80,-232 112,-232"
          fill="none"
          stroke={ink}
          strokeWidth="30"
          strokeLinecap="round"
        />
        <path
          d="M-130,-118 H40 Q80,-118 80,-160 V-200 Q80,-232 112,-232"
          fill="none"
          stroke="#c87a3c"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <circle cx="120" cy="-232" r="30" fill="#b8692e" stroke={ink} strokeWidth="3" />
        <circle cx="112" cy="-238" r="6" fill={ink} />
        <circle cx="130" cy="-238" r="6" fill={ink} />
        <path
          d={sit > 0.5 ? "M108,-222 Q120,-212 132,-222" : "M108,-218 H132"}
          stroke={ink}
          strokeWidth="3"
          fill="none"
        />
        {[-90, -10, 80].map((px, i) => (
          <path
            key={px}
            d={`M${px - 14},${i === 2 ? -186 : -132} l28,28 M${px + 14},${i === 2 ? -186 : -132} l-28,28`}
            stroke="#f4f6f8"
            strokeWidth="9"
          />
        ))}
        <rect x="-40" y="-140" width="24" height="44" fill="#9aa3ad" stroke={ink} strokeWidth="2.5" />
      </g>
      {sit > 0.5 ? (
        <g opacity={Math.max(0, 1 - (t % 1.2))} fill="#fff" stroke={ink} strokeWidth="2">
          <circle cx="-28" cy={-160 - (t % 1.2) * 60} r={10 + (t % 1.2) * 14} />
        </g>
      ) : null}
    </g>
    <rect x="-150" y="-104" width="250" height="40" rx="8" fill="#dbe7f3" stroke={ink} strokeWidth="2.5" />
  </g>
)

// A heart monitor on a stand: a blip on every beat, or a flat line while `flat`.
const Monitor = ({ x, y, t, flat }: { x: number; y: number; t: number; flat: boolean }) => {
  const trace = Array.from({ length: 40 }, (_, i) => {
    const px = -70 + i * 3.6
    const phase = (beats(t) * 1 - i * 0.05) % 1
    const spike = !flat && phase > 0 && phase < 0.12 ? Math.sin((phase / 0.12) * Math.PI * 2) * 32 : 0
    return `${px},${-spike}`
  }).join(" L")
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0,0 V-200 M-40,0 H40" stroke="#9aa3ad" strokeWidth="8" />
      <g filter="url(#cut)">
        <rect x="-90" y="-320" width="180" height="130" rx="10" fill="#cfd5dc" stroke={ink} strokeWidth="3" />
        <rect x="-78" y="-306" width="156" height="100" fill="#0d1a12" stroke={ink} strokeWidth="2" />
      </g>
      <path d={`M${trace}`} transform="translate(0 -256)" fill="none" stroke="#5dff8a" strokeWidth="3" />
    </g>
  )
}

const blocks = [
  "// TODO",
  "legacy",
  "utils2",
  "if (",
  "helpers",
  "=> {",
  "v2_old",
  "})",
  "config",
  "hacks",
  "core",
  "main"
]

// The tower of code, one block hooked out by `pull` and the lot coming down by `fall`.
const Jenga = ({ x, y, pull, fall }: { x: number; y: number; pull: number; fall: number }) => (
  <g transform={`translate(${x} ${y})`}>
    {blocks.map((label, i) => {
      const pulled = i === 3
      const dx = (random(`jx${i}`) - 0.5) * 520 * fall + (pulled ? -150 * pull : 0)
      const drop = fall * (i * 30 + 30)
      const spin = (random(`jr${i}`) - 0.5) * 160 * fall
      const wobble = fall > 0 ? 0 : Math.sin(pull * 20) * pull * i * 0.6
      return (
        <g key={label} transform={`translate(${dx + wobble} ${-i * 34 + drop}) rotate(${spin})`} filter="url(#cut)">
          <rect
            x="-80"
            y="-34"
            width="160"
            height="34"
            fill={i % 2 === 0 ? "#e9c98f" : "#d9b277"}
            stroke={ink}
            strokeWidth="2.5"
          />
          <text y="-10" textAnchor="middle" fontFamily={font.typewriter} fontSize="17" fill={ink}>
            {label}
          </text>
        </g>
      )
    })}
  </g>
)

// The engineer's whole verse, scene by scene. `t` is seconds since the start of the song.
export const Verse1 = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const b = beats(s)

  // Where the camera is: the stage from the stalls, a push on the cuckoo clock, and a pull to show the boxes for
  // heaven and the cubes.
  const camera = {
    scale: keys(t, [
      [21.1, 1],
      [21.8, 1.32],
      [24.2, 1.32],
      [24.8, 1],
      [33.9, 1],
      [34.7, 0.8],
      [38.15, 0.8],
      [38.45, 1.25],
      [38.95, 1.25],
      [39.35, 0.8],
      [39.5, 0.8],
      [40.5, 1]
    ]),
    x: keys(t, [
      [21.1, 960],
      [21.8, cuckoo.x],
      [24.2, cuckoo.x],
      [24.8, 960],
      [33.9, 960],
      [34.7, 880],
      [38.15, 880],
      [38.45, 40],
      [38.95, 40],
      [39.35, 880],
      [39.5, 880],
      [40.5, 960]
    ]),
    y: keys(t, [
      [21.1, 540],
      [21.8, 450],
      [24.2, 450],
      [24.8, 540],
      [33.9, 540],
      [34.7, 560],
      [38.15, 560],
      [38.45, 480],
      [38.95, 480],
      [39.35, 560],
      [39.5, 560],
      [40.5, 540]
    ])
  }

  const curtainUp = ramp(t, 13, 14.1, Easing.inOut(Easing.cubic))
  const lit = Math.max(0, Math.min(6, Math.floor(b - beats(at("tenYears"))) + 1))
  const dashboard = ramp(s, 18.1, 18.5)
  const romeIn = fly(t, 27.45, 33.95)
  const heavenIn = fly(t, 33.95, 38.7)
  const open = ramp(t, 34.2, 35.1)

  // The Engineer: at the desk until the quick change into a toga, then centre stage in the hoodie again for the
  // Jenga, heaven and the cubes.
  const atDesk = t < 27.7
  const toga = during(t, 27.7, 30.85)
  const slump = ramp(s, 23.2, 23.6) * (1 - ramp(s, 24.3, 24.7))
  const startled = during(s, 16.5, 17.3) || during(s, 26.3, 26.86)
  const typing = Math.sin(Math.PI * 2 * b)
  let pose: EngineerPose = {
    armL: 30,
    elbowL: 62 + typing * 10,
    armR: 34,
    elbowR: 70 - typing * 10,
    look: { x: 0.5, y: 0.6 },
    mouth: "smile"
  }
  if (atDesk) {
    if (during(s, 15.5, 16.2)) {
      pose = { ...pose, mouth: "sing", look: { x: 0, y: -0.2 } }
    } else if (during(s, 16.2, 16.5)) {
      pose = { ...pose, armR: 150, elbowR: 125, openR: true, mouth: "smile", look: { x: 0.4, y: -0.3 } }
    }
    if (startled) {
      pose = {
        ...pose,
        armL: 70,
        elbowL: 40,
        armR: 70,
        elbowR: 40,
        openL: true,
        openR: true,
        mouth: "o",
        look: { x: 1, y: 0.3 }
      }
    }
    if (during(s, 18.1, 21)) {
      pose = { ...pose, look: { x: 0.2, y: -0.8 }, mouth: "sing" }
    }
    if (slump > 0) {
      pose = {
        ...pose,
        armL: 20,
        elbowL: 20,
        armR: 20,
        elbowR: 20,
        tilt: 22 * slump,
        mouth: "sad",
        look: { x: 0, y: 1 }
      }
    }
  }

  // Rome: three words pointed at with the cane, then the rocket.
  const word = [at("iCame") + 0.18, 28.86, 29.66].map((w) => ramp(s, w, w + 0.15)) as [number, number, number]
  const pointAt = [0, 1, 2].findLast((i) => s >= ([27.98, 28.86, 29.66][i] ?? 99)) ?? -1
  if (toga) {
    const twirl = ramp(s, 30.3, 30.8)
    pose = {
      armL: pointAt === 0 ? 150 : 25,
      elbowL: 10,
      openL: true,
      armR: pointAt >= 1 ? 110 + pointAt * 10 : 30,
      elbowR: pointAt >= 1 ? 10 : 20,
      cane:
        twirl > 0
          ? { hand: "right", angle: 120 + twirl * 720, grip: 0.5 }
          : { hand: "right", angle: pointAt >= 1 ? 128 + pointAt * 12 : 4 },
      mouth: "sing",
      look: { x: pointAt === 0 ? -0.6 : 0.6, y: -0.8 },
      dress: "toga",
      headset: "off"
    }
  }

  // The tower of code: walk over, hook a block out, watch it go, get told off and back away.
  const across = walk(s, { from: 31.2, to: 31.75, x0: centre, x1: 1060, steps: 2, scale: 0.82 })
  const away = walk(s, { from: 33.3, to: 33.9, x0: 1060, x1: centre, steps: 2, scale: 0.82, gait: "back" })
  const footing = t < 33.3 ? across : away
  const hook = ramp(s, 31.8, 32.4, Easing.inOut(Easing.cubic))
  const collapse = ramp(t, 32.96, 33.7, Easing.in(Easing.quad))
  const engineerX = (() => {
    if (atDesk) {
      return desk.x
    }
    if (t < 30.85) {
      return centre
    }
    return footing.x
  })()
  if (t >= 30.85 && t < 34.16) {
    pose = {
      armL: 20,
      elbowL: 12,
      armR: hook > 0 && hook < 1 ? 96 : 40,
      elbowR: hook > 0 && hook < 1 ? -6 : 20,
      cane: { hand: "right", angle: hook > 0 && hook < 1 ? 92 : 20, grip: hook > 0 && hook < 1 ? 1 : 0 },
      stride: footing.stride,
      mouth: collapse > 0 ? "o" : "sing",
      look: { x: 0.8, y: collapse > 0 ? -0.6 : 0 }
    }
    if (t >= 33.55) {
      pose = {
        stride: footing.stride,
        armL: 160,
        elbowL: 10,
        armR: 160,
        elbowR: 10,
        openL: true,
        openR: true,
        cane: "hood",
        mouth: "o",
        look: { x: 0.7, y: 0 }
      }
    }
  }

  // Heaven: the crystal comes down into the raised left hand and goes into the pocket; then the cubes.
  const crystalFall = settle(t, 34.36, 13, 170)
  const tossStart = 36.2
  // A three-cube cascade: hands at either side, each cube throwing from hand to hand on the half-beat.
  const hand = { l: { x: engineerX - 113, y: 676 }, r: { x: engineerX + 113, y: 676 } }
  const period = (60 / 145.94) * 2
  const cube = (k: number) => {
    const fallAt = [35.78, 36, 36.18][k] ?? 36
    const leaveAt = [37.3, 37.7, 38.1][k] ?? 38
    const into = k === 1 ? hand.l : hand.r
    if (t < fallAt) {
      return { x: into.x, y: -120, spin: 0, show: t > fallAt - 0.6 }
    }
    if (t < tossStart + k * (period / 3)) {
      const drop = ramp(t, fallAt - 0.35, fallAt, Easing.in(Easing.quad))
      return { x: into.x, y: mix(-120, into.y, drop), spin: drop * 90, show: true }
    }
    if (t < leaveAt) {
      const u = ((t - tossStart - k * (period / 3)) / period) % 1
      const outward = u < 0.5
      const v = outward ? u * 2 : (u - 0.5) * 2
      const from = outward ? hand.r : hand.l
      const to = outward ? hand.l : hand.r
      return { x: mix(from.x, to.x, v), y: from.y - 230 * 4 * v * (1 - v), spin: v * 360, show: true }
    }
    const gone = t - leaveAt
    if (k === 0) {
      return { x: hand.r.x + gone * 60, y: hand.r.y - gone * 1600, spin: gone * 900, show: gone < 0.6 }
    }
    if (k === 1) {
      return {
        x: hand.r.x + gone * 2400,
        y: hand.r.y - 200 * gone + 400 * gone * gone,
        spin: gone * 1200,
        show: gone < 0.5
      }
    }
    const v = Math.min(1, gone / (bonk - leaveAt))
    const fallen = Math.max(0, t - bonk)
    return {
      x: mix(hand.l.x, -10, v),
      y: t < bonk ? mix(hand.l.y, 470, v) - 340 * 4 * v * (1 - v) : 470 + fallen * 400,
      spin: v * 720 + fallen * 200,
      show: fallen < 0.2
    }
  }
  const juggling = t >= tossStart && t < 38.3
  if (t >= 34.16 && t < 39.06) {
    const raised = t < 35.25
    pose = {
      armL: raised ? 160 : 20,
      elbowL: raised ? 10 : 100 + Math.sin(t * 15) * 10,
      armR: 20,
      elbowR: 100 - Math.sin(t * 15) * 10,
      openL: true,
      openR: true,
      cane: "hood",
      mouth: raised ? "o" : "grin",
      look: raised ? { x: -0.4, y: -1 } : { x: 0, y: -0.9 }
    }
    if (t >= 35.25 && t < 35.55) {
      pose = { ...pose, armL: 18, elbowL: -20 }
    }
    if (t >= 37.3 && t < 37.6) {
      pose = { ...pose, armR: 150, elbowR: 10, look: { x: 0.2, y: -1 } }
    } else if (t >= 37.7 && t < 38) {
      pose = { ...pose, armR: 100, elbowR: -10, look: { x: 1, y: -0.2 } }
    } else if (t >= 38.1 && t < bonk) {
      pose = { ...pose, armL: 140, elbowL: 0, look: { x: -1, y: -0.6 } }
    } else if (t >= bonk) {
      pose = { ...pose, armL: 120, elbowL: 130, armR: 120, elbowR: 130, mouth: "o", look: { x: -1, y: -0.4 }, tilt: -6 }
    }
  }
  // Logging off: the dialog flies in, the cane taps "Log off", the desk lamp goes out and Copilot takes the chair.
  const dialogIn = fly(t, 38.95, 39.75, 700)
  const tap = ramp(s, 39.1, 39.32)
  if (t >= 39.06) {
    pose = {
      armL: 16,
      elbowL: 14,
      armR: mix(40, 128, tap) - ramp(s, 39.5, 39.8) * 90,
      elbowR: 10,
      cane: { hand: "right", angle: mix(20, 140, tap) - ramp(s, 39.5, 39.8) * 120, grip: 0.2 },
      mouth: "smile",
      look: { x: -0.5, y: -0.6 }
    }
  }
  const lampOn = t < 39.45 ? 1 : 0
  const copilotIn = ramp(s, 39.7, 40.4, Easing.out(Easing.back(1.3)))

  // The bugs: three beetles across the desk on "bugs".
  const beetles = [0, 1, 2].map((i) => {
    const u = ramp(t, 16.5 + i * 0.18, 17.3 + i * 0.18, Easing.linear)
    return { x: mix(desk.x - 130, desk.x + 140, u), show: u > 0 && u < 1, walk: t }
  })

  // School Data Sync runs the hospital bed on, and off after it once it's rolling.
  const orderly =
    t < 27
      ? walk(t, { from: 24.46, to: 25.6, x0: 2190, x1: 1390, steps: 9, gait: "run", scale: 0.72, build: sdsLegs })
      : walk(t, {
          from: 27.4,
          to: 28.15,
          x0: 1390,
          x1: 1850,
          steps: 6,
          gait: "run",
          scale: 0.72,
          build: sdsLegs,
          rush: true
        })
  const colonelIn = walk(t, { from: 32.3, to: 33.3, x0: 1850, x1: 1500, steps: 5, gait: "march", build: colonelLegs })
  const colonelOff = walk(t, { from: 35, to: 36, x0: 1500, x1: 1850, steps: 5, gait: "march", build: colonelLegs })
  const rocket = ramp(t, 29.7, 30.5, Easing.inOut(Easing.quad))

  return (
    <Canvas>
      <Camera scale={camera.scale} look={{ x: camera.x, y: camera.y }}>
        <Theatre
          card={cards.act1}
          boxes={{
            left: <Choir t={t} side="left" mood={during(t, 34.2, 36.7) ? "sing" : "watch"} />,
            right: <Choir t={t} side="right" mood={during(t, 34.2, 36.7) ? "sing" : "watch"} />
          }}
          backdrop={
            <g>
              <TeamsWall lit={lit} t={t} />
              {dashboard > 0 && t < 27.6 ? (
                <g>
                  {[0, 1, 2, 3, 4, 5].map((i) => {
                    const col = i % 3
                    const row = Math.floor(i / 3)
                    const flip = Math.max(0.05, Math.abs(1 - 2 * Math.min(1, dashboard * 1.4 - i * 0.07)))
                    const shown = dashboard * 1.4 - i * 0.07 > 0.5
                    return shown ? (
                      <g key={i} transform={`translate(${740 + col * 220} ${240 + row * 190}) scale(${flip} 1)`}>
                        <rect
                          x="-82"
                          y="-62"
                          width="164"
                          height="124"
                          fill={paper.light}
                          stroke={ink}
                          strokeWidth="2"
                        />
                        <Gauge
                          x={0}
                          y={4}
                          r={46}
                          needle={-60 + Math.sin(t * (3 + i) + i) * 50 + (i === 5 ? 80 : 0)}
                          label={["UPTIME", "LATENCY", "VIBES", "ERRORS", "COFFEE", "MAU"][i] ?? ""}
                        />
                      </g>
                    ) : null
                  })}
                </g>
              ) : null}
              <g transform={`translate(0 ${romeIn})`}>
                <Rome lit={word} />
              </g>
              <g transform={`translate(0 ${heavenIn})`}>
                <Heaven open={open} />
              </g>
            </g>
          }
          stage={
            <g>
              {romeIn > -900 ? (
                <g transform={`translate(0 ${romeIn})`}>
                  <path d={`M${moon.x},130 V${moon.y - moon.r}`} stroke={ink} strokeWidth="2" />
                  <Moon x={moon.x} y={moon.y} r={moon.r} hit={t > 30.5} />
                </g>
              ) : null}
              {t >= 29.7 && t < 30.5 ? (
                <RocketFlight from={[1560, 780]} to={[eye.x, eye.y]} lift={320} u={rocket} scale={moon.r / 110} />
              ) : null}
              {during(t, 18.8, 21.4) ? (
                <g>
                  {[0, 1].map((i) => {
                    const up = ramp(s, 18.9 + i * 0.2, 20.2 + i * 0.2, Easing.out(Easing.quad))
                    const x = desk.x + 80 + i * 130
                    if (i === 0 && t > 19.7) {
                      return null
                    }
                    if (i === 0 && t > 19.42) {
                      return (
                        <g key={i} transform={`translate(${x} ${700 - up * 360})`}>
                          {Array.from({ length: 8 }, (_, k) => (
                            <path
                              key={k}
                              d={`M0,0 L${Math.cos((k / 8) * Math.PI * 2) * 60},${Math.sin((k / 8) * Math.PI * 2) * 60}`}
                              stroke={ink}
                              strokeWidth="4"
                            />
                          ))}
                        </g>
                      )
                    }
                    return (
                      <Cut key={i}>
                        <AirBalloon
                          x={x}
                          y={760 - up * 400 + Math.sin(t * 2 + i) * 6}
                          scale={0.42}
                          banner={[`RING ${i}`]}
                        />
                      </Cut>
                    )
                  })}
                </g>
              ) : null}
              {t < 27.8 ? (
                <Cut>
                  <Chair x={desk.x} y={desk.y - 4} scale={0.95} />
                </Cut>
              ) : null}
              <Cut>
                {t >= 39.6 ? <Chair x={desk.x} y={desk.y - 4} scale={0.95} /> : null}
                {t >= 39.6 ? (
                  <Copilot
                    x={mix(80, desk.x, copilotIn)}
                    y={desk.y - 30 - Math.abs(Math.sin(ramp(s, 40.3, 40.7) * Math.PI * 2)) * 16}
                    scale={0.62}
                    armL={40}
                    armR={60}
                    mouth="grin"
                    look={{ x: 0.6, y: 0.2 }}
                  />
                ) : null}
                {during(t, 24.3, 28.15) ? (
                  <SchoolDataSync
                    x={orderly.x}
                    y={orderly.y}
                    scale={0.72}
                    stride={orderly.stride}
                    armL={70}
                    armR={t > 26.86 ? 150 + Math.sin(t * 18) * 20 : 70}
                    elbowR={t > 26.86 ? 20 : 30}
                    mouth={t > 26.34 && t < 26.86 ? "o" : "smile"}
                    look={{ x: -1, y: 0 }}
                  />
                ) : null}
                <Engineer
                  x={engineerX}
                  y={(during(t, 30.85, 34.16) ? footing.y : 898) - (juggling ? hop(t) * 6 : 0)}
                  scale={atDesk ? 0.8 : 0.82}
                  pose={pose}
                />
                {t >= 30.85 && t < 34.2 ? (
                  <Colonel
                    x={colonelIn.x}
                    y={colonelIn.y}
                    scale={0.8}
                    stride={colonelIn.stride}
                    armR={t >= 33.3 ? 120 : 20}
                    elbowR={t >= 33.3 ? 20 : 0}
                    mouth={during(s, 33.1, 34) ? "o" : "flat"}
                    look={{ x: -1, y: 0 }}
                  />
                ) : null}
                {t >= 34.2 && t < 36 ? (
                  <Colonel
                    x={colonelOff.x}
                    y={colonelOff.y}
                    scale={0.8}
                    stride={colonelOff.stride}
                    mouth="o"
                    look={{ x: -0.6, y: -1 }}
                  />
                ) : null}
              </Cut>
              {t < 27.8 || t >= 39.6 ? (
                <g>
                  <Desk x={desk.x} y={desk.y} />
                  <Cut>
                    <BankerLamp x={desk.x - 110} y={desk.y - 150} on={lampOn} />
                    <Laptop x={desk.x + 92} y={desk.y - 150} scale={0.8} glow={t < 39.45 ? 1 : ramp(t, 40.2, 40.6)} />
                  </Cut>
                  {beetles.map(({ x, show, walk }, i) =>
                    show ? <Beetle key={i} x={x} y={desk.y - 150 - (i % 2) * 4} scale={0.6} walk={walk + i} /> : null
                  )}
                </g>
              ) : null}
              {t >= 17.1 && t < 27.8 ? (
                <Cut>
                  <BuildTower x={desk.x + 250} y={898} bricks={(t - 17.1) * 9} scale={0.9} />
                </Cut>
              ) : null}
              {during(t, 19.3, 21.6) ? (
                <g
                  transform={`translate(${mix(1900, 0, ramp(s, 19.35, 19.8, Easing.out(Easing.cubic))) + ramp(s, 21, 21.5, Easing.in(Easing.cubic)) * 900} 0)`}
                >
                  <Coaster x={1170} y={650} u={ramp(t, 19.66, 21, Easing.inOut(Easing.sin))} />
                </g>
              ) : null}
              {during(t, 20.9, 25) ? (
                <g transform={`translate(0 ${fly(t, 20.9, 24.5)})`}>
                  <path d={`M${cuckoo.x},130 V${cuckoo.y - 110}`} stroke={ink} strokeWidth="2" />
                  <CuckooClock x={cuckoo.x} y={cuckoo.y} open={ramp(s, 22.6, 22.85)} scale={0.9} />
                  {t > 22.8 ? (
                    <g>
                      <path
                        d={`M${cuckoo.x},${cuckoo.y - 50} ${Array.from({ length: 6 }, (_, i) => `L${cuckoo.x + (i % 2 === 0 ? -14 : 14)},${cuckoo.y - 50 - (i + 1) * 9 * settle(t, 22.86, 7, 200)}`).join(" ")}`}
                        fill="none"
                        stroke="#9aa3ad"
                        strokeWidth="4"
                      />
                      <Cut>
                        <Octocat
                          x={cuckoo.x + sway(t, 22.9, 8, 9)}
                          y={cuckoo.y - 50 - 56 * settle(t, 22.86, 7, 200)}
                          scale={0.5}
                          hold={<PullRequest label="Review requested" />}
                          look={{ x: 0.3, y: 0.6 }}
                        />
                      </Cut>
                    </g>
                  ) : null}
                </g>
              ) : null}
              {during(t, 24.4, 28.2) ? (
                <g
                  transform={`translate(${t < 27 ? orderly.x - 1390 : ramp(s, 27.4, 28, Easing.in(Easing.cubic)) * 900} 0)`}
                >
                  <Cut>
                    <Monitor x={1180} y={898} t={t} flat={t > 26.34 && t < 26.86} />
                    <Bed x={1000} y={898} sit={ramp(s, 26.86, 27.1)} t={t} />
                  </Cut>
                </g>
              ) : null}
              {t >= 30.85 && t < 34.4 ? <Jenga x={1250} y={898} pull={hook} fall={collapse} /> : null}
            </g>
          }
          front={
            <g>
              {curtainUp < 1 ? (
                <g transform={`translate(0 ${-820 * curtainUp})`}>
                  <HouseCurtain />
                </g>
              ) : null}
              {during(t, 15.3, 16.95) ? (
                <MuteBanner x={desk.x} y={470} pop={settle(t, 15.3, 10, 220) * (1 - ramp(t, 16.8, 16.95))} />
              ) : null}
              <Puff x={centre} y={720} age={t - 27.62} />
              <Puff x={desk.x} y={760} age={t - 27.62} />
              <Puff x={desk.x + 250} y={800} age={t - 27.66} />
              <Puff x={centre} y={720} age={t - 30.78} />
              <Puff x={desk.x} y={760} age={t - 39.5} />
              {during(t, 33.1, 34.6) ? (
                <Say
                  x={1080}
                  y={330}
                  width={380}
                  lines={["Right! Stop that.", "It\u2019s far too silly."]}
                  tail={{ x: 1470, y: 560 }}
                />
              ) : null}
              {dialogIn > -700 ? (
                <g transform={`translate(0 ${dialogIn})`}>
                  <path d="M700,130 V380 M1080,130 V380" stroke={ink} strokeWidth="2" />
                  <Dialog
                    x={680}
                    y={380}
                    title="Log Off Windows"
                    text="Are you sure you want to log off?"
                    buttons={["Log off", "Cancel"]}
                    pressed={t > 39.32 && t < 39.5 ? 0 : undefined}
                  />
                </g>
              ) : null}
            </g>
          }
          light={
            <g>
              {during(t, 34.25, 35.6) ? (
                <path
                  d={`M${engineerX - 190},130 L${engineerX - 50},130 L${engineerX + 60},898 L${engineerX - 330},898 Z`}
                  fill="#fff6d0"
                  opacity={0.35 * ramp(t, 34.25, 34.5) * (1 - ramp(t, 35.3, 35.6))}
                  style={{ mixBlendMode: "screen" }}
                />
              ) : null}
              {t > 39.45 && t < 40.6 ? (
                <rect
                  x="150"
                  y="130"
                  width="1620"
                  height="780"
                  fill="#000"
                  opacity={0.25 * (1 - ramp(t, 40.2, 40.6))}
                />
              ) : null}
              {atDesk ? <Spot x={desk.x} y={850} rx={260} ry={70} /> : <Spot x={engineerX} y={870} rx={200} ry={56} />}
            </g>
          }
        />
        {t >= 34.36 && t < 35.55 ? (
          <Cut>
            <g transform={`translate(${engineerX - 83} ${mix(-260, 552, crystalFall) + shake(t, t < 34.9 ? 0 : 0.5)})`}>
              <Crystal x={0} y={0} scale={0.55} />
              {t > 34.9 && t < 35.4 ? (
                <Sparkle x={-14} y={-96} size={26 * Math.sin(((t - 34.9) / 0.5) * Math.PI)} fill="#fff" />
              ) : null}
            </g>
          </Cut>
        ) : null}
        <Cut>
          {patents.map((patent, k) => {
            const c = cube(k)
            return c.show && t < 39 ? (
              <PatentCube key={patent.date} {...patent} x={c.x} y={c.y} scale={0.64} rotate={c.spin} />
            ) : null
          })}
        </Cut>
        {t >= 38.1 && t < bonk ? (
          <g stroke={ink} strokeWidth="4" strokeLinecap="round" opacity="0.6">
            {[0, 1, 2].map((i) => {
              const c = cube(2)
              return <path key={i} d={`M${c.x + 40},${c.y - 16 + i * 16} l${70 + i * 10},${10 + i * 6}`} />
            })}
          </g>
        ) : null}
        {during(t, 38.15, 38.9) ? <Say x={20} y={250} width={150} lines={["Ow!"]} tail={{ x: -40, y: 410 }} /> : null}
      </Camera>
    </Canvas>
  )
}
