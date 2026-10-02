import { type ReactNode, useContext } from "react"
import { PocketCrystal, pocketed } from "../awards"
import { type Place, placed } from "../paper"
import { Song } from "../song"
import { ink, skin } from "../theme"
import { voiceAt } from "../voice"
import { armSwing, bodyLean, engineerLegs, type Stride } from "../walk"
import { Arm, Eyes, Legs, type Mouth, MouthShape } from "./parts"

const hoodie = "#30323b"
const hoodieDark = "#22242b"
const rib = "#4a4d5a"
const atom = "#61dafb"
const denim = "#3f629f"
const turnup = "#86a5d6"
const stitch = "#e2a75a"
const trainer = "#f4f2ec"
const sole = "#9a9ca3"
const headsetBlack = "#25262b"
const headsetSheen = "#74757e"
const hair = "#6b4423"
const bamboo = "#d6a65e"
const bambooNode = "#8e5d26"

// The blue badge on its lanyard clip, drawn about the clip.
export const Badge = () => (
  <g>
    <rect x="-5" y="-6" width="10" height="9" rx="2" fill="#9aa3ad" stroke={ink} strokeWidth="2" />
    <rect x="-17" y="2" width="34" height="46" rx="3" fill="#fbfbf7" stroke={ink} strokeWidth="2.5" />
    <rect x="-17" y="2" width="34" height="11" rx="3" fill="#0f6cbd" stroke={ink} strokeWidth="2" />
    <rect x="-12" y="17" width="13" height="15" fill="#cdd6e0" stroke={ink} strokeWidth="1.5" />
    <circle cx="-5.5" cy="22" r="3.4" fill="#7c8a99" />
    <path d="M-11,32 Q-5.5,25 0,32 Z" fill="#7c8a99" />
    <path d="M4,19 H13 M4,24 H11 M4,29 H13" stroke="#8b96a3" strokeWidth="2" />
    <path
      d="M-12,38 V44 M-9,38 V44 M-5,38 V44 M-3,38 V44 M1,38 V44 M5,38 V44 M7,38 V44 M11,38 V44"
      stroke={ink}
      strokeWidth="1.3"
    />
  </g>
)

// A bamboo cane with a crook handle, drawn about the hand gripping it `grip` of the way from the crook to the tip.
export const Cane = ({ grip = 0 }: { grip?: number }) => {
  const top = -14 - grip * 160
  const line = `M28,${top + 12} V${top} A14,14 0 0 0 0,${top} V${top + 212}`
  return (
    <g>
      <path d={line} fill="none" stroke={ink} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line} fill="none" stroke={bamboo} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {[56, 112, 168].map((y) => (
        <path key={y} d={`M-4,${top + y} H4`} stroke={bambooNode} strokeWidth="2.5" />
      ))}
      <path d={`M-1.4,${top + 8} V${top + 198}`} stroke="#f7e3b4" strokeWidth="1.5" opacity="0.8" />
      <path d={`M0,${top + 203} V${top + 212}`} stroke="#2a2522" strokeWidth="6" strokeLinecap="round" />
    </g>
  )
}

