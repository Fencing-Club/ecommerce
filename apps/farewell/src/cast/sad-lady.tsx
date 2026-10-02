import { gold, ink } from "../theme"

const hair = "#1e1a1d"
const skin = "#b8774f"

// Sad Lady, who appears in her cameo whenever anything goes wrong, worrying about it in a thought bubble.
export const SadLady = ({
  x,
  y,
  scale = 1,
  mood = "sad"
}: {
  x: number
  y: number
  scale?: number
  mood?: "sad" | "happy"
}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <defs>
      <clipPath id="cameo">
        <circle r="100" />
      </clipPath>
    </defs>
    <circle r="114" fill="url(#goldMetal)" stroke={gold.deep} strokeWidth="4" filter="url(#cut)" />
    <circle r="104" fill="none" stroke={gold.light} strokeWidth="2" />
    <circle r="100" fill="#a8dbd2" stroke={ink} strokeWidth="2.5" />
    <g clipPath="url(#cameo)">
      <path d="M-46,-50 Q-82,-10 -74,64 Q-60,110 -10,110 L34,110 Q46,40 34,-14 Q20,-62 -46,-50 Z" fill={hair} />
      <path d="M-90,120 Q-80,44 -26,34 Q20,28 54,46 Q78,62 82,120 Z" fill="#ef6b7c" stroke={ink} strokeWidth="2.5" />
      <rect x="-18" y="2" width="22" height="34" fill={skin} stroke={ink} strokeWidth="2" />
      <circle cx="-8" cy="-18" r="36" fill={skin} stroke={ink} strokeWidth="2.5" />
      <path d="M-46,-26 Q-46,-62 -6,-60 Q30,-58 32,-28 Q4,-46 -46,-26 Z" fill={hair} />
      <path d="M-46,-26 Q-58,10 -44,40 L-36,4 Z" fill={hair} />
      <circle cx="-40" cy="-6" r="5" fill="#e8344e" stroke={ink} strokeWidth="1.5" />
      <path d="M-27,-31 L-11,-38 M7,-40 L22,-33" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <circle cx="-15" cy="-24" r="3.5" fill={ink} />
      <circle cx="14" cy="-26" r="3.5" fill={ink} />
      <path d="M-11,6 Q-2,-2 7,6" stroke="#5a1414" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
    <circle cx="38" cy="-68" r="5" fill="#fff" stroke={ink} strokeWidth="2" />
    <circle cx="54" cy="-88" r="8" fill="#fff" stroke={ink} strokeWidth="2" />
    <g transform="translate(96 -126)">
      <path
        d="M-44,10 Q-56,-12 -34,-24 Q-30,-46 -6,-44 Q10,-60 30,-44 Q54,-46 54,-22 Q70,-2 48,14 Q44,34 18,30 Q0,44 -18,30 Q-46,34 -44,10 Z"
        fill="#fff"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="-6" r="24" fill="#cfe2f5" stroke="#6b8fb5" strokeWidth="2.5" />
      <circle cx="-2" cy="-12" r="3" fill="#3b5f86" />
      <circle cx="14" cy="-12" r="3" fill="#3b5f86" />
      <path
        d={mood === "sad" ? "M-4,6 Q6,-2 16,6" : "M-4,0 Q6,10 16,0"}
        stroke="#3b5f86"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  </g>
)
