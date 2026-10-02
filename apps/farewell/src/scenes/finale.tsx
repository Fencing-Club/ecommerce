import type { ReactNode } from "react"
import { Easing, random } from "remotion"
import { cards } from "../acts"
import { Quartet } from "../cast/activities"
import { Agent } from "../cast/agent"
import { Cardinal } from "../cast/cardinal"
import { Clippy } from "../cast/clippy"
import { MathCoach, ReadingCoach, StudyGuide } from "../cast/coaches"
import { Copilot } from "../cast/copilot"
import { Duck } from "../cast/duck"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { Guard } from "../cast/guard"
import { Octocat, PullRequest } from "../cast/octocat"
import { Octopus } from "../cast/octopus"
import { SadLady } from "../cast/sad-lady"
import { SchoolDataSync } from "../cast/sds"
import { Unicorn } from "../cast/unicorn"
import { PaperDolls } from "../cast/walk-ons"
import { Choir } from "../choir"
import { KickLine } from "../company"
import { AirBalloon, Moon, RocketFlight } from "../machines"
import { during, hop, keys, mix, onTwos, ramp, settle } from "../motion"
import { Camera, Canvas, Cut } from "../paper"
import { ChorusCloth, WaveRow } from "../sets"
import { HouseCurtain, Spot, Theatre } from "../theatre"
import { font, gold, ink, paper, velvet, wood } from "../theme"
import { at, beats } from "../timeline"

// The Grand Finale, One Microsoft: the whole company on risers with confetti, the FEATURE vase built, broken and
// mended in gold, the ship sailing again, rockets to the moon, a hotfix served on the side, the biggest kick line,
// everyone hand in hand with the paper dolls, and the final pull request merged with the cane as the meter bursts
// and the curtain falls on the last chord.

const confettiColors = ["#e63946", "#f1c453", "#2a9d8f", "#457b9d", "#e76f51", "#8338ec", "#ffffff"]

// The moon over the ship, and where each rocket of the volley lands in its eye.
const moon = { x: 620, y: 430, r: 70 }
const eye = [moon.x + (98 * moon.r) / 110, moon.y - (80 * moon.r) / 110] as const

// Confetti from the cannons either side, falling and turning.
const Confetti = ({ t, from }: { t: number; from: number }) => (
  <g>
    {Array.from({ length: 80 }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1
      const age = t - from - (i % 10) * 0.05
      if (age < 0) {
        return null
      }
      const vx = (300 + random(`cvx${i}`) * 700) * -side
      const vy = -900 - random(`cvy${i}`) * 600
      const x = (side < 0 ? 200 : 1720) + vx * age * 0.6
      const y = 860 + vy * age + 700 * age * age
      return y < 1000 ? (
        <rect
          key={i}
          x={x}
          y={((y - 130) % 900) + 130}
          width="14"
          height="8"
          fill={confettiColors[i % confettiColors.length]}
          transform={`rotate(${age * 500 + i * 30} ${x} ${y})`}
        />
      ) : null
    })}
  </g>
)

// A tier of the risers, a step of painted wood across the stage.
const Riser = ({ y, height }: { y: number; height: number }) => (
  <g filter="url(#cut)">
    <rect x="260" y={y} width="1400" height={height} fill={wood.base} stroke={ink} strokeWidth="4" />
    <rect x="260" y={y} width="1400" height="10" fill={wood.light} />
    <path d={`M260,${y + height / 2} H1660`} stroke={velvet.base} strokeWidth="8" opacity="0.6" />
  </g>
)

