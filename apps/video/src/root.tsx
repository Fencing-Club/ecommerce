import { Composition } from "remotion"
import { Ad, Voiceover } from "./ad"
import { Cut } from "./cutdown"
import { cutdowns, fps, lengthOf, seconds } from "./timeline"

// The full ad, its cutdowns, named by their length, and the voiceover alone, which the audio script renders into the
// ad's voice track.
export const Root = () => (
  <>
    <Composition id="Copacker" component={Ad} durationInFrames={seconds * fps} fps={fps} width={1920} height={1080} />
    {Object.entries(cutdowns).map(([length, stretches]) => (
      <Composition
        key={length}
        id={`Copacker-${length}`}
        component={Cut}
        defaultProps={{ stretches }}
        durationInFrames={Math.round(lengthOf(stretches) * fps)}
        fps={fps}
        width={1920}
        height={1080}
      />
    ))}
    <Composition
      id="Voiceover"
      component={Voiceover}
      durationInFrames={seconds * fps}
      fps={fps}
      width={1920}
      height={1080}
    />
  </>
)
