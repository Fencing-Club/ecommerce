import { Sparkle } from "./cast/copilot"
import { type Place, placed } from "./paper"
import { font, gold, ink } from "./theme"

const glass = "#e6f2fa"
const glassSide = "#c4dcee"
const glassTop = "#f7fbfe"
const etch = "#5f7f9b"

// The service anniversary crystal: a cut-glass obelisk with a slanted top and a coloured band through it, standing on
// an engraved glass base. Drawn standing on (x, y), about 200 tall.
export const Crystal = ({
  band = "#2f6fd6",
  years = "Ten years",
  ...place
}: Place & { band?: string; years?: string }) => (
  <g transform={placed(place)} strokeLinejoin="round">
    <path d="M-62,0 V-22 H62 V0 Z" fill={glass} stroke={ink} strokeWidth="2.5" />
    <path d="M62,0 L76,-9 V-31 L62,-22 Z" fill={glassSide} stroke={ink} strokeWidth="2.5" />
    <path d="M-62,-22 L-48,-31 H76 L62,-22 Z" fill={glassTop} stroke={ink} strokeWidth="2.5" />
    <text y="-11" textAnchor="middle" fontFamily={font.book} fontStyle="italic" fontSize="9" fill={etch}>
      The Engineer
    </text>
    <text y="-3" textAnchor="middle" fontFamily={font.book} fontSize="6.5" fill={etch}>
      {years}
    </text>
    <text
      x="57"
      y="-3"
      textAnchor="end"
      fontFamily={font.sans}
      fontWeight="700"
      fontStyle="italic"
      fontSize="5.5"
      fill={etch}
    >
      Microsoft
    </text>
    <path d="M-22,-27 H22 V-150 L-22,-184 Z" fill={glass} stroke={ink} strokeWidth="2.5" />
    <path d="M22,-27 L36,-36 V-158 L22,-150 Z" fill={glassSide} stroke={ink} strokeWidth="2.5" />
    <path d="M-22,-184 L22,-150 L36,-158 L-8,-192 Z" fill={glassTop} stroke={ink} strokeWidth="2.5" />
    <path d="M-16,-182 L14,-158 L-4,-176 Z" fill={band} opacity="0.35" />
    <path d="M-22,-98 Q0,-106 22,-94 V-80 Q0,-92 -22,-84 Z" fill={band} opacity="0.85" />
    <path d="M22,-94 L36,-102 V-88 L22,-80 Z" fill={band} opacity="0.6" />
    <path d="M-14,-40 V-170" stroke="#fff" strokeWidth="4" opacity="0.75" strokeLinecap="round" />
    <path d="M-6,-46 V-120" stroke="#fff" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
    <path d="M28,-44 V-140" stroke="#fff" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
  </g>
)

// A patent cube: black marble with the patent office's gold seal set in the top and the patent engraved in gold on
// the front. Drawn about the middle of its front face, so it tumbles true; the front is 68 across.
export const PatentCube = ({ title, date, ...place }: Place & { title: readonly string[]; date: string }) => (
  <g transform={placed(place)} strokeLinejoin="round">
    <path d="M-34,-34 H34 V34 H-34 Z" fill="#1e1d22" stroke={ink} strokeWidth="2.5" />
    <path d="M-34,-34 L-20,-46 H48 L34,-34 Z" fill="#35343b" stroke={ink} strokeWidth="2.5" />
    <path d="M34,-34 L48,-46 V22 L34,34 Z" fill="#121115" stroke={ink} strokeWidth="2.5" />
    <g fill="none" stroke="#8d8a96" strokeWidth="1" opacity="0.55">
      <path d="M-34,12 Q-16,2 -4,14 T34,6" />
      <path d="M-30,-34 Q-22,-20 -8,-26 T10,-12" />
      <path d="M-22,-42 Q2,-46 22,-40" />
      <path d="M38,-24 Q44,0 44,14" />
    </g>
    <ellipse cx="14" cy="-40" rx="17" ry="5.2" fill="url(#goldMetal)" stroke={gold.deep} strokeWidth="1.5" />
    <ellipse cx="14" cy="-40.5" rx="11.5" ry="3.2" fill="none" stroke={gold.dark} strokeWidth="1" />
    <text y="-19" textAnchor="middle" fontFamily={font.title} fontSize="9.5" fill={gold.base}>
      The Engineer
    </text>
    {title.map((line, i) => (
      <text
        key={line}
        y={-6 + i * 8.5}
        textAnchor="middle"
        fontFamily={font.book}
        fontSize="7"
        fill={gold.light}
        opacity="0.9"
      >
        {line}
      </text>
    ))}
    <text y="28" textAnchor="middle" fontFamily={font.book} fontSize="6.5" fill={gold.base}>
      {date}
    </text>
  </g>
)

// The ten-year crystal stuffed in the hoodie pocket, sticking out of the side and catching the light now and then.
// Drawn about the pocket's opening.
export const PocketCrystal = ({ t }: { t: number }) => {
  const glint = Math.max(0, Math.sin(((t % 2.2) / 0.5) * Math.PI)) * (t % 2.2 < 0.5 ? 1 : 0)
  return (
    <g>
      <Crystal x={-4} y={20} scale={0.56} rotate={50} />
      {glint > 0 ? <Sparkle x={78} y={-52} size={16 * glint} fill="#fff" /> : null}
    </g>
  )
}

// Whether the crystal is in the pocket at `t`: from being pocketed in heaven to being packed in the leaving box.
export const pocketed = (t: number) => t >= 35.55 && t < 225.9

// The three patent cubes that fall on the Engineer in Act I, in the order they're thrown away.
export const patents = [
  { title: ["System and Method", "for Saying", "\u201cQuick Question\u201d"], date: "6/14/19" },
  { title: ["Flags That Hide", "Other Flags"], date: "3/2/22" },
  { title: ["Method of Juggling", "Patent Cubes"], date: "10/1/26" }
] as const
