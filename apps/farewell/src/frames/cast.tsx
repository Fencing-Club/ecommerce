import type { ReactNode } from "react"
import { Quartet } from "../cast/activities"
import { Agent } from "../cast/agent"
import { Cardinal, Scroll } from "../cast/cardinal"
import { Clippy } from "../cast/clippy"
import { MathCoach, ReadingCoach, StudyGuide } from "../cast/coaches"
import { Copilot } from "../cast/copilot"
import { Engineer } from "../cast/engineer"
import { SchoolDataSync } from "../cast/sds"
import { Unicorn } from "../cast/unicorn"
import { WindowsPhone } from "../cast/windows-phone"
import { Canvas, Cut } from "../paper"
import { font, ink, paper, velvet } from "../theme"

const Plate = ({ x, y, name, part }: { x: number; y: number; name: string; part: string }) => (
  <g>
    <text x={x} y={y} textAnchor="middle" fontFamily={font.title} fontSize="30" fill={ink}>
      {name}
    </text>
    <text
      x={x}
      y={y + 28}
      textAnchor="middle"
      fontFamily={font.book}
      fontStyle="italic"
      fontSize="20"
      fill={velvet.dark}
    >
      {part}
    </text>
  </g>
)

export const Entry = ({
  x,
  y,
  name,
  part,
  children
}: {
  x: number
  y: number
  name: string
  part: string
  children: ReactNode
}) => (
  <g>
    <ellipse cx={x} cy={y + 4} rx="90" ry="10" fill={paper.shade} />
    <Cut>{children}</Cut>
    <Plate x={x} y={y + 46} name={name} part={part} />
  </g>
)

// A sheet of the programme: paper, a ruled border and a heading.
export const Sheet = ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
  <Canvas background={paper.base}>
    <rect x="0" y="0" width="1920" height="1080" fill={paper.base} />
    <rect x="28" y="28" width="1864" height="1024" fill="none" stroke={ink} strokeWidth="4" />
    <rect x="40" y="40" width="1840" height="1000" fill="none" stroke={ink} strokeWidth="1.5" />
    <text x="960" y="104" textAnchor="middle" fontFamily={font.title} fontSize="64" fill={ink}>
      {title}
    </text>
    <text
      x="960"
      y="142"
      textAnchor="middle"
      fontFamily={font.book}
      fontStyle="italic"
      fontSize="24"
      fill={velvet.dark}
    >
      {subtitle}
    </text>
    {children}
  </Canvas>
)

// The company on one sheet, every character standing over its name.
export const CastSheet = () => (
  <Sheet title="Dramatis Personæ" subtitle="The EDU Players, in order of appearance">
    <Entry x={180} y={540} name="The Engineer" part="on the way out">
      <Engineer
        x={180}
        y={540}
        scale={0.86}
        pose={{
          armL: 16,
          elbowL: 8,
          cane: { hand: "left", angle: 10 },
          armR: 125,
          elbowR: 35,
          openR: true,
          mouth: "smile",
          look: { x: 0.3, y: 0 }
        }}
      />
    </Entry>
    <Entry x={420} y={540} name="Clippy" part="compère">
      <Clippy x={430} y={540} scale={1.02} hat bowtie />
    </Entry>
    <Entry x={650} y={540} name="Copilot" part="the understudy">
      <Copilot x={650} y={540} scale={1.05} armR={110} />
    </Entry>
    <Entry x={960} y={540} name="The Unicorn" part="with Ninja Cat up">
      <Unicorn x={930} y={540} scale={0.66} />
    </Entry>
    <Entry x={1270} y={540} name="Windows Phone" part="not dead yet">
      <WindowsPhone x={1270} y={540} scale={1.05} armR={140} face="grin" />
    </Entry>
    <Entry x={1510} y={540} name="Reading Coach" part="sounds it out">
      <ReadingCoach x={1510} y={540} scale={0.85} />
    </Entry>
    <Entry x={1745} y={540} name="Math Coach" part="checks the sums">
      <MathCoach x={1745} y={540} scale={0.9} />
    </Entry>
    <Entry x={190} y={958} name="Study Guide" part="from Copilot Notebooks">
      <StudyGuide x={190} y={958} scale={0.9} />
    </Entry>
    <Entry x={450} y={958} name="School Data Sync" part="stagehand">
      <SchoolDataSync x={450} y={958} scale={0.92} armR={150} elbowR={10} />
    </Entry>
    <Entry x={860} y={958} name="Learning Activities" part="a barbershop quartet, by Loop">
      <Quartet x={860} y={958} scale={0.82} mouth="smile" />
    </Entry>
    <Entry x={1260} y={958} name="The Agents" part="a chorus, awakening">
      <g>
        <Agent x={1180} y={958} scale={1.05} awake={false} />
        <Agent x={1270} y={958} scale={1.15} armR={130} />
        <Agent x={1360} y={958} scale={1.05} tint="#d8c7a1" />
      </g>
    </Entry>
    <Entry x={1560} y={958} name="The Choir" part="cherubim, in the boxes">
      <Clippy x={1570} y={958} scale={0.85} cherub mouth="sing" brows={0.9} />
    </Entry>
    <Entry x={1770} y={958} name="The Cardinals" part="of the Reorg">
      <Cardinal x={1770} y={958} scale={0.9} holdR={<Scroll text="New Org Chart" />} />
    </Entry>
  </Sheet>
)
