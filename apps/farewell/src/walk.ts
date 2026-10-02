import { Easing } from "remotion"
import { mix } from "./motion"

type Side = -1 | 1
type Point = { x: number; y: number }

// A walker's legs, in its own units: the hips `hip` above where it stands and `spread` either side of the middle,
// thigh and shin each `bone` long, and the ankle `ankle` above the sole.
export type Build = { hip: number; spread: number; bone: number; ankle: number }

// Anyone on a pair of `Leg`s `length` long, pinned `hip` up and `spread` either side of the middle.
export const onLegs = (hip: number, spread: number, length: number): Build => ({
  hip,
  spread,
  bone: (length - 12) / 2,
  ankle: 20
})

export const engineerLegs = onLegs(168, 20, 160)

// From the hip down to the sole, the leg straight.
const reach = ({ bone, ankle }: Build) => 2 * bone + ankle

// One leg: its hip across from the middle, which way the toes point, the kick at the hip toward them, the bend at the
// knee and the toe tipped up at the ankle, in degrees.
export type Bend = { hip: number; facing: Side; swing: number; knee: number; ankle: number }

// Mid-stride: each leg, how far both arms swing out, the lean above the hips, and the leg nearer the audience, drawn
// over the other.
export type Stride = { left: Bend; right: Bend; arms: number; lean: number; near: Side }

// Where a foot comes down, the middle of its sole in the world, and which way its toes point once it's down.
type Footfall = { x: number; y: number; toes: Side }

// In the Engineer's units, scaled to anyone else's legs.
type Gait = {
  // Half the hip spacing mid-walk, with the hips turned the way the walker's going.
  hips: number
  // How high a stepping foot lifts, and how far the body rises mid-step, for running.
  lift: number
  bounce: number
  // The lean and the arm swing at full stride, in degrees.
  lean: number
  arms: number
}

type Steps = Gait & {
  build: Build
  from: number
  to: number
  scale: number
  // Where both feet start, then each step in turn: the foot that moves and where it lands.
  start: { left: Footfall; right: Footfall }
  steps: readonly (Footfall & { foot: Side })[]
  // Which way the toes point mid-walk, if he turns to walk at all.
  facing?: Side
  near: Side
  // The floor's height under a foot.
  ground: (x: number) => number
  // Still going at full speed at the end, into whatever stops him.
  rush: boolean
}

const opposite = (side: Side): Side => (side < 0 ? 1 : -1)

const times = (a: Side, b: Side): Side => (a === b ? 1 : -1)

const smooth = (x: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) / 2

// Bend a leg from its hip to set its ankle on `ankle`, the knee forward over the toes and the shoe tipped `tip`.
const bend = (bone: number, hip: Point, ankle: Point, facing: Side, tip: number): Bend => {
  const along = (ankle.x - hip.x) * facing
  const open = Math.acos(Math.min(1, Math.hypot(along, ankle.y - hip.y) / (2 * bone)))
  const swing = ((Math.atan2(along, ankle.y - hip.y) + open) * 180) / Math.PI
  const knee = (open * 360) / Math.PI
  return { hip: hip.x, facing, swing, knee, ankle: tip - swing + knee }
}

// A smooth path through evenly spaced values that never overshoots them, setting off from rest and, unless rushing,
// coming to rest.
const glide = (values: readonly number[], at: number, rush: boolean) => {
  const last = values.length - 1
  const i = Math.min(last - 1, Math.max(0, Math.floor(at)))
  const u = Math.min(1, Math.max(0, at - i))
  const value = (k: number) => values[k] ?? 0
  const slope = (k: number) => {
    if (k === last && rush) {
      return value(k) - value(k - 1)
    }
    if (k <= 0 || k >= last) {
      return 0
    }
    const before = value(k) - value(k - 1)
    const after = value(k + 1) - value(k)
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after)
  }
  const [a, b] = [value(i), value(i + 1)]
  return (
    (2 * u ** 3 - 3 * u ** 2 + 1) * a +
    (u ** 3 - 2 * u ** 2 + u) * slope(i) +
    (3 * u ** 2 - 2 * u ** 3) * b +
    (u ** 3 - u ** 2) * slope(i + 1)
  )
}

