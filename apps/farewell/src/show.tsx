import { AbsoluteFill, Html5Audio, useCurrentFrame } from "remotion"
import song from "../So Long.mp3"
import { Act2 } from "./scenes/act2"
import { Act3 } from "./scenes/act3"
import { Act4 } from "./scenes/act4"
import { Act5 } from "./scenes/act5"
import { Chorus1 } from "./scenes/chorus1"
import { Credits } from "./scenes/credits"
import { CurtainCall } from "./scenes/curtain-call"
import { Epilogue } from "./scenes/epilogue"
import { Finale } from "./scenes/finale"
import { Interval } from "./scenes/interval"
import { OvertureScene } from "./scenes/overture"
import { PreChorus } from "./scenes/prechorus"
import { Sincere } from "./scenes/sincere"
import { Verse1 } from "./scenes/verse1"
import { Song } from "./song"
import { at, fps, type Part, partAt } from "./timeline"

// The scene playing at `t`: one per part, with Act I's verse, pre-chorus and chorus each their own.
const Scene = ({ t, part, from }: { t: number; part: Part; from: number }) => {
  switch (part) {
    case "overture":
      return <OvertureScene t={t} />
    case "act1":
      if (t < at("commit")) {
        return <Verse1 t={t} />
      }
      return t < at("soLong1") ? <PreChorus t={t} /> : <Chorus1 t={t} />
    case "interval":
      return <Interval t={t} />
    case "act2":
      return <Act2 t={t} />
    case "act3":
      return <Act3 t={t} />
    case "act4":
      return <Act4 t={t} />
    case "sincere":
      return <Sincere t={t} />
    case "act5":
      return <Act5 t={t} />
    case "finale":
      return <Finale t={t} />
    case "epilogue":
      return <Epilogue t={t} />
    case "curtainCall":
      return <CurtainCall t={t} />
    case "credits":
      return <Credits t={t - from} />
  }
}

// The whole show against the song.
export const Show = () => {
  const t = useCurrentFrame() / fps
  const part = partAt(t)
  return (
    <AbsoluteFill>
      <Song.Provider value={t}>
        <Scene t={t} part={part.id} from={part.from} />
      </Song.Provider>
      <Html5Audio src={song} pauseWhenBuffering />
    </AbsoluteFill>
  )
}
