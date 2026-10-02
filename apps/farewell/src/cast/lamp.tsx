import { type Place, placed } from "../paper"
import { ink } from "../theme"

const purple = "#6a4fd1"
const purpleDark = "#4b34a6"
const teal = "#2fb8b4"

type LampProps = Place & {
  // The lower arm's lean and the bend at the elbow, in degrees.
  lean?: number
  bend?: number
  // The shade's turn on its joint: about -90 points it down and to the picture's right.
  aim?: number
  // How far the beam reaches; 0 is switched off.
  beam?: number
  look?: { x: number; y: number }
}

// The Lamp: a purple desk lamp with googly eyes on its shade, who works the follow spot.
export const Lamp = ({
  lean = -12,
  bend = 58,
  aim = -88,
  beam = 0,
  look = { x: 0.4, y: 0.3 },
  ...place
}: LampProps) => (
  <g transform={placed(place)}>
    <defs>
      <linearGradient id="lampBeam" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff2b8" stopOpacity="0.7" />
        <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d="M-74,-14 A74,18 0 0 0 74,-14 V-2 A74,18 0 0 1 -74,-2 Z" fill={purpleDark} stroke={ink} strokeWidth="3" />
    <ellipse cx="0" cy="-14" rx="74" ry="18" fill={purple} stroke={ink} strokeWidth="3" />
    <ellipse cx="-22" cy="-19" rx="30" ry="5" fill="#fff" opacity="0.3" />
    <g transform={`translate(-6 -28) rotate(${lean})`}>
      <rect x="-10" y="-160" width="7" height="160" rx="3" fill={teal} stroke={ink} strokeWidth="2" />
      <rect x="3" y="-160" width="7" height="160" rx="3" fill={teal} stroke={ink} strokeWidth="2" />
      <path d="M-3,-36 l6,-6 l-6,-6 l6,-6 l-6,-6 l6,-6 l-6,-6" stroke="#7a7f8a" strokeWidth="2" fill="none" />
      <g transform="translate(12 -104) rotate(12)">
        <rect width="36" height="32" fill="#fff3a3" stroke={ink} strokeWidth="2" />
        <path d="M6,11 H30 M6,19 H24" stroke="#9c8f4a" strokeWidth="2" />
      </g>
      <circle r="13" fill={purple} stroke={ink} strokeWidth="3" />
      <g transform={`translate(0 -160) rotate(${bend})`}>
        <rect x="-5" y="-136" width="10" height="136" rx="5" fill={teal} stroke={ink} strokeWidth="2" />
        <circle r="14" fill={purple} stroke={ink} strokeWidth="3" />
        <circle r="5" fill={teal} />
        <g transform={`translate(0 -136) rotate(${aim})`}>
          <circle r="10" fill={purple} stroke={ink} strokeWidth="3" />
          <g transform="translate(16 22)">
            {beam > 0 ? (
              <path
                d={`M-40,26 L40,26 L${40 + beam * 0.5},${26 + beam} L${-40 - beam * 0.5},${26 + beam} Z`}
                fill="url(#lampBeam)"
                style={{ mixBlendMode: "screen" }}
              />
            ) : null}
            <path d="M-48,26 C-52,-34 52,-34 48,26 Z" fill={purple} stroke={ink} strokeWidth="3" />
            <ellipse
              cx="0"
              cy="26"
              rx="48"
              ry="11"
              fill={beam > 0 ? "#fff3c0" : purpleDark}
              stroke={ink}
              strokeWidth="2.5"
            />
            <path
              d="M-32,-2 Q-22,-16 -4,-18"
              stroke="#fff"
              strokeWidth="4"
              opacity="0.35"
              fill="none"
              strokeLinecap="round"
            />
            {[
              { x: -8, y: -14, r: 19 },
              { x: 26, y: -6, r: 16 }
            ].map(({ x, y, r }) => (
              <g key={x}>
                <circle cx={x} cy={y} r={r} fill="#fff" stroke={ink} strokeWidth="2.5" />
                <circle cx={x + look.x * r * 0.45} cy={y + look.y * r * 0.45} r={r * 0.48} fill={ink} />
                <circle
                  cx={x + look.x * r * 0.45 - r * 0.18}
                  cy={y + look.y * r * 0.45 - r * 0.18}
                  r={r * 0.14}
                  fill="#fff"
                />
              </g>
            ))}
          </g>
        </g>
      </g>
    </g>
  </g>
)
