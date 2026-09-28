import { type CSSProperties, type ReactNode, useContext } from "react"
import { AbsoluteFill, Easing } from "remotion"
import { mixed, ramp, settle } from "../motion"
import { Clock, Stage } from "../stage"
import { fps } from "../timeline"
import { Headline, Label } from "../type"

type Glow = { x: number; y: number }

type FeatureProps = {
  t: number
  // The chapter's number and name, and its headline, line by line.
  number: string
  name: string
  lines: readonly string[]
  accented?: readonly string[]
  // When the headline arrives, when the whole chapter leaves, and when the headline leaves if it should go sooner.
  headlineAt?: number
  out: number
  headlineOut?: number
  // How the chapter leaves: blurring forward into the next, whipped off to the left, rushing past the camera, or not at
  // all, when its window carries over into the next chapter.
  exit?: "blur" | "whip" | "zoom" | "none"
  // Where the stage's glow sits, and where it starts from, to follow the last chapter's.
  glow?: Glow
  glowFrom?: Glow
  children: ReactNode
}

// A feature chapter: its label and headline top left, its product shot filling the stage, and its exit.
export const Feature = ({
  t,
  number,
  name,
  lines,
  accented,
  headlineAt = 0.15,
  out,
  headlineOut = out,
  exit = "blur",
  glow = { x: 64, y: 60 },
  glowFrom = glow,
  children
}: FeatureProps) => {
  const leaving = ramp(t, out, out + 0.4, Easing.in(Easing.cubic))
  const settled = ramp(t, 0, 0.9)
  const exits: Record<NonNullable<FeatureProps["exit"]>, CSSProperties> = {
    blur: {
      opacity: 1 - leaving,
      filter: leaving > 0 ? `blur(${leaving * 14}px)` : undefined,
      transform: `scale(${1 + 0.07 * leaving})`
    },
    whip: {
      filter: leaving > 0 ? `blur(${Math.sin(Math.PI * Math.min(leaving, 1)) * 18}px)` : undefined,
      transform: `translateX(${-2300 * leaving}px)`
    },
    zoom: {
      opacity: 1 - leaving,
      filter: leaving > 0 ? `blur(${leaving * 22}px)` : undefined,
      transform: `scale(${1 + 0.55 * leaving})`
    },
    none: {}
  }
  return (
    <Stage glow={{ x: mixed(glowFrom.x, glow.x, settled), y: mixed(glowFrom.y, glow.y, settled) }}>
      <AbsoluteFill style={exits[exit]}>{children}</AbsoluteFill>
      <div style={{ position: "absolute", left: 110, top: 112, zIndex: 3, display: "grid", gap: 28 }}>
        <Label t={t} at={headlineAt - 0.1} out={headlineOut} number={number} name={name} />
        <Headline t={t} at={headlineAt} out={headlineOut} lines={lines} accented={accented} size={78} />
      </div>
    </Stage>
  )
}

export type Pose = { x: number; y: number; turn: number; scale: number; tilt?: number; dim?: number }

type WindowPose = {
  t: number
  // When the window arrives.
  at: number
  x: number
  y: number
  // Its resting turn toward the headline, in degrees.
  turn?: number
  // Where it arrives from: the last chapter's pose, carried across the cut, or off to the right for a whip. Without
  // one, it swings in from the right.
  from?: Pose
  whipIn?: boolean
  // When it's whipped off, and to which side.
  whipOut?: { at: number; to: "left" | "right" }
  // Camera moves on top of the resting pose: a push in toward `focus` (percent of the window), or a pull back when
  // negative, and a shift.
  zoom?: number
  focus?: { x: number; y: number }
  shift?: { x: number; y: number }
  // How far it's pushed back behind another window: dimmer and softer.
  dim?: number
  children: ReactNode
  style?: CSSProperties
}

// A product shot: the window arrives (swinging in, whipping in, or carried over from the last chapter), floats while
// it rests, and blurs with its own speed whenever it moves fast.
export const Shot = ({
  t,
  at,
  x,
  y,
  turn = -9,
  from,
  whipIn = false,
  whipOut,
  zoom = 0,
  focus = { x: 50, y: 50 },
  shift,
  dim = 0,
  children,
  style
}: WindowPose) => {
  const poseAt = (time: number) => {
    const arrived = whipIn ? settle(time, at, 24, 300) : settle(time, at, 17, 105)
    const leaving = whipOut ? ramp(time, whipOut.at, whipOut.at + 0.4, Easing.in(Easing.cubic)) : 0
    const away = (whipOut?.to === "left" ? -2300 : 2300) * leaving
    const start: Pose = from ?? {
      x: x + (whipIn ? 2300 : 260),
      y,
      turn: whipIn ? turn : turn - 24,
      scale: whipIn ? 1 : 0.9,
      tilt: 3
    }
    return {
      x: mixed(start.x, x, arrived) + away,
      y: mixed(start.y, y, arrived),
      turn: mixed(start.turn, turn, arrived),
      scale: mixed(start.scale, 1, arrived),
      tilt: mixed(start.tilt ?? 3, 3, arrived),
      dim: mixed(start.dim ?? 0, 0, arrived),
      shown: from || whipIn ? 1 : Math.min(1, arrived * 1.8)
    }
  }
  const pose = poseAt(t)
  const last = poseAt(t - 1 / fps)
  const speed = Math.hypot(pose.x - last.x, pose.y - last.y)
  const dimmed = Math.min(1, pose.dim + dim)
  const blur = Math.min(16, speed * 0.3) + dimmed * 3
  // The float runs on the ad's clock, so a window carried across a cut doesn't jump.
  const sway = Math.sin(useContext(Clock) * 0.55) * 1.2
  const flat = 1 - Math.min(1, Math.abs(zoom))
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 2600, perspectiveOrigin: "60% 45%" }}>
      <div
        style={{
          position: "absolute",
          left: pose.x + (shift?.x ?? 0),
          top: pose.y + (shift?.y ?? 0),
          opacity: pose.shown * (1 - 0.45 * dimmed),
          filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
          transformOrigin: `${focus.x}% ${focus.y}%`,
          transform: `translate(-50%, -50%) rotateY(${pose.turn * (0.2 + 0.8 * flat) + sway}deg) rotateX(${pose.tilt * flat}deg) scale(${pose.scale * (1 + zoom)})`,
          ...style
        }}
      >
        {children}
      </div>
    </div>
  )
}
