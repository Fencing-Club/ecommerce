import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame } from "remotion"
import { Frame, musicVolume } from "./ad"
import { ramp } from "./motion"
import { heard } from "./stage"
import { fits, fps, lengthOf, placed } from "./timeline"

type Stretch = readonly [number, number]

// The lines a cutdown keeps: the ones that fit whole inside one of its stretches.
const kept = (stretches: readonly Stretch[]) => heard.filter(({ at, end }) => fits(stretches, at, end))

// A cutdown of the ad, stitched from stretches of it. Each stretch plays its part of the voiceover, score and effects
// tracks, with the voiceover silent outside the lines the cut keeps. The score and effects duck in and out at each join
// so the cut doesn't click, and the end fades to black.
export const Cut = ({ stretches }: { stretches: readonly Stretch[] }) => {
  const t = useCurrentFrame() / fps
  const parts = placed(stretches)
  const length = lengthOf(stretches)
  const part = parts.findLast(({ start }) => t >= start) ?? parts[0]
  const lines = kept(stretches)
  const ids = lines.map(({ id }) => id)
  const speaking = (time: number) => lines.some(({ at, end }) => time >= at - 0.05 && time < end + 0.1)
  const edges = (local: number, span: number, last: boolean) =>
    Math.min(ramp(local, 0, 0.03), 1 - ramp(local, span - (last ? 0.5 : 0.03), span))
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {part ? <Frame time={part.from + t - part.start} lines={ids} /> : null}
      <AbsoluteFill style={{ background: "#000", opacity: ramp(t, length - 0.3, length) }} />
      {parts.map(({ from, to, start }, i) => {
        const last = i === parts.length - 1
        const trim = { trimBefore: Math.round(from * fps), trimAfter: Math.round(to * fps) }
        return (
          <Sequence
            key={start}
            from={Math.round(start * fps)}
            durationInFrames={Math.round((to - from) * fps)}
            premountFor={fps}
          >
            <Html5Audio
              src={staticFile("audio/voiceover.wav")}
              {...trim}
              volume={(frame) => (speaking(from + frame / fps) ? 1 : 0)}
              pauseWhenBuffering
            />
            <Html5Audio
              src={staticFile("audio/score.wav")}
              {...trim}
              volume={(frame) => edges(frame / fps, to - from, last) * musicVolume(from + frame / fps, ids)}
              pauseWhenBuffering
            />
            <Html5Audio
              src={staticFile("audio/sfx.wav")}
              {...trim}
              volume={(frame) => 0.7 * edges(frame / fps, to - from, last)}
              pauseWhenBuffering
            />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
