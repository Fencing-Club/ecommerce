import type { ReactNode } from "react"
import { type Place, placed } from "../paper"
import { font, ink } from "../theme"
import { armSwing, bodyLean, onLegs, type Stride } from "../walk"
import { Arm, Eyes, Legs, type Mouth, MouthShape } from "./parts"

export const sdsLegs = onLegs(136, 28, 136)

// Two arrows chasing each other round a circle.
export const SyncArrows = ({ x, y, r, color = "#fff" }: { x: number; y: number; r: number; color?: string }) => (
  <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth={r * 0.24} fill="none" strokeLinecap="round">
    <path d={`M${-r},0 A${r},${r} 0 0 1 ${r * 0.7},${-r * 0.7}`} />
    <path d={`M${r},0 A${r},${r} 0 0 1 ${-r * 0.7},${r * 0.7}`} />
    <path
      d={`M${r * 0.7 - r * 0.45},${-r * 0.92} L${r * 0.78},${-r * 0.66} L${r * 0.52},${-r * 0.28}`}
      strokeLinejoin="round"
    />
    <path
      d={`M${-r * 0.7 + r * 0.45},${r * 0.92} L${-r * 0.78},${r * 0.66} L${-r * 0.52},${r * 0.28}`}
      strokeLinejoin="round"
    />
  </g>
)

// School Data Sync, the stagehand: a database in a flat cap, working the ropes so every scene changes in sync.
export const SchoolDataSync = ({
  armL = 20,
  armR = 20,
  elbowL = 20,
  elbowR = 20,
  legL = 0,
  legR = 0,
  stride,
  mouth = "smile",
  look = { x: 0, y: 0 },
  holdL,
  holdR,
  ...place
}: Place & {
  armL?: number
  armR?: number
  elbowL?: number
  elbowR?: number
  legL?: number
  legR?: number
  // Walking, from `walk`, in place of legL and legR.
  stride?: Stride
  mouth?: Mouth
  look?: { x: number; y: number }
  holdL?: ReactNode
  holdR?: ReactNode
}) => (
  <g transform={placed(place)}>
    <defs>
      <linearGradient id="dbSteel" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#24578d" />
        <stop offset="0.35" stopColor="#6fa8dc" />
        <stop offset="0.7" stopColor="#3a78b5" />
        <stop offset="1" stopColor="#1f4c7a" />
      </linearGradient>
    </defs>
    <Legs build={sdsLegs} swingL={legL} swingR={legR} stride={stride} trousers="#3d5a80" shoe="#3b2a1a" />
    <g transform={bodyLean(sdsLegs, stride)}>
      <path d="M-66,-316 V-140 A66,17 0 0 0 66,-140 V-316 Z" fill="url(#dbSteel)" stroke={ink} strokeWidth="3" />
      <path d="M-66,-246 A66,17 0 0 0 66,-246" fill="none" stroke={ink} strokeWidth="3" />
      <ellipse cx="0" cy="-316" rx="66" ry="17" fill="#9cc4ea" stroke={ink} strokeWidth="3" />
      <Eyes x={0} y={-282} gap={44} r={11} look={look} />
      <MouthShape x={0} y={-258} mouth={mouth} size={0.85} />
      <SyncArrows x={0} y={-214} r={12} />
      <rect x="-58" y="-200" width="116" height="54" rx="9" fill="#173a5e" stroke={ink} strokeWidth="2.5" />
      {["School", "Data Sync"].map((line, i) => (
        <text
          key={line}
          x="0"
          y={-177 + i * 23}
          textAnchor="middle"
          fontFamily={font.sans}
          fontWeight="700"
          fontSize="20"
          fill="#f4f8ff"
        >
          {line}
        </text>
      ))}
      <path
        d="M-62,-320 Q-58,-352 0,-354 Q58,-352 64,-322 Q0,-334 -62,-320 Z"
        fill="#7a5a3a"
        stroke={ink}
        strokeWidth="3"
      />
      <path
        d="M14,-326 Q62,-334 82,-316 Q52,-312 18,-314 Z"
        fill="#6b4c2f"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M-50,-334 Q0,-348 52,-336" stroke="#5a3f24" strokeWidth="2" fill="none" />
      <Arm x={-64} y={-286} side={-1} swing={armSwing(armL, stride)} bend={elbowL} sleeve="#c4532d" length={56}>
        {holdL ? <g transform={`rotate(${-(armSwing(armL, stride) + elbowL)} 0 10)`}>{holdL}</g> : null}
      </Arm>
      <Arm x={64} y={-286} side={1} swing={armSwing(armR, stride)} bend={elbowR} sleeve="#c4532d" length={56}>
        {holdR ? <g transform={`rotate(${armSwing(armR, stride) + elbowR} 0 10)`}>{holdR}</g> : null}
      </Arm>
    </g>
  </g>
)
