import { Easing, random } from "remotion"
import { cards } from "../acts"
import { PatentCube, patents } from "../awards"
import { Quartet } from "../cast/activities"
import { Agent } from "../cast/agent"
import { Cardinal } from "../cast/cardinal"
import { Clippy } from "../cast/clippy"
import { MathCoach, ReadingCoach, StudyGuide } from "../cast/coaches"
import { Colonel } from "../cast/colonel"
import { Copilot } from "../cast/copilot"
import { Duck } from "../cast/duck"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { Guard } from "../cast/guard"
import { Lamp } from "../cast/lamp"
import { Octocat } from "../cast/octocat"
import { Octopus } from "../cast/octopus"
import { SadLady } from "../cast/sad-lady"
import { SchoolDataSync } from "../cast/sds"
import { Unicorn } from "../cast/unicorn"
import { BadgeWalker, Dolphin, GiantFoot, Skeleton, Squirrel } from "../cast/walk-ons"
import { WindowsPhone } from "../cast/windows-phone"
import { Choir } from "../choir"
import { hop, keys, mix, onTwos, ramp, settle, shake } from "../motion"
import { Camera, Canvas, Cut } from "../paper"
import { Token } from "../props"
import { ChorusCloth } from "../sets"
import { HouseCurtain, Spot, Theatre } from "../theatre"
import { ink, velvet } from "../theme"
import { at, beats } from "../timeline"

// The curtain call: the iris blown open by "SO LOOOOONG!", the curtain out on the whole company bowing, roses and
// tokens on the stage, the Unicorn's halves bowing out of time, a dolphin in the stalls, Sad Lady smiling at last,
// and the first patent cube from Act I finally coming down. Then the last "So… long!", and the foot.

