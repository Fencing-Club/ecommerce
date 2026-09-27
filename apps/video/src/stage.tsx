import type { ReactNode } from "react"
import { AbsoluteFill } from "remotion"
import { font, stage } from "./theme"
import { cues } from "./timeline"
import { voiceover } from "./voiceover"
import takes from "./voiceover-takes.json"

type StageProps = { t: number; children: ReactNode; glow?: { x: number; y: number } }

// The dark stage every scene plays on: two slow orange glows, a faint grid that fades out toward the edges, and grain.
export const Stage = ({ t, children, glow = { x: 68, y: 58 } }: StageProps) => {
  const drift = Math.sin(t * 0.4) * 4
  return (
    <AbsoluteFill style={{ background: stage.background, fontFamily: font.sans, color: stage.text, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 760px at ${glow.x + drift}% ${glow.y}%, ${stage.glow}, transparent 62%), radial-gradient(900px 600px at ${22 - drift}% 18%, rgba(255, 138, 60, 0.1), transparent 60%)`
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
      <AbsoluteFill style={{ mixBlendMode: "overlay", opacity: 0.35 }}>
        <svg width="100%" height="100%">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={Math.floor(t * 24) % 97} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" opacity={0.5} />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// When each line is heard, from its cue to the end of its take.
export const heard = cues.map(({ id, at }) => ({ id, at, end: at + takes.lines[id].end }))

// The voiceover burned in for muted viewers, each word lighting up as it's spoken. The end card shows its own words.
export const Captions = ({ t }: { t: number }) => {
  const line = heard.find(({ id, at, end }) => id !== "end" && t >= at && t < end + 0.35)
  if (!line) {
    return null
  }
  const words = voiceover[line.id].caption.split(" ")
  const timings = takes.lines[line.id].words
  const spoken = t - line.at
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, display: "flex", justifyContent: "center" }}>
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
