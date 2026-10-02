import { Easing } from "remotion"
import { cards } from "../acts"
import { ActivityCard, LoopBadge } from "../cast/activities"
import { Cardinal, Scroll } from "../cast/cardinal"
import { Clippy } from "../cast/clippy"
import { Eraser, MathCoach } from "../cast/coaches"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { Octocat } from "../cast/octocat"
import { Unicorn, unicornLegs } from "../cast/unicorn"
import { Skeleton } from "../cast/walk-ons"
import { Choir } from "../choir"
import { Biplane } from "../machines"
import { during, keys, mix, onTwos, ramp, settle, shake } from "../motion"
import { Door } from "../office"
import { Camera, Canvas, Cut } from "../paper"
import { Chalkboard, GoldStar, Pennant, Say, Token } from "../props"
import { Boardroom, Dungeon } from "../sets"
import { Spot, Theatre } from "../theatre"
import { chalkboard, font, gold, ink, paper, velvet, wood } from "../theme"
import { at, beats } from "../timeline"
import { walk } from "../walk"

// Act IV, Do Less: the Reorg nobody expected, then Speed and Urgency, a billion users, a thread of forty replies, a
// vote nobody wins, Math Coach's small change, and the oldest task in the backlog, down in the dungeon.

const yellowChalk = "#ffe27a"

// The goal as chalked, glyph by glyph, and the middle of each glyph's place on the board.
const goal = [..."1,000,000,000"]
const slots = goal.map(
  (glyph, i) =>
    34 + goal.slice(0, i).reduce((width, g) => width + (g === "," ? 23 : 51), 0) + (glyph === "," ? 11.5 : 25.5)
)

// Where chalk has been rubbed out: a pale cloud and the eraser's swipes through it.
const ChalkDust = ({ x }: { x: number }) => (
  <g stroke={chalkboard.line} strokeLinecap="round" fill="none">
    <ellipse cx={x} cy="166" rx="32" ry="40" fill={chalkboard.line} stroke="none" opacity="0.1" />
    <path
      d={`M${x - 30},146 q30,-9 60,0 M${x - 34},168 q34,-9 68,0 M${x - 28},190 q28,-9 56,0`}
      strokeWidth="7"
      opacity="0.2"
    />
  </g>
)

// A wooden crate stencilled PREVIEW, squashed by `squash` to get through a door.
const Crate = ({ x, y, squash }: { x: number; y: number; squash: number }) => (
  <g transform={`translate(${x} ${y}) scale(${1 - squash * 0.55} ${1 + squash * 0.35})`} filter="url(#cut)">
    <rect x="-150" y="-240" width="300" height="240" fill="#c99a5b" stroke={ink} strokeWidth="5" />
    <path d="M-150,-240 L150,0 M150,-240 L-150,0" stroke="#8a5a2a" strokeWidth="10" />
    <rect x="-150" y="-240" width="300" height="240" fill="none" stroke="#8a5a2a" strokeWidth="14" />
    <rect x="-110" y="-150" width="220" height="56" fill="#c99a5b" />
    <text y="-108" textAnchor="middle" fontFamily={font.poster} fontSize="44" fill={velvet.dark}>
      PREVIEW
    </text>
  </g>
)

const replies = [
  "+1",
  "Looping in @everyone",
  "Following",
  "Let\u2019s take this offline",
  "+1",
  "Any update?",
  "Thanks!",
  "+1",
  "Bumping this"
]