// The vase labelled FEATURE: assembled from flying pieces by `built`, smashed by `broken`, mended in gold by `fixed`.
const Vase = ({
  x,
  y,
  built,
  broken,
  fixed
}: {
  x: number
  y: number
  built: number
  broken: number
  fixed: number
}) => {
  const pieces = 8
  const scatter = Math.max(1 - built, broken * (1 - fixed))
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-70,0 H70 V-60 H-70 Z" fill="#e6dbc4" stroke={ink} strokeWidth="3" />
      {Array.from({ length: pieces }, (_, i) => {
        const a = random(`va${i}`) * Math.PI * 2
        const d = scatter * (200 + random(`vd${i}`) * 260)
        const row = Math.floor(i / 2)
        const half = i % 2
        return (
          <g
            key={i}
            transform={`translate(${Math.cos(a) * d} ${Math.sin(a) * d * 0.6 + scatter * scatter * 120}) rotate(${scatter * (random(`vr${i}`) - 0.5) * 400})`}
          >
            <path
              d={`M${half === 0 ? -1 : 0},${-60 - row * 46} H${half === 0 ? -76 + Math.abs(row - 1.5) * 14 : 76 - Math.abs(row - 1.5) * 14} V${-106 - row * 46} H${half === 0 ? -1 : 0} Z`}
              fill="#f4f6fb"
              stroke={fixed > 0.5 ? gold.base : ink}
              strokeWidth={fixed > 0.5 ? 4 : 2.5}
            />
          </g>
        )
      })}
      {scatter < 0.05 ? (
        <g>
          <path d="M-44,-168 Q0,-186 44,-168" fill="none" stroke="#2e5cb8" strokeWidth="6" />
          <text y="-121" textAnchor="middle" fontFamily={font.caps} fontSize="22" fill="#2e5cb8">
            FEATURE
          </text>
        </g>
      ) : null}
    </g>
  )
}

// A firework burst at (x, y), opened by `age` seconds.
const Firework = ({ x, y, age, color }: { x: number; y: number; age: number; color: string }) =>
  age < 0 || age > 1.4 ? null : (
    <g opacity={1 - age / 1.4}>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2
        const r = 30 + age * 220
        return (
          <path
            key={i}
            d={`M${x + Math.cos(a) * r * 0.6},${y + Math.sin(a) * r * 0.6 + age * age * 60} L${x + Math.cos(a) * r},${y + Math.sin(a) * r + age * age * 60}`}
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
          />
        )
      })}
    </g>
  )

// The silver cloche on the butler's tray, lifted by `lift` off a flaming chilli on a side plate.
const Cloche = ({ lift, t }: { lift: number; t: number }) => (
  <g>
    <ellipse cx="0" cy="0" rx="120" ry="16" fill="#cfd5dc" stroke={ink} strokeWidth="3" />
    <ellipse cx="60" cy="-8" rx="46" ry="10" fill="#fff" stroke={ink} strokeWidth="2" />
    <g transform="translate(60 -16)">
      <path d="M-30,0 Q-10,-30 26,-20 Q36,-12 30,0 Q0,8 -30,0 Z" fill="#d62828" stroke={ink} strokeWidth="2.5" />
      <path d="M26,-20 Q34,-30 30,-38" stroke="#2f7d4f" strokeWidth="4" fill="none" />
      {[-14, 0, 14].map((dx, i) => (
        <path
          key={dx}
          d={`M${dx - 8},-16 Q${dx},${-46 - Math.sin(t * 18 + i) * 8} ${dx + 8},-16 Z`}
          fill="#ffb02e"
          stroke={ink}
          strokeWidth="1.5"
        />
      ))}
      <rect x="-42" y="2" width="84" height="26" fill={paper.light} stroke={ink} strokeWidth="1.5" />
      <text y="21" textAnchor="middle" fontFamily={font.poster} fontSize="17" fill={velvet.base}>
        HOTFIX
      </text>
    </g>
    <g transform={`translate(${lift * 60} ${-lift * 160}) rotate(${lift * 20})`}>
      <path d="M-100,-4 Q-100,-110 0,-114 Q100,-110 100,-4 Z" fill="#d9dde3" stroke={ink} strokeWidth="3" />
      <path d="M-60,-60 Q-40,-96 0,-100" fill="none" stroke="#fff" strokeWidth="5" opacity="0.7" />
      <circle cy="-118" r="10" fill="#d9dde3" stroke={ink} strokeWidth="2.5" />
    </g>
  </g>
)

