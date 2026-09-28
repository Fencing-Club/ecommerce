import { Composition } from "remotion"
import { Ad, Voiceover } from "./ad"
import { fps, seconds } from "./timeline"

// The ad, and the voiceover alone, which the audio script renders into the ad's voice track.
export const Root = () => (
  <>
    <Composition id="Copacker" component={Ad} durationInFrames={seconds * fps} fps={fps} width={1920} height={1080} />
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
