import { Easing, interpolate, spring } from "remotion"
import { fps } from "./timeline"

// 0 before `from`, 1 after `to`, eased in between.
export const ramp = (t: number, from: number, to: number, easing = Easing.inOut(Easing.cubic)) =>
  interpolate(t, [from, to], [0, 1], { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" })

// A spring that starts at `at` seconds: 0 before, settling on 1. Lower damping overshoots more.
export const settle = (t: number, at: number, damping = 18, stiffness = 140) =>
  t < at ? 0 : spring({ frame: (t - at) * fps, fps, config: { damping, stiffness, mass: 0.9 } })

// Blends between two numbers.
export const mixed = (from: number, to: number, amount: number) => from + (to - from) * amount
