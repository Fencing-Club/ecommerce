import { Quartet } from "./cast/activities"
import { Agent } from "./cast/agent"
import { Clippy } from "./cast/clippy"
import { MathCoach, ReadingCoach, StudyGuide } from "./cast/coaches"
import { Copilot } from "./cast/copilot"
import { Engineer, type EngineerPose } from "./cast/engineer"
import { SchoolDataSync } from "./cast/sds"
import { Unicorn } from "./cast/unicorn"
import { WindowsPhone } from "./cast/windows-phone"
import { hop, onTwos } from "./motion"
import { Cut } from "./paper"
import { TokenRain } from "./props"
import { beats } from "./timeline"

// The company's kick line for the choruses: kicks on the beat, alternating legs, arms up, the Engineer twirling the
// cane on the big counts. `lead` puts Copilot in the middle and the Engineer at the end; `agents` adds the agents at
// the back, kicking a little too high; `phone` is false while Windows Phone is out on the deprecation cart, and
// `unicorn` while the Unicorn gallops across the front.
export const KickLine = ({
  t,
  lead = "engineer",
  agents = false,
  phone = true,
  unicorn = true,
  shift = 0
}: {
  t: number
  lead?: "engineer" | "copilot"
  agents?: boolean
  phone?: boolean
  unicorn?: boolean
  shift?: number
}) => {
  const s = onTwos(t)
  const b = beats(s)
  const beat = Math.floor(b)
  const kick = Math.sin(Math.PI * (b - beat))
  const even = beat % 2 === 0
  const legL = even ? 70 * kick : 4
  const legR = even ? 4 : 70 * kick
  const twirl = beat % 4 === 3
  const engineer: EngineerPose = {
    armL: 150 + kick * 8,
    elbowL: -10,
    openL: true,
    armR: 130,
    elbowR: 20,
    cane: twirl
      ? { hand: "right", angle: 160 + (b - beat) * 720, grip: 0.5 }
      : { hand: "right", angle: 165, grip: 0.3 },
    legL,
    legR,
    mouth: "sing",
    look: { x: 0, y: -0.2 }
  }
  const front = lead === "engineer" ? [560, 760, 960, 1160, 1360] : [560, 760, 1360, 1160, 960]
  const [phoneX = 560, readingX = 760, engineerX = 960, clippyX = 1160, copilotX = 1360] = front.map((x) => x + shift)
  const bob = hop(t) * 10
  return (
    <g>
      <TokenRain count={30} seed="chorus" area={{ x: 190, y: ((t * 240) % 640) - 480, width: 1540, height: 600 }} />
      <TokenRain
        count={30}
        seed="chorus2"
        area={{ x: 190, y: ((t * 240 + 320) % 640) - 480, width: 1540, height: 600 }}
      />
      <Cut>
        {agents
          ? [610, 1010, 1410].map((x, i) => (
              <Agent
                key={x}
                x={x + shift}
                y={750 - bob}
                scale={0.56}
                rotate={(i % 2 === 0 ? 1 : -1) * kick * 12}
                armL={150}
                armR={150 - kick * 40}
                tint={["#c9d0dc", "#d8c7a1", "#b9d4c4"][i]}
              />
            ))
          : null}
        {unicorn ? (
          <Unicorn x={1470 + shift} y={812} scale={0.46} front={even ? 60 * kick : 0} back={even ? 0 : 60 * kick} />
        ) : null}
        <MathCoach x={660 + shift} y={812 - bob} scale={0.56} armL={130 + kick * 20} armR={130} mouth="sing" />
        <Quartet x={860 + shift} y={812 - bob} scale={0.48} />
        <StudyGuide x={1060 + shift} y={812} scale={0.56} armL={140} armR={140} legL={legL} legR={legR} mouth="sing" />
        <SchoolDataSync
          x={1260 + shift}
          y={812}
          scale={0.56}
          armL={150}
          elbowL={-10}
          armR={150}
          legL={legL}
          legR={legR}
          mouth="sing"
        />
        {phone ? (
          <WindowsPhone
            x={phoneX}
            y={896}
            scale={0.8}
            armL={150}
            armR={60 + kick * 40}
            legL={legL}
            legR={legR}
            face="o"
          />
        ) : null}
        <ReadingCoach x={readingX} y={896} scale={0.74} armL={130} armR={60} legL={legL} legR={legR} mouth="sing" />
        <Engineer x={engineerX} y={898 - bob * 0.4} scale={0.8} pose={engineer} />
        <Clippy
          x={clippyX}
          y={896 - bob}
          scale={0.62}
          hat
          bowtie
          rotate={(even ? 1 : -1) * 8 * kick}
          brows={1}
          mouth="sing"
        />
        <Copilot
          x={copilotX}
          y={884 - bob}
          scale={lead === "copilot" ? 0.78 : 0.64}
          armL={150}
          armR={150 - kick * 30}
          mouth="sing"
          look={{ x: 0, y: -0.3 }}
        />
      </Cut>
    </g>
  )
}
