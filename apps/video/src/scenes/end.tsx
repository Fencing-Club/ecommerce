import { ArrowRight } from "lucide-react"
import { AbsoluteFill, Easing } from "remotion"
import { cta } from "../data"
import { ramp, settle } from "../motion"
import { Stage } from "../stage"
import { app, font, stage } from "../theme"
import { moments } from "../timeline"
import { Headline } from "../type"
import { Mark } from "../ui"

const m = moments.end

// A ring of light spreading from the mark, as the logo lands and again on the final chord.
const Ring = ({ progress }: { progress: number }) =>
  progress > 0 && progress < 1 ? (
    <div
      style={{
        position: "absolute",
        left: 960,
        top: 420,
        width: 2400 * progress,
        height: 2400 * progress,
        borderRadius: "50%",
        border: `3px solid rgba(255, 138, 61, ${0.7 * (1 - progress)})`,
        transform: "translate(-50%, -50%)"
      }}
    />
  ) : null

// 1:38 to 1:45, the end card: the mark lands with a burst of light, the name beside it, the line and the call to action
// under them, and the final chord pulses the mark before a fade to black.
export const End = ({ t }: { t: number }) => {
  const landed = settle(t, m.logo, 11, 150)
  const named = settle(t, m.logo + 0.2, 18, 150)
  const asked = settle(t, m.cta, 16, 160)
  const pulse = Math.max(0, 1 - Math.abs(t - m.final - 0.15) / 0.5)
  const dark = ramp(t, m.fade, m.fade + 0.6)
  return (
    <Stage glow={{ x: 50, y: 45, strength: 0.9 + 0.5 * pulse }}>
      <Ring progress={ramp(t, m.logo, m.logo + 1.2, Easing.out(Easing.cubic))} />
      <Ring progress={ramp(t, m.final, m.final + 1.2, Easing.out(Easing.cubic))} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 420,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          transform: "translateY(-50%)"
        }}
      >
        <Mark
          size={150}
          style={{
            opacity: Math.min(1, landed * 2),
            transform: `scale(${(0.5 + 0.5 * landed) * (1 + 0.06 * pulse)})`,
            boxShadow: `0 30px ${90 + 60 * pulse}px -20px rgba(245, 74, 0, ${0.8 + 0.2 * pulse})`
          }}
        />
        <span
          style={{
            fontSize: 150,
            fontWeight: 600,
            letterSpacing: "-0.05em",
            opacity: named,
            transform: `translateX(${(1 - named) * -30}px)`
          }}
        >
          Copacker
        </span>
      </div>
      <Headline
        t={t}
        at={m.tagline}
        lines={["Restocking, handled."]}
        accented={["handled."]}
        size={64}
        align="center"
        style={{ position: "absolute", left: 0, right: 0, top: 540 }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 690,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          opacity: asked,
          transform: `translateY(${(1 - asked) * 24}px)`
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 34px",
            borderRadius: 999,
            background: app.primary,
            color: "#fff",
            fontFamily: font.sans,
            fontSize: 30,
            fontWeight: 600,
            boxShadow: "0 20px 50px -16px rgba(245, 74, 0, 0.7)"
          }}
        >
          {cta.action}
          <ArrowRight size={28} strokeWidth={2.4} />
        </span>
        <span style={{ fontFamily: font.sans, fontSize: 32, fontWeight: 500, color: stage.muted }}>{cta.address}</span>
      </div>
      <AbsoluteFill style={{ background: "#000", opacity: dark }} />
    </Stage>
  )
}