// The merge lever on its stand, pulled from up to down by `pull`.
const Lever = ({ x, y, pull }: { x: number; y: number; pull: number }) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <rect x="-90" y="-160" width="180" height="160" fill="#2e5cb8" stroke={ink} strokeWidth="4" />
    <text y="-110" textAnchor="middle" fontFamily={font.poster} fontSize="22" fill={gold.light}>
      COMPLETE
    </text>
    <text y="-80" textAnchor="middle" fontFamily={font.poster} fontSize="22" fill={gold.light}>
      MERGE
    </text>
    <g transform={`translate(0 -160) rotate(${mix(-40, 60, pull)})`}>
      <path d="M0,0 V-200" stroke={ink} strokeWidth="16" strokeLinecap="round" />
      <path d="M0,0 V-200" stroke="#c9ced6" strokeWidth="9" strokeLinecap="round" />
      <circle cy="-210" r="24" fill="#e63946" stroke={ink} strokeWidth="4" />
    </g>
  </g>
)

export const Finale = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const b = beats(s)
  const kick = Math.max(0, Math.sin(Math.PI * (b - Math.floor(b))))
  const risers = t < at("feature")
  const grandLine = during(t, at("soLong6"), at("friendship"))
  const hands = during(t, at("friendship"), at("finalPr"))
  const merge = t >= at("finalPr")
  const curtainDown = ramp(t, 223.6, 224.5, Easing.out(Easing.bounce))

  const camera = {
    scale: keys(t, [
      [199.48, 0.82],
      [202.8, 0.82],
      [203.3, 1],
      [209.5, 1],
      [209.9, 1.3],
      [212.5, 1.3],
      [212.8, 0.86],
      [221, 0.86],
      [222, 0.78]
    ]),
    x: keys(t, [
      [202.8, 960],
      [203.3, 960],
      [209.5, 960],
      [209.9, 900],
      [212.5, 900],
      [212.8, 960]
    ]),
    y: keys(t, [
      [199.48, 560],
      [202.8, 560],
      [203.3, 540],
      [209.5, 540],
      [209.9, 560],
      [212.5, 560],
      [212.8, 560]
    ])
  }

  const built = ramp(t, 203.6, 204.5, Easing.out(Easing.cubic))
  const broken = ramp(t, 204.96, 205.5, Easing.out(Easing.quad))
  const fixed = ramp(t, 206.62, 207.1, Easing.inOut(Easing.cubic))
  const ship = ramp(t, 207.4, 209.4, Easing.inOut(Easing.sin))
  const balloons = ramp(t, 208.2, 209.6, Easing.out(Easing.cubic))
  const lift = ramp(s, 210.7, 211, Easing.out(Easing.cubic))
  const pull = ramp(s, 221.2, 221.4, Easing.in(Easing.cubic))
  const lever = ramp(s, 220.2, 220.8, Easing.out(Easing.cubic))

  let pose: EngineerPose = {
    armL: 150,
    elbowL: -10,
    openL: true,
    armR: 140,
    elbowR: 10,
    cane: { hand: "right", angle: 160 + (Math.floor(b) % 4 === 3 ? (b % 1) * 720 : 0), grip: 0.5 },
    mouth: "sing",
    look: { x: 0, y: -0.3 },
    legL: Math.floor(b) % 2 === 0 ? kick * 50 : 0,
    legR: Math.floor(b) % 2 === 1 ? kick * 50 : 0
  }
  if (during(t, at("feature"), at("hotfix"))) {
    pose = {
      armL: 60,
      elbowL: 40,
      openL: true,
      armR: 40,
      cane: { hand: "right", angle: 12 },
      mouth: broken > 0 && fixed < 1 ? "o" : "grin",
      look: { x: 0.8, y: -0.2 }
    }
  }
  if (during(t, at("hotfix"), at("soLong6"))) {
    const eaten = t > 211.6
    pose = {
      armL: eaten ? 160 : 30,
      elbowL: eaten ? 150 : 20,
      openL: true,
      armR: 40,
      cane: { hand: "right", angle: 10 },
      mouth: eaten ? "o" : "grin",
      look: { x: 1, y: 0.4 }
    }
  }
  if (hands) {
    pose = {
      armL: 70,
      elbowL: 0,
      openL: true,
      armR: 70,
      elbowR: 0,
      openR: true,
      cane: "hood",
      mouth: "sing",
      look: { x: 0, y: -0.2 },
      tilt: Math.sin(Math.PI * b * 0.5) * 6
    }
  }
  if (merge) {
    pose = {
      armL: 120,
      elbowL: 30,
      openL: true,
      holdL: t < 220.4 ? <PullRequest label="Final PR" /> : undefined,
      armR: mix(110, 70, pull),
      elbowR: 0,
      cane: { hand: "right", angle: mix(110, 60, pull), grip: 0.95 },
      mouth: t > 221.4 ? "grin" : "o",
      look: { x: 1, y: -0.4 }
    }
  }

  const dollsLeft = ramp(t, 216.3, 217.6)
  return (
    <Canvas>
      <Camera scale={camera.scale} look={{ x: camera.x, y: camera.y }}>
        <Theatre
          card={cards.finale}
          boxes={{ left: <Choir t={t} side="left" mood="sing" />, right: <Choir t={t} side="right" mood="sing" /> }}
          backdrop={
            <g>
              <ChorusCloth text="SO LONG" />
              {during(t, 207.2, 212.8) ? (
                <g>
                  <Moon x={moon.x} y={moon.y} r={moon.r} hit={t > 209.3} />
                  {t >= 208.74 && t < 209.4
                    ? [0, 1, 2, 3, 4].map((i) => {
                        const u = ramp(t, 208.74 + i * 0.06, 209.3, Easing.inOut(Easing.quad))
                        return u > 0 && u < 1 ? (
                          <RocketFlight
                            key={i}
                            from={[1000 + i * 120, 760]}
                            to={eye}
                            lift={220}
                            u={u}
                            scale={moon.r / 110}
                          />
                        ) : null
                      })
                    : null}
                </g>
              ) : null}
            </g>
          }
          stage={
            <g>
              {risers ? (
                <g>
                  <Riser y={640} height={60} />
                  <Riser y={720} height={70} />
                  <Cut>
                    {[470, 620, 1300, 1450].map((x, i) => (
                      <Agent
                        key={x}
                        x={x}
                        y={640}
                        scale={0.56}
                        armL={150}
                        armR={150 - kick * 40}
                        tint={["#c9d0dc", "#d8c7a1", "#b9d4c4", "#e2c9e6"][i]}
                      />
                    ))}
                    <Cardinal x={790} y={640} scale={0.5} armL={150} armR={150} mouth="sing" />
                    <Guard x={960} y={640} scale={0.48} />
                    <Cardinal x={1130} y={640} scale={0.5} flip armL={150} armR={150} mouth="sing" />
                    <Unicorn x={545} y={720} scale={0.42} front={kick * 40} back={0} />
                    <MathCoach x={770} y={720 - hop(t) * 6} scale={0.5} armL={140} armR={140} mouth="sing" />
                    <Quartet x={960} y={720 - hop(t) * 6} scale={0.42} />
                    <StudyGuide x={1160} y={720} scale={0.5} armL={150} armR={150} mouth="sing" />
                    <SchoolDataSync x={1330} y={720} scale={0.5} armL={150} armR={150} mouth="sing" />
                    <Octocat x={1480} y={720} scale={0.36} look={{ x: -0.4, y: -0.2 }} />
                    <Duck x={490} y={898} scale={0.7} bowtie />
                    <ReadingCoach x={650} y={896} scale={0.7} armL={150} armR={150} mouth="sing" />
                    <Clippy x={1160} y={896 - hop(t) * 10} scale={0.6} hat bowtie brows={1} mouth="sing" />
                    <Copilot x={1400} y={884 - hop(t) * 10} scale={0.62} armL={150} armR={150} mouth="sing" />
                    <Engineer x={900} y={898 - hop(t) * 4} scale={0.8} pose={pose} />
                  </Cut>
                  <Confetti t={t} from={199.5} />
                </g>
              ) : null}
              {during(t, at("feature"), at("hotfix")) ? (
                <g>
                  {t >= 207.2 ? (
                    <g>
                      <g transform={`translate(${mix(-400, 2300, ship)} 0)`}>
                        <g
                          transform={`translate(0 ${560 + Math.sin(t * 2.4) * 8}) rotate(${Math.sin(t * 2.4) * 3}) scale(0.55)`}
                          filter="url(#cut)"
                        >
                          <path d="M-220,-130 H220 L170,0 H-170 Z" fill="#2b2f3a" stroke={ink} strokeWidth="5" />
                          <text
                            y="-48"
                            textAnchor="middle"
                            fontFamily={font.caps}
                            fontSize="46"
                            letterSpacing="2"
                            fill={gold.light}
                          >
                            HMS Code
                          </text>
                          <path d="M118,-122 l40,40 M158,-122 l-40,40" stroke="#f4f6f8" strokeWidth="10" />
                          <path
                            d="M-60,-130 V-300 M-60,-300 L40,-270 L-60,-240 Z"
                            fill="#fff"
                            stroke={ink}
                            strokeWidth="4"
                          />
                        </g>
                      </g>
                      <g transform="translate(0 -180)">
                        <WaveRow t={t} y={760} phase={1} color="#3d86b8" />
                      </g>
                    </g>
                  ) : null}
                  {t >= 208.2
                    ? [0, 1, 2, 3, 4].map((i) => (
                        <Cut key={i}>
                          <AirBalloon
                            x={mix(960, 700 + i * 130, balloons)}
                            y={mix(800, 300 + (i % 2) * 60, balloons) + Math.sin(t * 2 + i) * 8}
                            scale={0.36}
                            banner={[`RING ${i}`]}
                          />
                        </Cut>
                      ))
                    : null}
                  <Vase x={960} y={898} built={built} broken={broken} fixed={fixed} />
                  <Cut>
                    <Engineer x={620} y={898} scale={0.8} pose={pose} />
                  </Cut>
                </g>
              ) : null}
              {during(t, at("hotfix"), at("hotfix") + 3.1) ? (
                <g>
                  <Cut>
                    <Engineer x={620} y={898} scale={0.8} pose={pose} />
                    <Octocat x={1160} y={880} scale={0.5} look={{ x: -0.6, y: 0 }} />
                  </Cut>
                  <g transform="translate(1100 640)">
                    <Cloche lift={lift} t={t} />
                  </g>
                  <path
                    d="M1110,600 L1140,620 L1170,600 L1140,580 Z M1110,600 L1170,600"
                    fill="#fff"
                    stroke={ink}
                    strokeWidth="2"
                    transform="translate(0 120)"
                  />
                  {t > 211.6 ? (
                    <g fill="#f4efe4" stroke={ink} strokeWidth="2" opacity={1 - ramp(t, 212.2, 212.8)}>
                      {[-1, 1].map((side) => (
                        <circle
                          key={side}
                          cx={620 + side * 50}
                          cy={898 - 0.8 * 360 - (t - 211.6) * 80}
                          r={10 + (t - 211.6) * 30}
                        />
                      ))}
                    </g>
                  ) : null}
                </g>
              ) : null}
              {grandLine ? (
                <g>
                  <Cut>
                    <Cardinal x={500} y={812} scale={0.5} armL={150} armR={150} rotate={-kick * 10} />
                    <Cardinal x={1210} y={750} scale={0.5} flip armL={150} armR={150} rotate={kick * 10} />
                  </Cut>
                  <KickLine t={t} agents phone />
                  <Cut>
                    <Guard x={1520} y={898} scale={0.6} rotate={kick * 6} />
                    <Duck x={470} y={898} scale={0.6} bowtie rotate={kick * 10} />
                  </Cut>
                  <Confetti t={t} from={212.8} />
                </g>
              ) : null}
              {hands ? (
                <g>
                  <PaperDolls x={480} y={898} scale={1} count={2} unfold={dollsLeft} />
                  <g transform="translate(1680 0) scale(-1 1)">
                    <PaperDolls x={220} y={898} scale={1} count={2} unfold={dollsLeft} />
                  </g>
                  <Cut>
                    {[
                      { x: 660, node: <ReadingCoach x={0} y={0} scale={0.66} armL={70} armR={70} mouth="sing" /> },
                      { x: 820, node: <Clippy x={0} y={0} scale={0.56} hat bowtie mouth="sing" /> },
                      { x: 1100, node: <Copilot x={0} y={-10} scale={0.58} armL={70} armR={70} mouth="sing" /> },
                      { x: 1280, node: <StudyGuide x={0} y={0} scale={0.64} armL={70} armR={70} mouth="sing" /> }
                    ].map(({ x, node }: { x: number; node: ReactNode }) => (
                      <g key={x} transform={`translate(${x} 898) rotate(${Math.sin(Math.PI * b * 0.5) * 5})`}>
                        {node}
                      </g>
                    ))}
                    <Engineer x={960} y={898} scale={0.8} pose={pose} />
                  </Cut>
                </g>
              ) : null}
              {merge ? (
                <g>
                  <Lever x={mix(2100, 1180, lever)} y={898} pull={pull} />
                  <Cut>
                    <Octocat
                      x={mix(1500, 2200, ramp(t, 220.2, 221.6, Easing.in(Easing.quad)))}
                      y={880}
                      scale={0.5}
                      travel={(700 * ramp(t, 220.2, 221.6, Easing.in(Easing.quad))) / 0.5}
                      scuttle={ramp(t, 220.2, 220.4)}
                      hold={t < 220 ? <PullRequest label="Final PR" /> : undefined}
                      look={{ x: -1, y: 0 }}
                    />
                    <Engineer x={900} y={898} scale={0.82} pose={pose} />
                  </Cut>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Firework
                      key={i}
                      x={560 + i * 160}
                      y={280 + (i % 2) * 110}
                      age={t - (221.5 + i * 0.25)}
                      color={confettiColors[i % confettiColors.length] ?? "#fff"}
                    />
                  ))}
                  <Confetti t={t} from={221.5} />
                </g>
              ) : null}
            </g>
          }
          front={
            <g>
              {during(t, 205, 206.36) ? (
                <g transform={`translate(1520 ${mix(1000, 620, settle(t, 205, 9, 180))})`}>
                  <SadLady x={0} y={0} scale={0.8} />
                </g>
              ) : null}
              {curtainDown > 0 ? (
                <g transform={`translate(0 ${-820 * (1 - curtainDown)})`}>
                  <HouseCurtain />
                </g>
              ) : null}
            </g>
          }
          light={
            <g>
              <Spot x={960} y={870} rx={520} ry={90} />
              {during(t, 221.5, 223.6) ? (
                <rect
                  x="150"
                  y="130"
                  width="1620"
                  height="780"
                  fill="#fff6d8"
                  opacity={0.12 * Math.max(0, Math.sin(t * 20))}
                />
              ) : null}
            </g>
          }
          pit={
            <Cut>
              <Octopus
                x={914}
                y={1012 - hop(t) * 4}
                scale={0.5}
                rotate={Math.sin(Math.PI * b) * 3}
                baton={Math.sin(Math.PI * b) * 24}
              />
            </Cut>
          }
        />
      </Camera>
    </Canvas>
  )
}