// A rose thrown on stage.
const Rose = ({ x, y, rotate }: { x: number; y: number; rotate: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <path d="M0,0 V40" stroke="#2f7d4f" strokeWidth="4" />
    <circle r="10" fill={velvet.light} stroke={ink} strokeWidth="2" />
    <path d="M-5,-2 Q0,-8 5,-2" stroke={velvet.dark} strokeWidth="2" fill="none" />
  </g>
)

export const CurtainCall = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const b = beats(s)
  const start = at("soLooong")
  const open = ramp(t, start, start + 0.35, Easing.out(Easing.cubic))
  const curtainOut = ramp(t, start + 0.1, start + 0.7, Easing.in(Easing.cubic))
  const bow = Math.max(0, Math.sin((Math.PI * (b - beats(start))) / 4))
  const lookUp = t >= at("lastSo") + 0.2
  const foot =
    ramp(t, at("lastSo") + 0.3, at("lastLong") - 0.05, Easing.inOut(Easing.sin)) * 0.25 +
    ramp(t, at("lastLong") - 0.05, at("lastLong") + 0.08, Easing.in(Easing.quad)) * 0.75
  const squashed = t >= at("lastLong") + 0.08
  // The foot hangs there swaying, then stamps, squashing a little as it lands.
  const footY = mix(-300, 905, foot)
  const footSway = Math.sin(t * 2.6) * 2 * (1 - ramp(t, at("lastLong") - 0.05, at("lastLong") + 0.08))
  const squish = squashed ? 1 - ramp(t, at("lastLong") + 0.08, at("lastLong") + 0.34, Easing.out(Easing.cubic)) : 0
  const cubeDrop = ramp(t, 240.4, 240.9, Easing.in(Easing.quad))

  const camera = {
    scale: keys(t, [
      [start, 0.92],
      [start + 1.5, 0.76],
      [246, 0.8],
      [at("lastSo"), 0.84]
    ]),
    y: keys(t, [
      [start, 540],
      [start + 1.5, 580],
      [at("lastSo"), 560]
    ])
  }

  const bowing = (k: number) => (lookUp ? 0 : bow * (k % 2 === 0 ? 1 : 0.9))
  // Everyone holds the long note through the bows, then gapes up at the foot.
  const chorus = lookUp ? "o" : "sing"
  const pose: EngineerPose = lookUp
    ? { armL: 40, armR: 40, cane: { hand: "right", angle: 10 }, mouth: "o", look: { x: 0, y: -1 } }
    : {
        armL: 30 + bow * 60,
        elbowL: 20,
        openL: true,
        armR: 60 + bow * 40,
        elbowR: 40,
        cane: { hand: "right", angle: 60 + bow * 80, grip: 0.2 },
        holdL: t > 240.9 ? <PatentCube {...patents[0]} x={0} y={-16} scale={0.4} /> : undefined,
        tilt: bow * 20,
        mouth: "grin",
        look: { x: 0, y: 0.4 * bow }
      }

  return (
    <Canvas>
      <g
        transform={`translate(${squashed && t < at("lastLong") + 0.5 ? shake(t, 14) : 0} ${squashed && t < at("lastLong") + 0.5 ? shake(t + 3, 10) : 0})`}
      >
        <Camera scale={camera.scale} look={{ x: 960, y: camera.y }}>
          <Theatre
            card={cards.curtainCall}
            boxes={{
              left: <Choir t={t} side="left" mood={lookUp ? "watch" : "bow"} />,
              right: <Choir t={t} side="right" mood={lookUp ? "watch" : "bow"} />
            }}
            backdrop={<ChorusCloth text="SO LONG" />}
            stage={
              <g>
                <g transform={squashed ? "translate(960 898) scale(1 0.08) translate(-960 -898)" : undefined}>
                  <Cut>
                    <Agent x={520} y={770} scale={0.56} rotate={bowing(0) * 18} armL={150} armR={150} />
                    <Cardinal x={650} y={770} scale={0.5} rotate={bowing(1) * 18} armL={60} armR={60} mouth={chorus} />
                    <Colonel x={790} y={770} scale={0.5} rotate={bowing(0) * 18} armR={20} mouth={chorus} />
                    <Unicorn
                      x={960}
                      y={770}
                      scale={0.44}
                      rotate={0}
                      front={bowing(0) * 40}
                      back={bowing(1) > 0.5 ? 0 : 40}
                    />
                    <Skeleton x={1150} y={770} scale={0.5} rotate={bowing(1) * 18} wave={t} />
                    <Guard x={1280} y={770} scale={0.46} rotate={bowing(0) * 10} />
                    <Agent x={1410} y={770} scale={0.56} rotate={bowing(1) * 18} armL={150} armR={150} tint="#d8c7a1" />
                    <MathCoach
                      x={580}
                      y={835}
                      scale={0.52}
                      rotate={bowing(1) * 16}
                      armL={60}
                      armR={60}
                      mouth={chorus}
                    />
                    <Quartet x={760} y={835} scale={0.42} rotate={bowing(0) * 10} mouth={chorus} />
                    <SchoolDataSync
                      x={1180}
                      y={835}
                      scale={0.56}
                      rotate={bowing(1) * 16}
                      armL={60}
                      armR={60}
                      mouth={chorus}
                    />
                    <Octocat x={1330} y={820} scale={0.42} rotate={bowing(1) * 16} />
                    <Lamp x={1480} y={835} scale={0.6} flip lean={-12 + bowing(1) * 30} aim={-80} />
                    <WindowsPhone
                      x={500}
                      y={898}
                      scale={0.76}
                      rotate={bowing(0) * 16}
                      armL={150}
                      armR={60}
                      face="grin"
                    />
                    <ReadingCoach
                      x={640}
                      y={898}
                      scale={0.66}
                      rotate={bowing(1) * 16}
                      armL={60}
                      armR={60}
                      mouth={chorus}
                    />
                    <Clippy x={780} y={896} scale={0.58} rotate={bowing(0) * 16} hat bowtie brows={1} mouth={chorus} />
                    <Engineer x={960} y={898} scale={0.82} pose={pose} />
                    <Copilot x={1120} y={884} scale={0.6} rotate={bowing(1) * 16} armL={60} armR={150} mouth={chorus} />
                    <StudyGuide
                      x={1260}
                      y={898}
                      scale={0.64}
                      rotate={bowing(0) * 16}
                      armL={60}
                      armR={60}
                      mouth={chorus}
                    />
                    <Duck x={1390} y={898} scale={0.6} bowtie rotate={bowing(0) * 20} />
                    <Squirrel x={1470} y={898} scale={0.6} flip rotate={bowing(1) * 20} wink={!lookUp} />
                    <BadgeWalker x={1545} y={898} scale={0.5} rotate={bowing(0) * 20} />
                  </Cut>
                </g>
                {Array.from({ length: 24 }, (_, i) => {
                  const land = 234.6 + random(`rl${i}`) * 4
                  const fall = ramp(t, land - 0.8, land, Easing.in(Easing.quad))
                  const x = 460 + random(`rx${i}`) * 1100
                  if (fall <= 0) {
                    return null
                  }
                  if (i % 3 === 0) {
                    return <Token key={i} x={x} y={mix(-60, 905, fall)} r={12} turn={Math.cos(t * 6 + i)} />
                  }
                  return (
                    <Rose key={i} x={x} y={mix(-60, 896, fall)} rotate={fall < 1 ? t * 300 + i * 40 : 80 + i * 13} />
                  )
                })}
                {t > 240.4 && t < 240.9 ? (
                  <PatentCube
                    {...patents[0]}
                    x={818}
                    y={mix(-100, 660, cubeDrop)}
                    scale={0.4}
                    rotate={cubeDrop * 540}
                  />
                ) : null}
              </g>
            }
            front={
              <g>
                {t >= 237 ? (
                  <g transform={`translate(1560 ${mix(1000, 460, settle(t, 237, 9, 160))})`}>
                    <SadLady x={0} y={0} scale={0.7} mood="happy" />
                  </g>
                ) : null}
                {curtainOut < 1 ? (
                  <g transform={`translate(0 ${-820 * curtainOut})`}>
                    <HouseCurtain />
                  </g>
                ) : null}
              </g>
            }
            light={
              <g>
                <Spot x={960} y={870} rx={700} ry={100} />
                {lookUp ? (
                  <rect
                    x="150"
                    y="130"
                    width="1620"
                    height="780"
                    fill="#000"
                    opacity={0.4 * ramp(t, at("lastSo"), at("lastLong"))}
                  />
                ) : null}
              </g>
            }
            pit={
              <g>
                <Cut>
                  <Octopus x={914} y={1012 - hop(t) * 4} scale={0.5} baton={lookUp ? 0 : Math.sin(Math.PI * b) * 24} />
                  {t >= 236.5 ? (
                    <Dolphin x={560} y={mix(1300, 1150, settle(t, 236.5, 9, 140))} scale={0.8} wave={t} />
                  ) : null}
                </Cut>
              </g>
            }
          />
          {foot > 0 ? (
            <g>
              <ellipse
                cx={1088}
                cy={892}
                rx={160 + 220 * foot}
                ry={20 + 34 * foot}
                fill="#000"
                opacity={0.15 + 0.4 * foot}
              />
              <g
                transform={`translate(1000 ${footY}) rotate(${footSway}) scale(${1 + squish * 0.04} ${1 - squish * 0.07}) translate(-1000 ${-footY})`}
              >
                <GiantFoot x={1000} y={footY} scale={0.95} />
              </g>
            </g>
          ) : null}
          {squashed && t < at("lastLong") + 0.66 ? (
            <g opacity={1 - (t - at("lastLong") - 0.08) / 0.58} fill="#fffaf0" stroke={ink} strokeWidth="5">
              {[-1, 1].map((side) =>
                [0, 1, 2, 3, 4, 5].map((k) => (
                  <circle
                    key={`${side}${k}`}
                    cx={1000 + side * (420 + (t - at("lastLong")) * 1400 + k * 70)}
                    cy={870 - k * 26 - (t - at("lastLong")) * 200}
                    r={50 + k * 16 + (t - at("lastLong")) * 120}
                  />
                ))
              )}
            </g>
          ) : null}
        </Camera>
      </g>
      {open < 1 ? (
        <path
          d={`M0,0 H1920 V1080 H0 Z M${714 - mix(26, 1500, open)},667 a${mix(26, 1500, open)},${mix(26, 1500, open)} 0 1,0 ${mix(26, 1500, open) * 2},0 a${mix(26, 1500, open)},${mix(26, 1500, open)} 0 1,0 ${-mix(26, 1500, open) * 2},0 Z`}
          fill="#000"
          fillRule="evenodd"
        />
      ) : null}
    </Canvas>
  )
}