// A walker at `t` on a walk of footfalls, an even beat apart: where to put it (`hip` under its hips) and how it's
// striding. It stands still on the first footing before `from` and the last after `to`.
const pace = (t: number, plan: Steps) => {
  const { build, from, to, scale, start, steps, facing, hips, lift, bounce, lean, arms, near, ground, rush } = plan
  const count = steps.length
  const feet = steps.reduce<{ left: Footfall; right: Footfall }[]>(
    (all, { foot, ...fall }) => {
      const last = all.at(-1) ?? start
      return [...all, foot < 0 ? { ...last, left: fall } : { ...last, right: fall }]
    },
    [start]
  )
  const middle = feet.map(({ left, right }) => (left.x + right.x) / 2)
  // The highest the hips can be with both feet down, the legs at full stretch.
  const stretch = 2 * build.bone * scale
  const hang = (foot: Footfall, hip: number) =>
    foot.y - build.ankle * scale - Math.sqrt(Math.max(0, stretch ** 2 - (hip - foot.x) ** 2))
  const level = feet.map(({ left, right }, k) => {
    const spread = (k === 0 || k === count ? build.spread : hips) * scale
    const x = middle[k] ?? 0
    return Math.max(hang(left, x - spread), hang(right, x + spread))
  })
  const beat = ((Math.min(to, Math.max(from, t)) - from) / (to - from)) * count
  const j = Math.min(count - 1, Math.floor(beat))
  const u = beat - j
  const step = steps[j] ?? { ...start.right, foot: 1 }
  const before = feet[j] ?? start
  const was = step.foot < 0 ? before.left : before.right
  const stance = step.foot < 0 ? before.right : before.left
  const ends = j === 0 || j === count - 1
  const x = glide(middle, beat, rush)
  const hipY = (() => {
    const [a = 0, b = 0] = [level[j], level[j + 1]]
    if (ends) {
      return mix(a, b, smooth(u))
    }
    const top = stance.y - (reach(build) + bounce) * scale
    return u < 0.5 ? mix(a, top, smooth(u * 2)) : mix(top, b, smooth(u * 2 - 1))
  })()
  const y = hipY + build.hip * scale
  // Everything a stride adds, swelling over the first step and dying away over the last.
  const swell = (() => {
    if (count === 1) {
      return Math.sin(Math.PI * u)
    }
    if (j === 0) {
      return smooth(u)
    }
    return j === count - 1 ? 1 - smooth(u) : 1
  })()
  const spread = mix(build.spread, hips, count === 1 ? 0 : swell)
  const down = step.y > was.y + 1
  // Down a stair the foot keeps to the tread it passes over until it's past the edge, then drops to the next.
  const crest = ground((was.x + step.x) / 2)
  const drop = Easing.in(Easing.quad)(u < 0.5 ? u * 2 : u * 2 - 1)
  const floor = u < 0.5 ? mix(was.y, crest, drop) : mix(crest, step.y, drop)
  // A foot turning to walk, or back again to stand, pivots as it lifts or as it lands, never with the knee bent.
  const toes = (() => {
    if (u <= 0) {
      return was.toes
    }
    if (u >= 1 || was.toes === step.toes) {
      return step.toes
    }
    if (facing) {
      return facing
    }
    return u < 0.5 ? was.toes : step.toes
  })()
  const lifted = {
    x: mix(was.x, step.x, Easing.inOut(Easing.sin)(u)),
    y: floor - lift * scale * Math.sin(Math.PI * u),
    toes
  }
  const tip = down ? -16 * Math.sin(Math.PI * u) : -14 * Math.sin(2 * Math.PI * u)
  const local = (foot: Point) => ({ x: (foot.x - x) / scale, y: (foot.y - y) / scale - build.ankle })
  const leg = (side: Side) => {
    const hip = { x: side * spread, y: -build.hip }
    if (side === step.foot) {
      return bend(build.bone, hip, local(lifted), lifted.toes, tip)
    }
    return bend(build.bone, hip, local(stance), stance.toes, 0)
  }
  const stride: Stride = {
    left: leg(-1),
    right: leg(1),
    arms: arms * swell * (step.foot < 0 ? 1 : -1) * Math.cos(Math.PI * u),
    lean: lean * swell,
    near: beat > 0 && beat < count ? near : 1
  }
  return { x, y, stride }
}

const gaits = {
  walk: { hips: 9, lift: 30, bounce: 0, lean: 3, arms: 14 },
  back: { hips: 9, lift: 22, bounce: 0, lean: 2, arms: 8 },
  side: { hips: engineerLegs.spread, lift: 18, bounce: 0, lean: 0, arms: 0 },
  march: { hips: 9, lift: 50, bounce: 3, lean: 0, arms: 26 },
  run: { hips: 8, lift: 64, bounce: 10, lean: 10, arms: 30 }
} satisfies Record<string, Gait>

