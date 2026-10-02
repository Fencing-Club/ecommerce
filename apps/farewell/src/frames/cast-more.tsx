import { Duck } from "../cast/duck"
import { Guard } from "../cast/guard"
import { Lamp } from "../cast/lamp"
import { Octocat, PullRequest } from "../cast/octocat"
import { Octopus } from "../cast/octopus"
import { SadLady } from "../cast/sad-lady"
import { AirBalloon, Biplane, Moon } from "../machines"
import { font, ink, velvet } from "../theme"
import { Entry, Sheet } from "./cast"

const Caption = ({ x, y, name, part }: { x: number; y: number; name: string; part: string }) => (
  <g>
    <text x={x} y={y} textAnchor="middle" fontFamily={font.title} fontSize="26" fill={ink}>
      {name}
    </text>
    <text
      x={x}
      y={y + 24}
      textAnchor="middle"
      fontFamily={font.book}
      fontStyle="italic"
      fontSize="18"
      fill={velvet.dark}
    >
      {part}
    </text>
  </g>
)

// The rest of the company, and the flying machines and other business that cross the back of the stage.
export const CastSheetMore = () => (
  <Sheet title="Dramatis Personæ, continued" subtitle="with flying machines, and other business at the back">
    <Entry x={200} y={540} name="The Rubber Duck" part="debugging">
      <Duck x={190} y={540} scale={1.35} />
    </Entry>
    <Entry x={480} y={540} name="The Lamp" part="lighting">
      <Lamp x={460} y={540} scale={0.95} beam={90} />
    </Entry>
    <Entry x={790} y={540} name="Sad Lady" part="every error">
      <SadLady x={770} y={418} scale={0.92} />
    </Entry>
    <Entry x={1090} y={540} name="The Octocat" part="pull requests">
      <Octocat x={1070} y={540} scale={1.05} hold={<PullRequest label="REVIEW ME" />} />
    </Entry>
    <Entry x={1390} y={540} name="The Pink Octopus" part="the orchestra">
      <Octopus x={1390} y={540} scale={0.86} />
    </Entry>
    <Entry x={1690} y={540} name="The SFI Guard" part="security">
      <Guard x={1650} y={540} scale={0.74} />
    </Entry>
    <path d="M120,640 H1800" stroke={ink} strokeWidth="1.5" strokeDasharray="2 6" />
    <Biplane x={230} y={730} scale={0.58} banner={["WORK FROM HOME", "IMPROVES PRODUCTIVITY"]} wires={false} />
    <Biplane x={230} y={846} scale={0.58} banner={["RTO IS THE WAY TO GO"]} wires={false} />
    <Biplane x={700} y={858} scale={0.46} banner={["(3 DAYS A WEEK)"]} wires={false} />
    <Caption x={560} y={985} name="Flying machines" part="on wires, crossing the back of the stage" />
    <AirBalloon x={1230} y={818} scale={0.6} banner={["HYBRID: BEST OF BOTH WORLDS"]} colors={["#1f6fb2", "#f2e3b3"]} />
    <Caption x={1230} y={985} name="A hot-air balloon" part="drifting through Act III" />
    <Moon x={1640} y={820} r={90} hit />
    <Caption x={1640} y={985} name="The Moon" part="where Skilling stock goes" />
  </Sheet>
)