// The Teams thread, unrolled from the flies, replies landing one after another and the count running up to forty.
const Thread = ({ x, y, t, from }: { x: number; y: number; t: number; from: number }) => {
  const shown = Math.max(0, Math.min(replies.length, Math.floor((t - from) * 4)))
  const count = Math.min(40, Math.max(0, Math.floor((t - from) * 18)))
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#cut)">
      <rect x="-210" y="-60" width="420" height={90 + shown * 44} rx="10" fill="#fff" stroke={ink} strokeWidth="4" />
      <rect x="-210" y="-60" width="420" height="50" rx="10" fill="#5b5fc7" stroke={ink} strokeWidth="3" />
      <text x="-190" y="-26" fontFamily={font.sans} fontWeight="700" fontSize="22" fill="#fff">
        Quick sync about the sync
      </text>
      {replies.slice(0, shown).map((reply, i) => (
        <g key={`${reply}${i}`} transform={`translate(-190 ${10 + i * 44})`}>
          <circle
            cx="14"
            cy="8"
            r="14"
            fill={["#e9c46a", "#7fb3d5", "#e76f51", "#8ab17d"][i % 4]}
            stroke={ink}
            strokeWidth="2"
          />
          <text x="40" y="16" fontFamily={font.sans} fontSize="21" fill={ink}>
            {reply}
          </text>
        </g>
      ))}
      <text x="-190" y={60 + shown * 44} fontFamily={font.sans} fontWeight="700" fontSize="21" fill="#5b5fc7">
        {count} replies
      </text>
    </g>
  )
}

const options = ["A. Ship it", "B. Don\u2019t ship it", "C. Ship it later", "D. Take it offline"]

// Quiz, by Loop: "What did we decide?", the votes coming in dead even.
const Vote = ({ x, y, votes }: { x: number; y: number; votes: number }) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <rect x="-300" y="-170" width="600" height="340" rx="14" fill="#fff" stroke={ink} strokeWidth="4" />
    <rect x="-300" y="-170" width="600" height="56" rx="14" fill="#7b61ff" stroke={ink} strokeWidth="3" />
    <text x="-276" y="-132" fontFamily={font.sans} fontWeight="700" fontSize="26" fill="#fff">
      Quiz: What did we decide?
    </text>
    <LoopBadge x={268} y={-142} size={1} />
    {options.map((option, i) => (
      <g key={option} transform={`translate(-276 ${-84 + i * 62})`}>
        <rect width="552" height="48" rx="8" fill="#f1effa" stroke={ink} strokeWidth="2" />
        <rect width={552 * 0.25 * votes} height="48" rx="8" fill="#c9bfff" />
        <text x="16" y="32" fontFamily={font.sans} fontSize="22" fill={ink}>
          {option}
        </text>
        <text x="536" y="32" textAnchor="end" fontFamily={font.sans} fontWeight="700" fontSize="22" fill={ink}>
          {Math.round(25 * votes)}%
        </text>
      </g>
    ))}
  </g>
)

// A big question mark popping up over someone's head.
const Huh = ({ x, y, pop }: { x: number; y: number; pop: number }) => (
  <g transform={`translate(${x} ${y}) scale(${pop})`}>
    <text textAnchor="middle" fontFamily={font.poster} fontSize="90" fill={gold.light} stroke={ink} strokeWidth="3">
      ?
    </text>
  </g>
)

// The wooden stair down into the backlog, from a trapdoor up in the wings at the left to the dungeon floor.
const stair = { x: 120, y: 260, run: 70, rise: 64, steps: 10 }

// Where a foot is, going down the stair at x: on a tread, stepping down off its edge, then on the floor.
const tread = (x: number) => {
  const p = (x - stair.x - 35) / stair.run
  const step = Math.floor(p)
  const down = Math.min(1, Math.max(0, (p - step - 0.55) / 0.45))
  return Math.min(898, stair.y + 2 + stair.rise * (step + down))
}

// The top of whichever tread a foot lands on at x, or the floor beyond the stair.
const footing = (x: number) => Math.min(898, stair.y + stair.rise * Math.floor((x - stair.x - 50) / stair.run))

const Stairs = () => (
  <g filter="url(#cut)" strokeLinejoin="round">
    <path
      d={`M${stair.x + 20},${stair.y - 90} L${stair.x + 20 + 9 * stair.run},${stair.y - 90 + 9 * stair.rise}`}
      stroke={wood.dark}
      strokeWidth="10"
      strokeLinecap="round"
    />
    {[3, 6, 9].map((i) => (
      <path
        key={i}
        d={`M${stair.x + 20 + i * stair.run},${stair.y + i * stair.rise} v-90`}
        stroke={wood.dark}
        strokeWidth="8"
      />
    ))}
    {Array.from({ length: stair.steps }, (_, i) => {
      const x = stair.x + i * stair.run
      const y = stair.y + i * stair.rise
      return (
        <g key={i}>
          <rect x={x} y={y} width="120" height={stair.rise} fill={wood.base} stroke={ink} strokeWidth="3" />
          <path
            d={`M${x + 8},${y + 32} H${x + 112} M${x + 8},${y + 48} H${x + 112}`}
            stroke={wood.dark}
            strokeWidth="2"
          />
          <rect x={x - 4} y={y - 4} width="128" height="14" rx="3" fill={wood.light} stroke={ink} strokeWidth="2.5" />
        </g>
      )
    })}
  </g>
)

