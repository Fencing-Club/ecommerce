import { AbsoluteFill, Easing } from "remotion"
import { ramp } from "../motion"
import { Stage } from "../stage"
import { stage } from "../theme"
import { moments } from "../timeline"
import { Headline } from "../type"
import { Chaos } from "./chaos"

const { hook } = moments

// 0:00 to 0:10, the hook: one phrase at a time over the mess a restock makes, the emails counting up, until the
// stockout lands and everything shakes, then freezes, half a beat before the drop.
export const Hook = ({ t }: { t: number }) => {
  const emails = Math.max(1, Math.round(43 * ramp(t, hook.emails[0], hook.sheets[0], Easing.out(Easing.quad))))
  const phrases = [
    { at: hook.lines[0], out: 1.7, text: "Restocking a best-seller" },
    { at: hook.lines[1], out: 2.72, text: "shouldn’t take" },
    { at: hook.lines[2], out: 4.22, text: `${emails} emails,` },
    { at: hook.lines[3], out: 5.72, text: "12 spreadsheets," },
    { at: hook.lines[4], out: 8.4, text: "and a stockout." }
  ]
  // The opening punches in on the first frame and settles, then the camera pushes slowly in until the freeze.
  const punch = 0.1 * (1 - ramp(t, 0, 0.5, Easing.out(Easing.cubic)))
  const push = 1 + punch + 0.07 * ramp(t, 0, hook.freeze, Easing.inOut(Easing.quad))
  const flash = 1 - ramp(t, 0, 0.3, Easing.out(Easing.quad))
  return (
    <Stage glow={{ x: 50, y: 55, strength: 0.35 }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <Chaos t={t} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: 0.14 * flash }} />
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 760px 260px at 50% 52%, rgba(9, 9, 11, 0.82), transparent 72%)"
        }}
      />
      {phrases
        .filter(({ at, out }) => t >= at - 0.05 && t < out + 0.4)
        .map(({ at, out, text }) => (
          <Headline
            key={at}
            t={t}
            at={at}
            out={out}
            lines={[text]}
            size={124}
            align="center"
            accented={["stockout."]}
            accent={{ color: stage.danger }}
            style={{ position: "absolute", left: 0, right: 0, top: 470, zIndex: 2 }}
          />
        ))}
    </Stage>
  )
}
