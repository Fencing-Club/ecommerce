import type { CSSProperties } from "react"
import { Easing } from "remotion"
import { ramp, settle } from "./motion"
import { accent, font, stage } from "./theme"

// Orange gradient text, for the words a headline leans on.
export const lit: CSSProperties = {
  backgroundImage: accent,
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent"
}

type HeadlineProps = {
  t: number
  // When the first word starts rising, and when the headline starts leaving.
  at: number
  out?: number
  lines: readonly string[]
  size?: number
  // Words set apart, in the accent gradient unless `accent` says otherwise.
  accented?: readonly string[]
  accent?: CSSProperties
  align?: "left" | "center"
  style?: CSSProperties
}

// A headline whose words rise into place one after another from behind a mask, sharpening as they land.
export const Headline = ({
  t,
  at,
  out,
  lines,
  size = 84,
  accented = [],
  accent: accentStyle = lit,
  align = "left",
  style
}: HeadlineProps) => {
  const leaving = out === undefined ? 0 : ramp(t, out, out + 0.35, Easing.in(Easing.cubic))
  let index = 0
  return (
    <div
      style={{
        fontFamily: font.sans,
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.04,
        letterSpacing: "-0.045em",
        textAlign: align,
        color: stage.text,
        opacity: 1 - leaving,
        filter: leaving > 0 ? `blur(${leaving * 14}px)` : undefined,
        transform: `translateY(${-36 * leaving}px)`,
        ...style
      }}
    >
      {lines.map((line) => (
        <div key={line} style={{ whiteSpace: "nowrap" }}>
          {line.split(" ").map((word, i) => {
            const rise = settle(t, at + index++ * 0.055, 20, 170)
            return (
              <span
                key={`${i}-${word}`}
                style={{
                  display: "inline-block",
                  overflow: "hidden",
                  verticalAlign: "top",
                  paddingBottom: "0.1em",
                  marginRight: "0.24em"
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    transform: `translateY(${(1 - rise) * 105}%)`,
                    filter: rise < 0.98 ? `blur(${(1 - rise) * 10}px)` : undefined,
                    ...(accented.includes(word) ? accentStyle : {})
                  }}
                >
                  {word}
                </span>
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

type LabelProps = { t: number; at: number; number: string; name: string; out?: number }

// A chapter marker above a feature's headline: its number in orange, a rule, and its name.
export const Label = ({ t, at, number, name, out }: LabelProps) => {
  const shown = settle(t, at, 22, 170) * (1 - (out === undefined ? 0 : ramp(t, out, out + 0.3)))
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: font.mono,
        fontSize: 19,
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        opacity: shown,
        transform: `translateX(${(1 - shown) * -24}px)`
      }}
    >
      <span style={{ color: "#ff8a3d" }}>{number}</span>
      <span style={{ width: 40 * shown, height: 1.5, background: "rgba(250, 250, 250, 0.35)" }} />
      <span style={{ color: stage.muted }}>{name}</span>
    </div>
  )
}
