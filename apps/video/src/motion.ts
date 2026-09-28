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

// A click's dip: 0 to 1 over the fifth of a second after `at`.
export const pressed = (t: number, at: number) => ramp(t, at, at + 0.2, Easing.linear)

// Seconds since a moment, or null before it.
export const since = (t: number, at: number) => (t >= at ? t - at : null)

// Seconds since the latest of several clicks that has happened, or null before the first.
export const sinceLast = (t: number, clicks: readonly number[]) => {
  const last = clicks.findLast((at) => t >= at)
  return last === undefined ? null : t - last
}

// Glides a point, such as a cursor, through waypoints, each reached at its time. Between two it arcs a little to one
// side, the way a hand moves a mouse, easing out of one and into the next.
export const glide = (t: number, path: readonly { at: number; x: number; y: number }[]) => {
  const next = path.findIndex(({ at }) => at > t)
  const from = path[next - 1]
  const to = path[next]
  if (!from || !to) {
    const { x, y } = path[next === 0 ? 0 : path.length - 1] ?? { x: 0, y: 0 }
    return { x, y }
  }
  const bend = 0.18
  const control = {
    x: (from.x + to.x) / 2 - (to.y - from.y) * bend,
    y: (from.y + to.y) / 2 + (to.x - from.x) * bend
  }
  const along = ramp(t, from.at, to.at)
  const left = 1 - along
  return {
    x: left * left * from.x + 2 * left * along * control.x + along * along * to.x,
    y: left * left * from.y + 2 * left * along * control.y + along * along * to.y
  }
}
