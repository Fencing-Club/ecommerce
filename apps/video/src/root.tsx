import { Composition } from "remotion"
import { Ad } from "./ad"
import { fps, seconds } from "./timeline"

export const Root = () => (
  <Composition id="Copacker" component={Ad} durationInFrames={seconds * fps} fps={fps} width={1920} height={1080} />
)
