import type { ReactNode } from "react"
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame } from "remotion"
import { ramp } from "./motion"
import { Agents } from "./scenes/agents"
import { Amazon } from "./scenes/amazon"
import { End } from "./scenes/end"
import { Forecast } from "./scenes/forecast"
import { Handoffs } from "./scenes/handoffs"
import { Hook } from "./scenes/hook"
import { Outcome } from "./scenes/outcome"
import { Recap } from "./scenes/recap"
import { Reorder } from "./scenes/reorder"
import { Reveal } from "./scenes/reveal"
import { Captions, Clock, heard } from "./stage"
import { cues, fps, type Section, sectionAt, sections } from "./timeline"

// Each section's scene, given the seconds since the section started.
const scenes: Record<Section, (props: { t: number }) => ReactNode> = {
  hook: Hook,
  reveal: Reveal,
  forecast: Forecast,
  reorder: Reorder,
  amazon: Amazon,
  handoffs: Handoffs,
  agents: Agents,
  recap: Recap,
  outcome: Outcome,
  end: End
}

// The score dips under the voice, and only a little under the last line, so the ending stays full.
const musicVolume = (t: number) => {
  const under = Math.max(
    0,
    ...heard.map(
      ({ id, at, end }) => (id === "end" ? 0.4 : 1) * Math.min(ramp(t, at - 0.2, at), 1 - ramp(t, end, end + 0.3))
    )
  )
  return 0.85 - 0.55 * under
}

// The picture at a moment of the ad, in seconds: that section's scene, and the captions.
const Frame = ({ time }: { time: number }) => {
  const section = sectionAt(time)
  const Scene = scenes[section]
  return (
    <Clock value={time}>
      <AbsoluteFill>
        <Scene t={time - sections[section].from} />
        <Captions t={time} />
      </AbsoluteFill>
    </Clock>
  )
}

// The voiceover alone, each take on its cue. `pnpm --filter video audio` renders it into one track,
// public/audio/voiceover.wav, for the ad to play. A take started partway through playback gets skipped ahead whenever
// the preview falls behind, cutting off its first words; one track playing from the start never does.
export const Voiceover = () => (
  <AbsoluteFill>
    {cues.map(({ id, at }) => (
      <Sequence key={id} from={Math.round(at * fps)} layout="none">
        <Html5Audio src={staticFile(`voiceover/${id}.mp3`)} />
      </Sequence>
    ))}
  </AbsoluteFill>
)

// The ad: the picture, the voiceover, the score and the sound effects, each one track from start to end. Playback waits
// for any of them that's still loading.
export const Ad = () => {
  const t = useCurrentFrame() / fps
  return (
    <AbsoluteFill>
      <Frame time={t} />
      <Html5Audio src={staticFile("audio/voiceover.wav")} pauseWhenBuffering />
      <Html5Audio src={staticFile("audio/score.wav")} volume={(frame) => musicVolume(frame / fps)} pauseWhenBuffering />
      <Html5Audio src={staticFile("audio/sfx.wav")} volume={0.7} pauseWhenBuffering />
    </AbsoluteFill>
  )
}
