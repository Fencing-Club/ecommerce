import { Box } from "lucide-react"
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame } from "remotion"
import { ramp } from "./motion"
import { Captions, heard, Stage } from "./stage"
import { accent, app, font } from "./theme"
import { cues, fps, type Section, sections } from "./timeline"

// Each section's headline.
const headlines: Record<Section, string> = {
  hook: "Restocking a best-seller shouldn’t take 43 emails, 12 spreadsheets, and a stockout.",
  reveal: "Copacker",
  forecast: "Know exactly when to restock.",
  reorder: "Reorder in one click.",
  amazon: "Amazon shipments, automated.",
  handoffs: "Every handoff, in one place.",
  agents: "Built for AI agents.",
  recap: "Forecast. Reorder. Ship. Automate.",
  end: "Restocking, handled."
}

const sectionAt = (t: number) =>
  (Object.keys(sections) as Section[]).find((name) => t >= sections[name].from && t < sections[name].to) ?? "end"

// A section's slate until its scene is built: the headline, set on the stage.
const Slate = ({ t, section }: { t: number; section: Section }) => {
  const local = t - sections[section].from
  const shown = ramp(local, 0, 0.5)
  return (
    <Stage t={t}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 160 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: shown }}>
          {section === "reveal" || section === "end" ? (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                width: 120,
                height: 120,
                borderRadius: 38,
                background: app.primary
              }}
            >
              <Box size={60} color={app.primaryForeground} strokeWidth={2} />
            </div>
          ) : null}
          <div
            style={{
              fontFamily: font.sans,
              fontSize: 96,
              fontWeight: 600,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              textAlign: "center",
              backgroundImage: section === "end" ? accent : undefined,
              backgroundClip: section === "end" ? "text" : undefined,
              color: section === "end" ? "transparent" : undefined,
              transform: `translateY(${24 * (1 - shown)}px)`
            }}
          >
            {headlines[section]}
          </div>
        </div>
      </AbsoluteFill>
    </Stage>
  )
}

// The score dips under the voice.
const musicVolume = (t: number) => {
  const under = Math.max(...heard.map(({ at, end }) => Math.min(ramp(t, at - 0.2, at), 1 - ramp(t, end, end + 0.3))))
  return 0.85 - 0.55 * under
}

// The ad: each section's scene, the voiceover on its cues with captions, the score and the sound effects.
export const Ad = () => {
  const t = useCurrentFrame() / fps
  return (
    <AbsoluteFill>
      <Slate t={t} section={sectionAt(t)} />
      <Captions t={t} />
      <Html5Audio src={staticFile("audio/score.wav")} volume={(frame) => musicVolume(frame / fps)} />
      <Html5Audio src={staticFile("audio/sfx.wav")} volume={0.7} />
      {cues.map(({ id, at }) => (
        <Sequence key={id} from={Math.round(at * fps)} layout="none">
          <Html5Audio src={staticFile(`voiceover/${id}.mp3`)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