// The work item from the bottom of the backlog: eight years old and still Active.
const Task = ({ x, y, crumble }: { x: number; y: number; crumble: number }) => (
  <g transform={`translate(${x} ${y})`} opacity={1 - crumble}>
    <g filter="url(#cut)" transform={`translate(0 ${crumble * 60}) scale(${1 - crumble * 0.3})`}>
      <rect x="-170" y="-110" width="340" height="220" fill="#f3ecd8" stroke={ink} strokeWidth="4" />
      <rect x="-170" y="-110" width="12" height="220" fill="#e8a33d" />
      <text x="-140" y="-64" fontFamily={font.sans} fontWeight="700" fontSize="28" fill={ink}>
        Update README
      </text>
      <text x="-140" y="-20" fontFamily={font.sans} fontSize="20" fill="#5a5a5a">
        Created: 2018
      </text>
      <text x="-140" y="14" fontFamily={font.sans} fontSize="20" fill="#5a5a5a">
        State: Active
      </text>
      <text x="-140" y="48" fontFamily={font.sans} fontSize="20" fill="#5a5a5a">
        Assigned to: nobody
      </text>
      <path d="M-170,-110 L-120,-60 M170,-110 L120,-70 M-170,110 L-110,70" stroke="#c9c2b0" strokeWidth="1.5" />
    </g>
    {crumble > 0
      ? Array.from({ length: 16 }, (_, i) => (
          <circle
            key={i}
            cx={-160 + i * 21}
            cy={110 + crumble * (40 + (i % 4) * 30)}
            r={5}
            fill="#c9c2b0"
            opacity={1 - crumble}
          />
        ))
      : null}
  </g>
)