// Over-ear headphones, worn.
const Headset = () => {
  const band = "M-48,-362 C-52,-432 52,-432 48,-362"
  return (
    <g>
      <path d={band} fill="none" stroke={ink} strokeWidth="12" strokeLinecap="round" />
      <path d={band} fill="none" stroke={headsetBlack} strokeWidth="7" strokeLinecap="round" />
      <path d="M-28,-406 Q0,-420 28,-406" fill="none" stroke={headsetSheen} strokeWidth="2" strokeLinecap="round" />
      {[-1, 1].map((side) => (
        <g key={side}>
          <ellipse cx={side * 41} cy="-352" rx="6" ry="18" fill="#3a3b42" stroke={ink} strokeWidth="2" />
          <rect
            x={side * 50 - 10}
            y="-374"
            width="20"
            height="44"
            rx="10"
            fill={headsetBlack}
            stroke={ink}
            strokeWidth="3"
          />
          <path d={`M${side * 55},-364 V-342`} stroke={headsetSheen} strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
    </g>
  )
}

// The same headphones, pushed down round the neck.
const HeadsetDown = () => {
  const band = "M-36,-316 Q0,-280 36,-316"
  return (
    <g>
      <path d={band} fill="none" stroke={ink} strokeWidth="12" strokeLinecap="round" />
      <path d={band} fill="none" stroke={headsetBlack} strokeWidth="7" strokeLinecap="round" />
      {[-1, 1].map((side) => (
        <rect
          key={side}
          x={side * 40 - 11}
          y="-330"
          width="22"
          height="34"
          rx="11"
          transform={`rotate(${side * -18} ${side * 40} -313)`}
          fill={headsetBlack}
          stroke={ink}
          strokeWidth="3"
        />
      ))}
    </g>
  )
}

// The React atom printed on the hoodie, turned `spin` degrees, drawn about its middle.
export const Atom = ({ spin = 0 }: { spin?: number }) => (
  <g transform={`rotate(${spin})`} fill="none" stroke={atom} strokeWidth="3.6">
    {[0, 60, 120].map((turn) => (
      <ellipse key={turn} rx="27" ry="10.5" transform={`rotate(${turn})`} />
    ))}
    <circle r="5.2" fill={atom} stroke="none" />
  </g>
)

// A laurel wreath, leaves swept back from the brow.
const Laurels = () => (
  <g fill="#8fae3e" stroke={ink} strokeWidth="1.5">
    {[200, 213, 226, 239, 252, 288, 301, 314, 327, 340].map((angle) => {
      const radians = (angle * Math.PI) / 180
      const side = angle < 270 ? -1 : 1
      return (
        <ellipse
          key={angle}
          cx={44 * Math.cos(radians)}
          cy={-358 + 44 * Math.sin(radians)}
          rx="10"
          ry="4.6"
          transform={`rotate(${angle + 90 + side * 28} ${44 * Math.cos(radians)} ${-358 + 44 * Math.sin(radians)})`}
        />
      )
    })}
  </g>
)

// A striped nightcap for the night shift, flopping over to one side.
const Nightcap = () => (
  <g strokeLinejoin="round">
    <path
      d="M-42,-372 Q-36,-422 6,-430 Q54,-434 82,-388 Q62,-404 40,-398 Q46,-384 42,-372 Q0,-388 -42,-372 Z"
      fill="#c8323a"
      stroke={ink}
      strokeWidth="2.5"
    />
    <path
      d="M-30,-382 Q-24,-410 -8,-422 M-6,-381 Q2,-410 24,-426 M18,-381 Q28,-404 54,-414"
      fill="none"
      stroke="#fff4e0"
      strokeWidth="5"
    />
    <path d="M-44,-372 Q0,-390 44,-372" fill="none" stroke={ink} strokeWidth="12" strokeLinecap="round" />
    <path d="M-44,-372 Q0,-390 44,-372" fill="none" stroke="#fff4e0" strokeWidth="7" strokeLinecap="round" />
    <circle cx="84" cy="-386" r="9.5" fill="#fff4e0" stroke={ink} strokeWidth="2" />
  </g>
)

export type EngineerPose = {
  // Swing away from the body at each shoulder and bend at each elbow, in degrees; 0 hangs straight down.
  armL?: number
  elbowL?: number
  armR?: number
  elbowR?: number
  // Kick at each hip, in degrees.
  legL?: number
  legR?: number
  // Walking, from `walk`: the legs bent to their footfalls in place of legL and legR, the body leaning and the arms
  // swinging as they go.
  stride?: Stride
  mouth?: Mouth
  look?: { x: number; y: number }
  tilt?: number
  badge?: boolean
  openL?: boolean
  openR?: boolean
  // Whatever each hand holds, kept upright and drawn about the palm.
  holdL?: ReactNode
  holdR?: ReactNode
  // Something carried in front of the body, under the arms, drawn about the waist.
  carry?: ReactNode
  // The cane in one hand, `angle` degrees from pointing straight down (positive swings it out to that side), held
  // `grip` of the way from the crook to the tip: 0 to lean on, 0.5 to twirl, 1 to reach with the crook. Or hooked on
  // the hood behind the neck, out of the way.
  cane?: { hand: "left" | "right"; angle: number; grip?: number } | "hood"
  headset?: "on" | "neck" | "off"
  // Whatever is stuffed in the hoodie's pocket, drawn about its right-hand opening. Left out, it's the crystal whenever
  // the story has it pocketed; null empties it.
  pocket?: ReactNode
  // Costume over the hoodie: a toga and laurels for Rome, a nightcap for the night shift, the hood up to leave.
  dress?: "toga" | "nightcap" | "hood"
  // Whatever is on the chest in place of the React atom, drawn about the middle of the print.
  chest?: ReactNode
}

// The Engineer, on the way out: a black React hoodie, jeans and trainers, a headset, the badge on a reel at the hip
// and a cane to make a point with.
export const Engineer = ({ pose = {}, ...place }: Place & { pose?: EngineerPose }) => {
  const {
    armL: restL = 10,
    elbowL = 12,
    armR: restR = 10,
    elbowR = 12,
    legL = 0,
    legR = 0,
    stride,
    mouth = "smile",
    look = { x: 0, y: 0 },
    tilt = 0,
    badge = true,
    openL,
    openR,
    holdL,
    holdR,
    carry,
    cane,
    headset = "on",
    pocket,
    dress,
    chest
  } = pose
  const armL = armSwing(restL, stride)
  const armR = armSwing(restR, stride)
  const upper = bodyLean(engineerLegs, stride)
  // The Engineer is the lead: whenever the vocal is going, the mouth sings it.
  const song = useContext(Song)
  const stowed = pocket === undefined && song !== undefined && pocketed(song) ? <PocketCrystal t={song} /> : pocket
  // The cane in a hand, turned back against the arm's swing so it keeps its `angle` wherever the arm goes.
  const caneIn = (side: -1 | 1, swing: number, bend: number) =>
    typeof cane === "object" && (cane.hand === "left" ? -1 : 1) === side ? (
      <g transform={`rotate(${-side * (cane.angle - swing - bend)} 0 10) translate(0 10) scale(${side} 1)`}>
        <Cane grip={cane.grip} />
      </g>
    ) : null
  return (
    <g transform={placed(place)}>
      {cane === "hood" ? (
        <g transform={upper}>
          <g transform="translate(-30 -322) rotate(-21)">
            <Cane />
          </g>
        </g>
      ) : null}
      <Legs
        build={engineerLegs}
        swingL={legL}
        swingR={legR}
        stride={stride}
        trousers={denim}
        shoe={trainer}
        seam={stitch}
        turnup={turnup}
        sole={sole}
      />
      <g transform={upper}>
        <path
          d="M-54,-298 Q-64,-244 -58,-176 L-57,-158 L57,-158 L58,-176 Q64,-244 54,-298 Q28,-318 0,-318 Q-28,-318 -54,-298 Z"
          fill={hoodie}
          stroke={ink}
          strokeWidth="3"
        />
        <path d="M28,-310 Q56,-298 60,-246 L58,-176 L36,-176 Z" fill="url(#hatch)" opacity="0.3" />
        <g transform="translate(0 -246)">{chest ?? <Atom />}</g>
        {stowed ? <g transform="translate(34 -200)">{stowed}</g> : null}
        <path
          d="M-41,-180 Q-36,-200 -27,-216 H27 Q36,-200 41,-180 Z"
          fill={hoodie}
          stroke={ink}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M-24,-211 H24" stroke={rib} strokeWidth="1.5" strokeDasharray="3 3" />
        <path
          d="M-58,-176 H58 L57,-158 H-57 Z"
          fill={hoodieDark}
          stroke={ink}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {[-48, -36, -24, -12, 0, 12, 24, 36, 48].map((x) => (
          <path key={x} d={`M${x},-173 V-161`} stroke={rib} strokeWidth="1.5" />
        ))}
        {dress === "toga" ? (
          <g>
            <path
              d="M-54,-294 L-30,-318 Q19,-252 61,-198 L58,-158 L24,-158 Q-7,-226 -54,-294 Z"
              fill="#f6f1e4"
              stroke={ink}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path
              d="M-33,-298 Q5,-236 37,-170 M-19,-310 Q19,-250 50,-186"
              fill="none"
              stroke="#cdbf9f"
              strokeWidth="2"
            />
          </g>
        ) : null}
        <path
          d="M-46,-300 Q-52,-336 -22,-347 Q0,-352 22,-347 Q52,-336 46,-300 Q24,-318 0,-318 Q-24,-318 -46,-300 Z"
          fill={hoodieDark}
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M-26,-318 Q-14,-300 0,-292 Q14,-300 26,-318 Q0,-326 -26,-318 Z" fill="#17181d" />
        <path d="M-11,-338 V-308 Q0,-301 11,-308 V-338 Z" fill={skin.shade} stroke={ink} strokeWidth="2.5" />
        <path
          d="M-28,-319 Q-15,-300 1,-291 M28,-319 Q15,-300 -1,-291"
          fill="none"
          stroke={ink}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M-28,-319 Q-15,-300 1,-291 M28,-319 Q15,-300 -1,-291"
          fill="none"
          stroke={hoodie}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {[-1, 1].map((side) => (
          <g key={side}>
            <path
              d={`M${side * 11},-298 Q${side * 14},-290 ${side * 12},-282`}
              fill="none"
              stroke="#e1e2e7"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path d={`M${side * 12},-283 V-277`} stroke="#9a9ca3" strokeWidth="4" strokeLinecap="round" />
          </g>
        ))}
        <circle cx="40" cy="-166" r="7.5" fill="#c9cdd4" stroke={ink} strokeWidth="2" />
        <circle cx="40" cy="-166" r="2.5" fill="#7b818b" />
        {badge ? (
          <g>
            <path d="M40,-159 L41,-150" stroke="#3b3b3b" strokeWidth="1.5" />
            <g transform="translate(41 -146) rotate(-5)">
              <Badge />
            </g>
          </g>
        ) : null}
        <g transform={`rotate(${tilt} 0 -334)`}>
          {dress === "hood" ? (
            <path
              d="M-56,-318 Q-66,-416 0,-426 Q66,-416 56,-318 Q30,-304 0,-304 Q-30,-304 -56,-318 Z"
              fill={hoodieDark}
              stroke={ink}
              strokeWidth="3"
            />
          ) : null}
          <circle cx="-41" cy="-354" r="9" fill={skin.base} stroke={ink} strokeWidth="2.5" />
          <circle cx="41" cy="-354" r="9" fill={skin.base} stroke={ink} strokeWidth="2.5" />
          <circle cx="0" cy="-356" r="42" fill={skin.base} stroke={ink} strokeWidth="3" />
          <path d="M18,-392 Q46,-370 38,-330 Q30,-322 22,-326 Q38,-350 18,-392 Z" fill="url(#hatch)" opacity="0.3" />
          <path
            d="M-42,-366 Q-46,-340 -37,-332 L-34,-360 Z M42,-366 Q46,-340 37,-332 L34,-360 Z"
            fill="#6b4423"
            stroke={ink}
            strokeWidth="2"
          />
          <circle cx="-24" cy="-338" r="7.5" fill={skin.blush} opacity="0.45" />
          <circle cx="24" cy="-338" r="7.5" fill={skin.blush} opacity="0.45" />
          <Eyes x={0} y={-356} gap={30} r={4.8} look={look} white={false} />
          <g fill="rgba(255,255,255,0.18)" stroke={ink} strokeWidth="2.5">
            <circle cx="-15" cy="-356" r="12.5" />
            <circle cx="15" cy="-356" r="12.5" />
          </g>
          <path
            d="M-2.5,-358 Q0,-362 2.5,-358 M-27.5,-358 L-40,-361 M27.5,-358 L40,-361"
            stroke={ink}
            strokeWidth="2.5"
            fill="none"
          />
          <path
            d="M-25,-377 Q-15,-383 -5,-377 M5,-377 Q15,-383 25,-377"
            stroke={ink}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M1,-350 Q6,-340 -1,-336" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <MouthShape x={0} y={-326} mouth={mouth} size={0.9} voice={song === undefined ? undefined : voiceAt(song)} />
          {dress === "hood" ? (
            <g fill="none" strokeLinecap="round">
              <path d="M-40,-320 Q-54,-404 0,-410 Q54,-404 40,-320" stroke={ink} strokeWidth="14" />
              <path d="M-40,-320 Q-54,-404 0,-410 Q54,-404 40,-320" stroke={hoodie} strokeWidth="8.5" />
            </g>
          ) : (
            <path
              d="M-40,-366 Q-42,-404 0,-402 Q42,-404 40,-366 Q30,-386 0,-384 Q-30,-386 -40,-366 Z"
              fill={hair}
              stroke={ink}
              strokeWidth="2.5"
            />
          )}
          {headset === "on" ? <Headset /> : null}
          {dress === undefined || dress === "toga" ? (
            <path
              d="M-5,-404 Q-4,-428 15,-423 Q2,-417 6,-404 Z"
              fill={hair}
              stroke={ink}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ) : null}
          {dress === "toga" ? <Laurels /> : null}
          {dress === "nightcap" ? <Nightcap /> : null}
        </g>
        {headset === "neck" ? <HeadsetDown /> : null}
        {carry ? <g transform="translate(0 -200)">{carry}</g> : null}
        <Arm x={-51} y={-292} side={-1} swing={armL} bend={elbowL} sleeve={hoodie} cuff={rib} open={openL}>
          {holdL ? <g transform={`rotate(${-(armL + elbowL)} 0 10)`}>{holdL}</g> : null}
          {caneIn(-1, armL, elbowL)}
        </Arm>
        <Arm x={51} y={-292} side={1} swing={armR} bend={elbowR} sleeve={hoodie} cuff={rib} open={openR}>
          {holdR ? <g transform={`rotate(${armR + elbowR} 0 10)`}>{holdR}</g> : null}
          {caneIn(1, armR, elbowR)}
        </Arm>
      </g>
    </g>
  )
}
