import { type Place, placed } from "../paper"
import { ink } from "../theme"

const yellow = "#ffd23f"

// The Rubber Duck, who listens to every explanation and makes bugs vanish by turning up.
export const Duck = ({ nightcap, bowtie, ...place }: Place & { nightcap?: boolean; bowtie?: boolean }) => (
  <g transform={placed(place)}>
    <ellipse cx="0" cy="0" rx="62" ry="8" fill="#000" opacity="0.18" />
    <path
      d="M-62,-34 Q-86,-64 -74,-82 Q-60,-62 -48,-52 Z"
      fill={yellow}
      stroke={ink}
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <path
      d="M-64,-12 Q-74,-62 -32,-72 Q8,-80 30,-64 Q62,-62 72,-40 Q76,-10 40,-2 L-40,-2 Q-64,-2 -64,-12 Z"
      fill={yellow}
      stroke={ink}
      strokeWidth="3"
    />
    <path d="M-24,-48 Q8,-68 32,-42 Q4,-28 -24,-48 Z" fill="#ffe27a" stroke={ink} strokeWidth="2.5" />
    <path d="M-60,-22 Q0,-4 66,-26 L64,-10 Q0,6 -58,-10 Z" fill="url(#hatch)" opacity="0.2" />
    <g transform="rotate(26 22 -64)">
      <circle cx="26" cy="-100" r="36" fill={yellow} stroke={ink} strokeWidth="3" />
      <ellipse cx="12" cy="-116" rx="12" ry="7" transform="rotate(-25 12 -116)" fill="#fff" opacity="0.6" />
      <path
        d="M52,-104 Q86,-110 96,-96 Q86,-82 54,-86 Z"
        fill="#ff8c1a"
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M58,-94 Q76,-94 90,-95" stroke={ink} strokeWidth="2" />
      <circle cx="36" cy="-106" r="7" fill="#fff" stroke={ink} strokeWidth="2" />
      <circle cx="38" cy="-105" r="4" fill={ink} />
      <path
        d="M28.5,-107 A7.5,7.5 0 0 1 43.5,-107 Z"
        fill={yellow}
        stroke={ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M26,-124 Q36,-132 46,-123" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      {nightcap ? (
        <g>
          <path
            d="M-8,-118 Q20,-150 54,-124 Q30,-170 -30,-150 Q-46,-140 -48,-126 Z"
            fill="#3f6fb5"
            stroke={ink}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <circle cx="-50" cy="-124" r="9" fill="#fff" stroke={ink} strokeWidth="2" />
        </g>
      ) : null}
    </g>
    {bowtie ? (
      <path
        d="M26,-62 L10,-72 L10,-52 Z M26,-62 L42,-72 L42,-52 Z"
        fill="#b3202a"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    ) : null}
  </g>
)
