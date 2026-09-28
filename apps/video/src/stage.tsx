import { createContext, type ReactNode, useContext } from "react"
import { AbsoluteFill } from "remotion"
import { font, stage } from "./theme"
import { cues } from "./timeline"
import { voiceover } from "./voiceover"
import takes from "./voiceover-takes.json"

// The ad's own time, in seconds, for the motion that carries on across cuts: the stage's drift and grain, and the
// windows' float.
export const Clock = createContext(0)

// Film grain: one tile of noise, drawn once, tiled over the frame and jumped to a new spot 24 times a second. Noise
// drawn fresh over the whole frame every time was too slow for the preview to keep up.
const grain = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="256" height="256" filter="url(#n)" opacity="0.5"/></svg>'
)}")`

type StageProps = { children: ReactNode; glow?: { x: number; y: number; strength?: number } }

// The dark stage every scene plays on: two slow orange glows, a faint grid that fades out toward the edges, and grain.
export const Stage = ({ children, glow = { x: 68, y: 58 } }: StageProps) => {
  const clock = useContext(Clock)
  const drift = Math.sin(clock * 0.4) * 4
  const strength = glow.strength ?? 1
  const step = Math.floor(clock * 24)
  return (
    <AbsoluteFill
      style={{ background: stage.background, fontFamily: font.sans, color: stage.text, overflow: "hidden" }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 760px at ${glow.x + drift}% ${glow.y}%, rgba(245, 74, 0, ${0.32 * strength}), transparent 62%), radial-gradient(900px 600px at ${22 - drift}% 18%, rgba(255, 138, 60, ${0.1 * strength}), transparent 60%)`
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${stage.line} 1px, transparent 1px), linear-gradient(90deg, ${stage.line} 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)"
        }}
      />
      {children}
      <AbsoluteFill
        style={{
          mixBlendMode: "overlay",
          opacity: 0.35,
          backgroundImage: grain,
          backgroundPosition: `${(step * 73) % 256}px ${(step * 151) % 256}px`
        }}
      />
    </AbsoluteFill>
  )
}

// When each line is heard, from its cue to the end of its take.
export const heard = cues.map(({ id, at }) => ({ id, at, end: at + takes.lines[id].end }))

// The voiceover burned in for muted viewers, each word lighting up as it's spoken. The end card shows its own words,
// and a cutdown captions only the lines it keeps.
export const Captions = ({ t, lines }: { t: number; lines?: readonly string[] }) => {
  const line = heard.find(
    ({ id, at, end }) => id !== "end" && (!lines || lines.includes(id)) && t >= at && t < end + 0.25
  )
  if (!line) {
    return null
  }
  const words = voiceover[line.id].caption.split(" ")
  const timings = takes.lines[line.id].words
  const spoken = t - line.at
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 34,
        display: "flex",
        justifyContent: "center",
        zIndex: 5
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          padding: "12px 24px",
          borderRadius: 16,
          background: "rgba(9, 9, 11, 0.74)",
          fontFamily: font.sans,
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1.35,
          letterSpacing: "-0.01em",
          textAlign: "center"
        }}
      >
        {words.map((word, i) => (
          <span
            key={`${i}-${word}`}
            style={{ color: spoken >= (timings[i]?.start ?? 0) ? stage.text : "rgba(250, 250, 250, 0.36)" }}
          >
            {i > 0 ? " " : ""}
            {word}
          </span>
        ))}
      </div>
    </div>
  )
}
