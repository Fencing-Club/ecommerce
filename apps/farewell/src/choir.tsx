import { PatentCube, patents } from "./awards"
import { Clippy } from "./cast/clippy"
import { hop, onTwos, ramp, settle } from "./motion"
import { placed } from "./paper"
import { Notes } from "./props"
import { gold, ink } from "./theme"
import { at, beats } from "./timeline"

export type Mood = "sing" | "watch" | "sob" | "bow"

// When the last patent cube lands, on "off" in "logging off".
export const bonk = at("loggingOff") + 1.36

const star = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 === 0 ? 46 : 20
  const a = (i / 24) * Math.PI * 2
  return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`
}).join(" L")

// Two cherubs in a theatre box, risen into it at `rise`. The nearer one in the left box takes the last patent cube at
// `bonk` and is never quite the same: seeing cubes for the rest of Act I, and slightly bent ever after.
export const Choir = ({
  t,
  mood,
  side,
  rise = -10
}: {
  t: number
  mood: Mood
  side: "left" | "right"
  rise?: number
}) => {
  const s = onTwos(t)
  const singing = mood === "sing"
  const drift = (t * 46) % 90
  return (
    <g>
      {[-58, 62].map((x, i) => {
        const hurt = side === "left" && i === 1 && t >= bonk
        const reel = hurt ? settle(t, bonk, 7, 320) : 0
        const dazed = hurt && t < at("interval")
        const bent = hurt && !dazed
        const up = (1 - settle(s, rise + i * 0.2, 11, 120)) * 180
        const bob = singing ? hop(t) * 7 : 0
        const swing = singing ? Math.sin(Math.PI * beats(s) + i) * 5 : 0
        const bowing = mood === "bow" ? Math.max(0, Math.sin((Math.PI * beats(s)) / 4)) * 22 : 0
        const lean = (side === "left" ? 1 : -1) * bowing
        const place = {
          x: x - reel * 14,
          y: 606 + up - bob + reel * 34 - (bent ? 6 : 0),
          scale: 0.52,
          rotate: (i === 0 ? swing : -swing) + lean - (dazed ? 38 * reel : 0) - (bent ? 14 : 0)
        }
        let mouth: "sing" | "sad" | "o" | undefined
        if (singing || mood === "bow") {
          mouth = "sing"
        } else if (mood === "sob") {
          mouth = "sad"
        } else if (dazed) {
          mouth = "o"
        }
        return (
          <g key={x}>
            <Clippy
              {...place}
              cherub
              mouth={mouth}
              brows={mood === "sob" ? -0.5 : 0.9}
              look={{ x: side === "left" ? 0.5 : -0.5, y: -0.2 }}
              dazed={dazed}
            />
            {bent ? (
              <g transform={placed(place)}>
                <g transform="translate(14 -322) rotate(30)" stroke={ink} strokeWidth="2">
                  <rect x="-22" y="-7" width="44" height="14" rx="5" fill="#f3d6b8" />
                  <rect x="-7" y="-22" width="14" height="44" rx="5" fill="#f3d6b8" />
                </g>
              </g>
            ) : null}
            {dazed ? (
              <g>
                {patents.map((patent, k) => {
                  const a = t * 5 + (k * Math.PI * 2) / 3
                  return (
                    <PatentCube
                      key={patent.date}
                      {...patent}
                      x={x - 30 + Math.cos(a) * 46}
                      y={410 + Math.sin(a) * 12}
                      scale={0.22}
                      rotate={a * 40}
                    />
                  )
                })}
              </g>
            ) : null}
            {mood === "sob" ? (
              <g>
                {[0, 1].map((k) => {
                  const fall = (t * 1.6 + k * 0.5 + i * 0.25) % 1
                  return (
                    <path
                      key={k}
                      d={`M${x - 26 + k * 26},${492 + fall * 70} q-5,9 0,13 q5,-4 0,-13 Z`}
                      fill="#8fd0ff"
                      stroke={ink}
                      strokeWidth="1.2"
                      opacity={1 - fall}
                    />
                  )
                })}
                <path
                  d={`M${x + 22},${470 + Math.sin(t * 9 + i) * 6} q14,-10 26,0 q-4,14 6,22 q-16,6 -28,-2 q4,-10 -4,-20 Z`}
                  fill="#fff"
                  stroke={ink}
                  strokeWidth="2"
                />
              </g>
            ) : null}
          </g>
        )
      })}
      {side === "left" && t >= bonk && t < bonk + 0.5 ? (
        <path
          d={`M${star} Z`}
          transform={`translate(40 466) scale(${1.2 + ramp(t, bonk, bonk + 0.1) * 0.8})`}
          fill="#fff3a6"
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
          opacity={1 - ramp(t, bonk + 0.35, bonk + 0.5)}
        />
      ) : null}
      {singing ? (
        <g opacity={1 - drift / 90}>
          <Notes x={-30} y={390 - drift} scale={0.7} color={gold.light} />
        </g>
      ) : null}
    </g>
  )
}
