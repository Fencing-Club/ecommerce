import { AbsoluteFill, Easing } from "remotion"
import { ramp, settle } from "../motion"
import { Stage } from "../stage"
import { moments } from "../timeline"
import { Headline } from "../type"
import { HolidayChart, played } from "./holiday"

const m = moments.outcome

// 1:34 to 1:38, the outcome: the holiday forecast again, with the order placed on time, now fully stocked through the
// rush.
export const Outcome = ({ t }: { t: number }) => {
  const leaving = ramp(t, m.out, m.out + 0.35, Easing.in(Easing.cubic))
  return (
    <Stage glow={{ x: 50, y: 62, strength: 1.1 }}>
      <Headline
        t={t}
        at={m.headline}
        out={m.out}
        lines={["This holiday season, fully stocked."]}
        accented={["fully", "stocked."]}
        size={76}
        align="center"
        style={{ position: "absolute", left: 0, right: 0, top: 92, zIndex: 2 }}
      />
      <AbsoluteFill
        style={{
          opacity: 1 - leaving,
          filter: leaving > 0 ? `blur(${leaving * 12}px)` : undefined,
          transform: `scale(${1 + 0.06 * leaving})`
        }}
      >
        <HolidayChart
          t={t}
          header={false}
          offset={40}
          scale={0.94}
          state={{
            ...played,
            card: settle(t, m.chart, 17, 120),
            stocked: ramp(t, m.stocked, m.stocked + 0.9, Easing.inOut(Easing.cubic))
          }}
        />
      </AbsoluteFill>
    </Stage>
  )
}
