import { Easing, interpolate, spring } from "remotion"
import { beats, fps } from "./timeline"

// 0 before `from`, 1 after `to`, eased in between.
export const ramp = (t: number, from: number, to: number, easing = Easing.inOut(Easing.cubic)) =>
  interpolate(t, [from, to], [0, 1], { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" })

// A spring that starts at `at` seconds: 0 before, settling on 1. Lower damping overshoots more.
export const settle = (t: number, at: number, damping = 12, stiffness = 140) =>
  t < at ? 0 : spring({ frame: (t - at) * fps, fps, config: { damping, stiffness, mass: 0.8 } })

export const mix = (from: number, to: number, amount: number) => from + (to - from) * amount

// Cut-outs move on twos, twelve drawings a second, the way paper animation was shot.
export const onTwos = (t: number) => Math.floor(t * 12) / 12

// A hop on every beat: 1 at the top of the bounce, 0 on the beat.
export const hop = (t: number) => Math.abs(Math.sin(Math.PI * beats(t)))

// A swing that dies away after `at`, for things that land on a rope.
export const sway = (t: number, at: number, size: number, speed = 7) =>
  t < at ? 0 : size * Math.sin((t - at) * speed) * Math.exp(-(t - at) * 1.6)

// A number through keyframes [time, value], easing from each to the next and holding before the first and after the
// last.
export const keys = (
  t: number,
  frames: readonly (readonly [number, number])[],
  easing = Easing.inOut(Easing.cubic)
) => {
  const next = frames.findIndex(([time]) => time > t)
  const from = frames[next - 1]
  const to = frames[next]
  if (!from || !to) {
    return (next === 0 ? frames[0] : frames[frames.length - 1])?.[1] ?? 0
  }
  return mix(from[1], to[1], ramp(t, from[0], to[0], easing))
}

// Scenery on a fly line: out of sight above until `from`, dropped in to land with a bounce, and flown out again at
// `to`. 0 is in place; negative is up in the flies.
export const fly = (t: number, from: number, to = Number.POSITIVE_INFINITY, height = 900) =>
  -height * (1 - ramp(t, from, from + 0.55, Easing.out(Easing.back(1.6)))) -
  (Number.isFinite(to) ? height * ramp(t, to, to + 0.5, Easing.in(Easing.cubic)) : 0)

export const during = (t: number, from: number, to: number) => t >= from && t < to

// A shiver for things that buzz, rattle or quake, up to `size` either way.
export const shake = (t: number, size: number) => size * Math.sin(t * 97) * Math.cos(t * 61)