type Walk = Partial<Gait> & {
  from: number
  to: number
  x0: number
  x1: number
  // Footfalls on the way across, the last bringing the feet together, and any on the spot before and after.
  steps: number
  before?: number
  after?: number
  // Walking forward, backing away with the toes still pointing back, or stepping sideways facing the audience.
  gait?: keyof typeof gaits
  scale?: number
  // The floor's height under a foot, for anything but a level stage.
  ground?: (x: number) => number
  rush?: boolean
  // How far past its hip the leading foot finishes, in his units, to end in a fencer's stance.
  lunge?: number
  // Whose legs: the Engineer's unless given.
  build?: Build
  // Drawn side on, the toes always pointing this way in its own frame, like each half of the Unicorn.
  profile?: Side
  // Drawn mirrored, as `flip` places it.
  flip?: boolean
  // The foot that steps first, rather than whichever saves turning.
  lead?: Side
  // Which way the right foot points standing: out to the side, or in, pigeon-toed.
  stance?: Side
}

// Anyone walking from x0 to x1 between `from` and `to`, feet planted where they land, knees bending to lift them, hips
// rising over each step, arms swinging against the legs and the body turned the way it's going.
export const walk = (
  t: number,
  {
    from,
    to,
    x0,
    x1,
    steps,
    before = 0,
    after = 0,
    gait = "walk",
    scale = 0.8,
    ground = () => 898,
    rush = false,
    lunge = 0,
    build = engineerLegs,
    profile,
    flip = false,
    lead: first,
    stance = 1,
    ...look
  }: Walk
) => {
  const { hips, lift, bounce, lean, arms } = { ...gaits[gait], ...look }
  const size = reach(build) / reach(engineerLegs)
  const narrow = (hips * build.spread) / engineerLegs.spread
  // Worked out in the walker's own frame, mirrored back if it's drawn flipped.
  const mirror = flip ? -1 : 1
  const [startX, endX] = [x0 * mirror, x1 * mirror]
  const floor = (x: number) => ground(x * mirror)
  const way: Side = endX < startX ? -1 : 1
  const sideways = gait === "side"
  const toes = profile ?? (gait === "back" ? opposite(way) : way)
  const standing = (foot: Side) => profile ?? times(foot, stance)
  const total = before + steps + after
  const length = (endX - startX) / Math.max(1, steps - 1)
  // The foot already pointing its way leads on an even count, so the other turns in the air and closes.
  const lead = (() => {
    if (first) {
      return first
    }
    if (sideways) {
      return way
    }
    return times(total % 2 === 0 ? toes : opposite(toes), stance)
  })()
  const falls = Array.from({ length: total }, (_, k) => {
    const foot = k % 2 === 0 ? lead : opposite(lead)
    const closing = k === total - 1
    const across = Math.min(steps - 1, Math.max(0, k - before + 1))
    const reached = k - before >= steps - 1 ? endX : startX + across * length
    const reaching = foot === lead && k >= total - 2 ? lead * lunge * scale : 0
    const x = reached + foot * (closing ? build.spread : narrow) * scale + reaching
    return { foot, x, y: floor(x), toes: sideways || closing ? standing(foot) : toes }
  })
  const left = startX - build.spread * scale
  const right = startX + build.spread * scale
  const paced = pace(t, {
    build,
    from,
    to,
    scale,
    start: {
      left: { x: left, y: floor(left), toes: standing(-1) },
      right: { x: right, y: floor(right), toes: standing(1) }
    },
    steps: falls,
    facing: sideways ? undefined : toes,
    hips: narrow,
    lift: lift * size,
    bounce: bounce * size,
    lean: toes * lean,
    arms: (gait === "back" ? toes : -toes) * arms,
    near: profile || sideways ? 1 : opposite(toes),
    ground: floor,
    rush
  })
  return { ...paced, x: paced.x * mirror }
}

// A hanging arm swung by the stride; an arm raised to do something else keeps at it.
export const armSwing = (arm: number, stride?: Stride) =>
  arm + (stride?.arms ?? 0) * Math.min(1, Math.max(0, (60 - arm) / 40))

// The body above the hips leaning into the stride.
export const bodyLean = (build: Build, stride?: Stride) =>
  stride ? `rotate(${stride.lean} 0 ${-build.hip})` : undefined