export const Act4 = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const speed = during(t, at("preview"), at("thread"))
  const motion = speed ? t : s
  const b = beats(motion)
  const dungeon = t >= 158.4
  const descend = ramp(t, 157.6, 158.6, Easing.inOut(Easing.cubic))
  const octocatX = mix(170, 1000, ramp(t, 159, 161.4, Easing.linear))
  const octocatGoing = ramp(t, 159, 159.15) * (1 - ramp(t, 161.25, 161.4))
  // Down the stair one foot past the other, a tread a step, and onto the dungeon floor.
  const descent = walk(t, {
    from: 158.9,
    to: 162.2,
    x0: stair.x + 85,
    x1: stair.x + 85 + stair.steps * stair.run,
    steps: 11,
    scale: 0.74,
    lift: 40,
    lean: 0,
    ground: footing
  })

  const camera = {
    scale: keys(t, [
      [153.7, 1],
      [154.2, 1.25],
      [157.2, 1.25],
      [157.6, 1]
    ]),
    x: keys(t, [
      [153.7, 960],
      [154.2, 1000],
      [157.2, 1000],
      [157.6, 960]
    ]),
    y: keys(t, [
      [153.7, 540],
      [154.2, 470],
      [157.2, 470],
      [157.6, 540]
    ])
  }

  // The Reorg, then everyone lies down on Do Less, then Speed and Urgency.
  const door = ramp(s, 137.7, 137.9, Easing.out(Easing.back(2)))
  const cardinals = settle(s, 137.75, 10, 200)
  const lieDown = ramp(s, 139, 139.3) * (1 - ramp(t, 139.45, 139.6))
  const shuffle = during(t, 138.4, 139.3)
  // Speed and Urgency: running on the spot, behind the crate all the way across, then on the spot again.
  const dash = walk(t, {
    from: at("preview"),
    to: at("thread"),
    x0: 560,
    x1: 1150,
    steps: 8,
    before: 3,
    after: 6,
    gait: "run"
  })
  const squeeze = ramp(t, 141.2, 141.5) * (1 - ramp(t, 141.66, 141.8))

  // A billion users and a thread; then the vote. The Unicorn's halves run in out of step, front leg with back leg.
  const unicornIn = (lead: -1 | 1) =>
    walk(t, {
      from: 142.8,
      to: 144.3,
      x0: 1950,
      x1: 1420,
      steps: 10,
      gait: "run",
      scale: 0.6,
      build: unicornLegs,
      profile: 1,
      flip: true,
      lead
    })
  const unicornFront = unicornIn(1)
  const unicornBack = unicornIn(-1)
  const votes = ramp(t, 146.4, 147.8)
  const huh = (k: number) => settle(t, 148.4 + k * 0.12, 9, 220)

  // Quick question: Math Coach rubs out zeros slowly; the clock spins and cobwebs grow.
  const rubbed = Math.min(3, Math.max(0, Math.floor((t - 151.94) / 0.55)))
  // How many glyphs of the goal are still written: the last three zeros go one by one, the last with its comma.
  const written = [13, 12, 11, 9][rubbed] ?? 9
  const eight = t >= 155
  const cobweb = ramp(t, 151.9, 153.6)
  const star = settle(t, 156.24, 9, 220)

  const card = cards.act4 && { ...cards.act4, scrawl: t >= 139.6 ? ["Speed and", "Urgency"] : undefined }
  const engineerX = (() => {
    if (speed) {
      return dash.x
    }
    return t < at("thread") ? 560 : 610
  })()

  let pose: EngineerPose = { armR: 40, cane: { hand: "right", angle: 12 }, mouth: "flat", look: { x: 0.6, y: 0 } }
  if (t < 137.7) {
    pose = {
      armR: 10,
      armL: 10,
      elbowL: 80,
      elbowR: 80,
      cane: { hand: "right", angle: 4, grip: 0 },
      mouth: "flat",
      look: { x: 0.8, y: 0 }
    }
  } else if (t < at("preview")) {
    pose = {
      armL: 120,
      elbowL: 40,
      armR: 120,
      elbowR: 40,
      openL: true,
      openR: true,
      cane: "hood",
      mouth: "o",
      look: { x: 1, y: -0.2 }
    }
  } else if (speed) {
    pose = {
      armL: 70,
      elbowL: 30,
      armR: 70,
      elbowR: 30,
      openL: true,
      openR: true,
      cane: "hood",
      stride: dash.stride,
      mouth: "grin",
      look: { x: 1, y: 0 }
    }
  } else if (t < at("quickQuestion")) {
    const question = t >= 148.4
    pose = {
      armR: question ? 165 : 40,
      elbowR: question ? 0 : 20,
      cane: { hand: "right", angle: question ? 0 : 12, grip: question ? 0.55 : 0 },
      armL: 20,
      mouth: question ? "o" : "flat",
      look: { x: 0.4, y: -0.4 }
    }
  } else if (t < at("ado")) {
    const pointing = t >= 155.2
    pose = {
      armR: pointing ? 100 : 20,
      elbowR: pointing ? -10 : 10,
      cane: { hand: "right", angle: pointing ? 110 : 3, grip: pointing ? 0.6 : 0 },
      armL: pointing ? 20 : 30,
      elbowL: pointing ? 10 : 90,
      mouth: "flat",
      look: pointing ? { x: 0, y: 0.2 } : { x: 0.8, y: -0.2 },
      tilt: cobweb > 0 && !pointing ? 6 : 0
    }
  } else {
    const tapping = Math.sin(Math.PI * b)
    pose = {
      armR: 50 + tapping * 10,
      elbowR: 10,
      cane: { hand: "right", angle: 20 + tapping * 14, grip: 0.1 },
      armL: 30,
      mouth: "o",
      look: { x: 1, y: 0.2 }
    }
  }
  const prod = ramp(s, 164.8, 165) * (1 - ramp(s, 165.1, 165.3))
  if (t >= 164.6) {
    pose = { ...pose, armR: 90 + prod * 10, cane: { hand: "right", angle: 90 + prod * 6, grip: 0.9 } }
  }

  return (
    <Canvas>
      <Camera scale={camera.scale} look={{ x: camera.x, y: camera.y }}>
        <Theatre
          card={card}
          boxes={{ left: <Choir t={t} side="left" mood="watch" />, right: <Choir t={t} side="right" mood="watch" /> }}
          backdrop={
            <g>
              <g transform={`translate(0 ${-descend * 800})`}>
                <Boardroom clock={t < 151.9 ? 0 : (t - 151.9) * 3} />
              </g>
              {descend > 0 ? (
                <g transform={`translate(0 ${(1 - descend) * 800})`}>
                  <Dungeon t={t} />
                </g>
              ) : null}
            </g>
          }
          stage={
            <g>
              {!dungeon ? (
                <g transform={`translate(0 ${-descend * 800})`}>
                  {t < at("thread") ? <Door x={1150} y={898} open={door} label="Meeting Room" /> : null}
                  {during(t, 139.4, 145) ? (
                    <Biplane
                      x={mix(1480, -200, ramp(t, 139.4, 145, Easing.linear))}
                      y={330 + Math.sin(t * 3) * 8}
                      scale={0.85}
                      banner={["RTO IS THE WAY TO GO"]}
                    />
                  ) : null}
                  {during(t, 140, 145.4) ? (
                    <Biplane
                      x={mix(1480, -100, ramp(t, 140, 145.4, Easing.linear))}
                      y={440}
                      scale={0.6}
                      banner={["(3 DAYS A WEEK)"]}
                    />
                  ) : null}
                  {during(t, 137.7, at("thread")) ? (
                    <Cut>
                      {[0, 1, 2].map((k) => (
                        <Cardinal
                          key={k}
                          x={mix(1150, 820 + k * 200, cardinals) + (speed ? Math.sin(t * 30 + k) * 10 : 0)}
                          y={898 + (speed ? -Math.abs(Math.sin(t * 15 + k)) * 30 : 0)}
                          scale={0.78}
                          flip={k === 0}
                          armL={shuffle ? 110 + Math.sin(t * 20 + k) * 20 : 150}
                          armR={shuffle ? 110 : 30}
                          mouth="o"
                          look={{ x: k === 0 ? -1 : 0, y: -0.2 }}
                          holdR={k === 1 && !shuffle ? <Scroll text="New Org Chart" /> : undefined}
                          rotate={lieDown * (k % 2 === 0 ? -86 : 86)}
                        />
                      ))}
                    </Cut>
                  ) : null}
                  {shuffle ? (
                    <g>
                      {Array.from({ length: 8 }, (_, i) => {
                        const u = ((t - 138.4) * 2.6 + i / 8) % 1
                        return (
                          <g
                            key={i}
                            transform={`translate(${mix(900, 1220, u)} ${560 - Math.sin(u * Math.PI) * 140}) rotate(${u * 360})`}
                          >
                            <rect
                              x="-26"
                              y="-36"
                              width="52"
                              height="72"
                              rx="5"
                              fill={paper.light}
                              stroke={ink}
                              strokeWidth="2"
                            />
                            <rect x="-14" y="-20" width="28" height="18" fill="#9aa3ad" />
                          </g>
                        )
                      })}
                    </g>
                  ) : null}
                  {speed ? (
                    <g transform={`translate(${dash.x + shake(t, 3)} 898)`}>
                      <Crate x={160} y={0} squash={squeeze} />
                    </g>
                  ) : null}
                  {t >= at("thread") && t < at("quickQuestion") ? (
                    <g>
                      {t < at("howOrWhy") + 0.4 ? (
                        <g
                          transform={`translate(0 ${(1 - settle(t, 143, 12, 120)) * -700 - ramp(t, at("howOrWhy") - 0.1, at("howOrWhy") + 0.4, Easing.in(Easing.cubic)) * 900})`}
                        >
                          <path d="M860,130 V200" stroke={ink} strokeWidth="2" />
                          <Thread x={860} y={260} t={t} from={143.4} />
                        </g>
                      ) : null}
                      <Cut>
                        <Unicorn
                          x={unicornFront.x}
                          y={unicornFront.y}
                          scale={0.6}
                          flip
                          strides={{ front: unicornFront.stride, back: unicornBack.stride }}
                          carrying={<Pennant text="1 Billion Users!" droop={30} mirrored />}
                        />
                      </Cut>
                      {t >= at("howOrWhy") ? (
                        <g>
                          <g transform={`translate(0 ${(1 - settle(t, at("howOrWhy"), 11, 160)) * 700})`}>
                            <Vote x={980} y={430} votes={votes} />
                          </g>
                          <Cut>
                            <ActivityCard kind="quiz" x={1240} y={898} scale={0.7} armL={150} armR={60} mouth="o" />
                          </Cut>
                          {[
                            { x: engineerX, y: 545 },
                            { x: 1240, y: 600 },
                            { x: 1420, y: 520 },
                            { x: 1560, y: 600 }
                          ].map((h, k) => (
                            <Huh key={h.x} x={h.x} y={h.y} pop={huh(k)} />
                          ))}
                          {t >= 148.7 ? <Token x={engineerX + 72} y={684} r={13} /> : null}
                        </g>
                      ) : null}
                    </g>
                  ) : null}
                  {t >= at("quickQuestion") && t < 158.4 ? (
                    <g>
                      <Chalkboard x={700} y={300} width={640} height={320}>
                        <text x="34" y="66" fontFamily={font.chalk} fontSize="46" fill={chalkboard.line}>
                          GOAL:
                        </text>
                        {goal.map((glyph, i) => {
                          const gone = i >= written || (i === 0 && eight)
                          return (
                            <g key={`${glyph}${slots[i]}`}>
                              {gone ? <ChalkDust x={slots[i] ?? 0} /> : null}
                              <text
                                x={slots[i]}
                                y="196"
                                textAnchor="middle"
                                fontFamily={font.chalk}
                                fontSize="92"
                                fill={chalkboard.line}
                                opacity={gone ? 0.24 : 1}
                              >
                                {glyph}
                              </text>
                            </g>
                          )
                        })}
                        {eight ? (
                          <text
                            x={slots[0]}
                            y="200"
                            textAnchor="middle"
                            fontFamily={font.chalk}
                            fontSize="104"
                            fill={yellowChalk}
                          >
                            8
                          </text>
                        ) : null}
                        <text x="34" y="282" fontFamily={font.chalk} fontSize="64" fill={chalkboard.line}>
                          USERS
                        </text>
                        {eight ? (
                          <text x="372" y="282" fontFamily={font.chalk} fontSize="30" fill={yellowChalk}>
                            (rounded up)
                          </text>
                        ) : null}
                      </Chalkboard>
                      {t >= 156.24 ? <GoldStar x={1300} y={290} size={52 * star} /> : null}
                      <Cut>
                        <MathCoach
                          x={1520}
                          y={892}
                          scale={0.86}
                          armL={t < 151.9 ? 160 : 120 + Math.sin(t * (t < 153.7 ? 3 : 12)) * 10}
                          armR={eight && t < 155.6 ? 140 : 30}
                          holdL={<Eraser />}
                          mouth={t < 151.9 ? "o" : "smile"}
                          look={eight ? { x: -0.3, y: 0.2 } : { x: -0.6, y: -0.4 }}
                        />
                        <Clippy x={470} y={896} scale={0.6} hat bowtie brows={0.4} look={{ x: 1, y: -0.4 }} />
                      </Cut>
                      {cobweb > 0 && t < 155.2 ? (
                        <g
                          transform={`translate(${engineerX - 760} 0)`}
                          opacity={cobweb}
                          stroke="#e9e6dc"
                          strokeWidth="1.5"
                          fill="none"
                        >
                          <path d="M690,560 L760,600 M690,560 L740,640 M690,560 L700,660 M700,590 Q725,600 745,615 M698,615 Q718,625 738,632" />
                        </g>
                      ) : null}
                    </g>
                  ) : null}
                  {t < 158.4 ? (
                    <Cut>
                      <Engineer
                        x={engineerX}
                        y={898 + (lieDown > 0 ? lieDown * 40 : 0)}
                        scale={0.8}
                        rotate={-lieDown * 86}
                        pose={pose}
                      />
                    </Cut>
                  ) : null}
                </g>
              ) : null}
              {descend > 0 ? (
                <g transform={`translate(0 ${(1 - descend) * 800})`}>
                  <Stairs />
                  {t < at("task") + 1 ? (
                    <Cut>
                      <Octocat
                        x={octocatX}
                        y={tread(octocatX)}
                        scale={0.45}
                        travel={(octocatX - 170) / 0.45}
                        scuttle={octocatGoing}
                        look={{ x: 1, y: 0.4 }}
                        hold={
                          <g transform="translate(0 -10)">
                            <path d="M0,0 V-60" stroke={wood.dark} strokeWidth="8" />
                            <path
                              d={`M0,-60 Q14,-80 0,${-110 - Math.sin(t * 13) * 8} Q-14,-80 0,-60 Z`}
                              fill="#ffcf4a"
                              stroke="#e0661a"
                              strokeWidth="3"
                            />
                          </g>
                        }
                      />
                    </Cut>
                  ) : null}
                  {t >= 158.4 ? (
                    <Cut>
                      <Engineer x={descent.x} y={descent.y} scale={0.74} pose={{ ...pose, stride: descent.stride }} />
                    </Cut>
                  ) : null}
                  {t >= 161.6 ? (
                    <g>
                      <path
                        d="M1320,620 Q1250,700 1260,760"
                        stroke="#6a6a70"
                        strokeWidth="5"
                        fill="none"
                        strokeDasharray="10 4"
                      />
                      <Cut>
                        <Skeleton
                          x={1480}
                          y={898}
                          scale={0.82}
                          wave={t > 162.3 && t < 163.8 ? t : 0}
                          jaw={ramp(s, 165.2, 165.4)}
                        />
                      </Cut>
                      <Task x={1180} y={560} crumble={ramp(t, 165, 165.6)} />
                      {t > 163.84 ? (
                        <g stroke="#e9e6dc" strokeWidth="1.5" fill="none" opacity={ramp(t, 163.84, 164.6)}>
                          <path d="M1350,560 L1420,600 L1460,660 M1350,560 L1380,640 M1370,590 Q1400,600 1420,620" />
                        </g>
                      ) : null}
                    </g>
                  ) : null}
                </g>
              ) : null}
            </g>
          }
          front={
            <g>
              {during(t, 137.85, 139.3) ? (
                <Say x={640} y={262} width={640} lines={["NOBODY EXPECTS", "THE REORG!"]} tail={{ x: 1000, y: 560 }} />
              ) : null}
              {during(t, 150.4, 151.9) ? (
                <Say x={1100} y={260} width={360} lines={["Quick question\u2026"]} tail={{ x: 1450, y: 520 }} />
              ) : null}
              {during(t, 139.4, 142.8) ? (
                <g transform="translate(1500 232)">
                  <circle r="26" fill="#e23b3b" stroke={ink} strokeWidth="3" />
                  <path
                    d={`M0,0 L${Math.cos(t * 12) * 300},${Math.sin(t * 12) * 120 + 160}`}
                    stroke="#ff6b6b"
                    strokeWidth="40"
                    opacity="0.25"
                  />
                </g>
              ) : null}
            </g>
          }
          light={
            <g>
              {dungeon ? (
                <g>
                  <rect
                    x="150"
                    y="130"
                    width="1620"
                    height="780"
                    fill="#140c06"
                    opacity="0.1"
                    style={{ mixBlendMode: "multiply" }}
                  />
                  <Spot x={1300} y={700} rx={440} ry={280} />
                  <Spot x={600} y={560} rx={380} ry={320} />
                </g>
              ) : null}
              {speed ? (
                <rect
                  x="150"
                  y="130"
                  width="1620"
                  height="780"
                  fill="#ff3030"
                  opacity={0.08 + 0.08 * Math.sin(t * 24)}
                  style={{ mixBlendMode: "screen" }}
                />
              ) : null}
              <Spot x={960} y={870} rx={420} ry={80} />
            </g>
          }
        />
      </Camera>
    </Canvas>
  )
}
