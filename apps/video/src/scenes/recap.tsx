import { AbsoluteFill, Easing } from "remotion"
import { count, restock } from "../data"
import { ramp, settle } from "../motion"
import { Stage } from "../stage"
import { app } from "../theme"
import { moments } from "../timeline"
import { lit } from "../type"
import { Badge, Card } from "../ui"
import { AgentPanel } from "./agents"
import { BoxLabel } from "./amazon"
import { Route } from "./reorder"

const m = moments.recap
const [bottle] = restock

const Answer = () => (
  <Card style={{ display: "grid", gap: 10, width: 560, padding: 30 }}>
    <span style={{ fontSize: 20, color: app.muted }}>{bottle.name}</span>
    <span style={{ fontSize: 24, fontWeight: 600 }}>To order</span>
    <span style={{ fontSize: 88, fontWeight: 700, letterSpacing: "-0.04em", color: app.primary }}>
      {count(bottle.order)}
    </span>
    <span style={{ fontSize: 19, color: app.muted }}>
      {count(bottle.order / bottle.caseOf)} cases of {bottle.caseOf}, before it runs out
    </span>
  </Card>
)

const Order = () => (
  <Card style={{ display: "grid", gap: 18, width: 820, padding: 30 }}>
    <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em" }}>PO 1042</span>
      <Badge tone="primary">With supplier</Badge>
    </span>
    <Route />
  </Card>
)

const Labels = () => (
  <div style={{ position: "relative", width: 560, height: 300 }}>
    {[1, 2, 3, 4, 5].map((box, i) => (
      <BoxLabel
        key={box}
        box={box}
        style={{
          position: "absolute",
          left: 40 + i * 70,
          top: 20 + (i % 2) * 18,
          transform: `rotate(${(i - 2) * 5}deg) scale(1.25)`
        }}
      />
    ))}
  </div>
)

const Automate = () => <AgentPanel t={20} compact />

// Each cut's word and shot. The shots are components, not elements: Remotion's bundler compiles JSX to
// React.createElement, and React is only global once the composition renders, so no JSX can run as a module loads.
const cuts = [
  { word: "Forecast.", Shot: Answer },
  { word: "Reorder.", Shot: Order },
  { word: "Ship.", Shot: Labels },
  { word: "Automate.", Shot: Automate }
]

// 1:20 to 1:24, the recap: four cuts on the beat, a word and the moment that proves it.
export const Recap = ({ t }: { t: number }) => {
  const index = Math.min(cuts.length - 1, Math.floor(t / (m.cuts[1] - m.cuts[0])))
  const local = t - m.cuts[index]
  const punch = settle(local, 0, 16, 220)
  const flash = 1 - ramp(local, 0, 0.18, Easing.out(Easing.quad))
  const { word, Shot } = cuts[index]
  return (
    <Stage glow={{ x: 70, y: 55, strength: 1.2 }}>
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 540,
          transform: `translateY(-50%) scale(${1.14 - 0.14 * punch})`,
          transformOrigin: "0 50%",
          fontSize: 150,
          fontWeight: 600,
          letterSpacing: "-0.05em"
        }}
      >
        {word.slice(0, -1)}
        <span style={lit}>.</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1390,
          top: 540,
          transform: `translate(-50%, -50%) scale(${1.1 - 0.1 * punch}) rotate(${(1 - punch) * 3}deg)`
        }}
      >
        <Shot />
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.16 }} />
    </Stage>
  )
}
