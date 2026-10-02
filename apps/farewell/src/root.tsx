import { Composition, Still } from "remotion"
import { CastSheet } from "./frames/cast"
import { CastSheetMore } from "./frames/cast-more"
import { Show } from "./show"
import { fps, length } from "./timeline"

// The video, then the two sheets of the cast. The storyboard's other pictures are stills of the video itself.
export const Root = () => (
  <>
    <Composition
      id="Farewell"
      component={Show}
      durationInFrames={Math.round(length * fps)}
      fps={fps}
      width={1920}
      height={1080}
    />
    <Still id="Cast" component={CastSheet} width={1920} height={1080} />
    <Still id="CastMore" component={CastSheetMore} width={1920} height={1080} />
  </>
)
