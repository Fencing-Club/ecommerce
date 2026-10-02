import { Easing } from "remotion"
import { cards } from "../acts"
import { Crystal } from "../awards"
import { Clippy } from "../cast/clippy"
import { Copilot } from "../cast/copilot"
import { Duck } from "../cast/duck"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { Guard } from "../cast/guard"
import { SadLady } from "../cast/sad-lady"
import { BadgeWalker, badgeLegs } from "../cast/walk-ons"
import { Choir } from "../choir"
import { during, mix, onTwos, ramp, settle, shake } from "../motion"
import { Camera, Canvas, Cut } from "../paper"
import { Balloon } from "../props"
import { Spot, Theatre } from "../theatre"
import { font, ink, paper, wood } from "../theme"
import { walk } from "../walk"

// The Epilogue, OOF: in front of the curtain, in the Lamp's one spot, the Engineer with the leaving box. A pager
// buzzes; they stare at each other. At the stage door the badge tries itself on the reader and is refused, the SFI
// Guard lowers his pike, the pager goes to Copilot, and the Engineer and the badge walk off together, Chaplin style,
// the iris closing on the twirling cane.

// The leaving box: a plant, both crystals and the Rubber Duck peeking out, glancing `glance` either way. Carried at the
// waist, its bottom 80 below.
const LeavingBox = ({ glance }: { glance: number }) => (
  <g transform="translate(0 80)">
    <path
      d="M70,-130 Q50,-190 80,-230 M80,-130 Q110,-200 140,-210 M90,-130 Q100,-180 70,-200"
      stroke="#2f7d4f"
      strokeWidth="6"
      fill="none"
    />
    {[
      [80, -230],
      [140, -210],
      [70, -200],
      [60, -170],
      [120, -180]
    ].map(([lx = 0, ly = 0]) => (
      <ellipse
        key={`${lx}${ly}`}
        cx={lx}
        cy={ly}
        rx="16"
        ry="9"
        fill="#5fae5f"
        stroke={ink}
        strokeWidth="2"
        transform={`rotate(-30 ${lx} ${ly})`}
      />
    ))}
    <Crystal x={-70} y={-110} scale={0.4} />
    <Crystal x={-20} y={-110} scale={0.3} band="#3aa35b" years="Five years" />
    <Duck x={30} y={-110} scale={0.42} flip={glance > 0} />
    <g filter="url(#cut)">
      <path d="M-130,-120 H130 L120,0 H-120 Z" fill="#c99a5b" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      <path d="M-130,-120 L-150,-150 H-110 Z M130,-120 L150,-150 H110 Z" fill="#b5864a" stroke={ink} strokeWidth="3" />
      <rect x="-50" y="-80" width="100" height="40" fill={paper.light} stroke={ink} strokeWidth="2" />
      <text y="-53" textAnchor="middle" fontFamily={font.typewriter} fontSize="20" fill={ink}>
        OOF
      </text>
    </g>
  </g>
)

// A pager on the floor, buzzing and shuffling while `buzz`.
const Pager = ({ x, y, buzz, t }: { x: number; y: number; buzz: boolean; t: number }) => (
  <g
    transform={`translate(${x + (buzz ? shake(t, 6) : 0)} ${y}) rotate(${buzz ? shake(t + 1, 8) : 0}) scale(1.3)`}
    filter="url(#cut)"
  >
    <rect x="-46" y="-30" width="92" height="56" rx="10" fill="#26282c" stroke={ink} strokeWidth="3" />
    <rect x="-34" y="-20" width="56" height="26" fill="#9fd08a" stroke={ink} strokeWidth="2" />
    <text x="-6" y="-1" textAnchor="middle" fontFamily={font.typewriter} fontSize="14" fill={ink}>
      SEV 1
    </text>
    <circle cx="34" cy="-14" r="6" fill={buzz && Math.floor(t * 8) % 2 === 0 ? "#ff3b3b" : "#5a1414"} />
    {buzz ? (
      <g stroke={ink} strokeWidth="3" strokeLinecap="round">
        <path d="M-60,-30 l-14,-10 M-60,0 h-18 M60,-30 l14,-10 M60,0 h18" />
      </g>
    ) : null}
  </g>
)

// The stage door, its badge reader lit red for no by `denied`.
const StageDoor = ({ x, y, denied }: { x: number; y: number; denied: boolean }) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <rect x="-120" y="-360" width="240" height="360" fill="#3a2a24" stroke={ink} strokeWidth="5" />
    <rect x="-104" y="-344" width="208" height="344" fill={wood.dark} stroke={ink} strokeWidth="3" />
    <rect x="-80" y="-410" width="160" height="40" fill={paper.light} stroke={ink} strokeWidth="3" />
    <text y="-382" textAnchor="middle" fontFamily={font.caps} fontSize="22" fill={ink}>
      Stage Door
    </text>
    <rect x="140" y="-230" width="54" height="80" rx="8" fill="#26282c" stroke={ink} strokeWidth="3" />
    <circle cx="167" cy="-210" r="10" fill={denied ? "#ff3b3b" : "#5a1414"} />
    {denied ? (
      <g>
        <rect x="100" y="-300" width="180" height="44" fill="#26282c" stroke={ink} strokeWidth="2" />
        <text x="190" y="-270" textAnchor="middle" fontFamily={font.typewriter} fontSize="20" fill="#ff3b3b">
          ACCESS DENIED
        </text>
      </g>
    ) : null}
  </g>
)

export const Epilogue = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const buzz = t >= 227.3 && t < 232.6
  const denied = t >= 231.64
  const pike = ramp(s, 231.9, 232.2, Easing.in(Easing.back(1.4)))
  const copilot = settle(s, 232.5, 10, 180) * (1 - ramp(s, 233.4, 233.7))
  const hooked = during(t, 232.5, 233.1)
  // Off with the badge, a spring in each step.
  const exit = walk(t, {
    from: 232.95,
    to: 233.92,
    x0: 860,
    x1: 620,
    steps: 4,
    scale: 0.82,
    arms: 0,
    bounce: 6,
    rush: true
  })
  const leaving = t >= 232.95
  // The badge waddles to the reader, is refused, bounds over to the Engineer in three hops and walks off at his side.
  const badge = (() => {
    const hops = ramp(t, 232.05, 232.95, Easing.linear) * 3
    if (leaving) {
      return walk(t, {
        from: 232.95,
        to: 233.92,
        x0: 1010,
        x1: 770,
        steps: 10,
        scale: 0.7,
        build: badgeLegs,
        rush: true
      })
    }
    if (hops > 0) {
      const done = Math.min(2, Math.floor(hops))
      const hop = hops - done
      return {
        x: mix(1660, 1010, (done + Easing.inOut(Easing.sin)(hop)) / 3),
        y: 896 - Math.sin(Math.PI * hop) * 70,
        stride: undefined
      }
    }
    const on = walk(t, { from: 230, to: 231.3, x0: 1990, x1: 1660, steps: 13, scale: 0.7, build: badgeLegs })
    return { ...on, y: on.y - (denied && t < 232 ? Math.abs(Math.sin((t - 231.64) * 12)) * 20 : 0) }
  })()
  const iris = ramp(t, 233.2, 233.85, Easing.in(Easing.cubic))
  const x = exit.x
  const box = <LeavingBox glance={t > 229.4 && t < 230 ? 1 : -1} />

  // Both hands on the box and the cane hooked on the hood; then the box under one arm and the cane in hand.
  let pose: EngineerPose = {
    armL: 30,
    elbowL: 4,
    armR: 30,
    elbowR: 4,
    carry: box,
    cane: "hood",
    dress: "hood",
    headset: "on",
    badge: false,
    mouth: "flat",
    look: t >= 227.82 ? { x: 1, y: 0.6 } : { x: 0, y: 0 }
  }
  if (t >= 232.3) {
    pose = {
      ...pose,
      armL: 10,
      elbowL: -70,
      armR: hooked ? 100 : 40,
      elbowR: 0,
      cane: hooked ? { hand: "right", angle: 92, grip: 0.95 } : { hand: "right", angle: 30 },
      mouth: "smile",
      look: { x: hooked ? 1 : -1, y: 0 }
    }
  }
  if (leaving) {
    pose = {
      ...pose,
      armR: 80,
      cane: { hand: "right", angle: 80 + t * 900, grip: 0.5 },
      stride: exit.stride,
      look: { x: -1, y: 0 }
    }
  }
  const pagerPlace = (() => {
    if (t < 232.5) {
      return { x: 1120, y: 882 }
    }
    if (t < 233.1) {
      return {
        x: mix(1120, 1135, ramp(t, 232.5, 233.1)),
        y: mix(882, 775, ramp(t, 232.5, 233.1)) - Math.sin(ramp(t, 232.5, 233.1) * Math.PI) * 160
      }
    }
    return { x: 1135, y: 775 }
  })()
  const irisR = mix(1400, 26, iris)
  // The iris closes on the twirling cane, in the right hand.
  const twirl = { x: x + 94, y: 667 }

  return (
    <Canvas>
      <Camera>
        <Theatre
          curtain={0}
          card={cards.epilogue}
          boxes={{ left: <Choir t={t} side="left" mood="watch" />, right: <Choir t={t} side="right" mood="watch" /> }}
          front={
            <g>
              <rect x="150" y="130" width="1620" height="780" fill="#000" opacity="0.45" />
              <StageDoor x={1480} y={898} denied={denied} />
              <Cut>
                <Guard x={1330} y={898} scale={0.72} lowered={pike} />
              </Cut>
              {copilot > 0.01 ? (
                <Cut>
                  <Copilot
                    x={1200}
                    y={898 + (1 - copilot) * 400}
                    scale={0.6}
                    armL={150}
                    armR={60}
                    mouth="o"
                    look={{ x: -0.6, y: 0 }}
                  />
                </Cut>
              ) : null}
              <Cut>
                {t < 232.5 || t >= 233.1 ? <Pager x={pagerPlace.x} y={pagerPlace.y} buzz={buzz} t={t} /> : null}
                <Engineer x={x} y={exit.y} scale={0.82} pose={pose} />
                {hooked ? <Pager x={pagerPlace.x} y={pagerPlace.y} buzz t={t} /> : null}
                {t >= 230 ? <BadgeWalker x={badge.x} y={badge.y} scale={0.7} stride={badge.stride} /> : null}
              </Cut>
              {t >= 232.1 ? (
                <g transform={`translate(1650 ${mix(1000, 440, settle(t, 232.1, 9, 180))})`}>
                  <SadLady x={0} y={0} scale={0.7} />
                </g>
              ) : null}
              {t >= 233 ? (
                <g>
                  <Cut>
                    <Clippy
                      x={480}
                      y={898 + (1 - settle(t, 233, 9, 160)) * 300}
                      scale={0.6}
                      hat
                      bowtie
                      brows={0.9}
                      look={{ x: 1, y: -0.2 }}
                    />
                  </Cut>
                  <Balloon
                    x={500}
                    y={290}
                    width={480}
                    title={"It looks like you\u2019re leaving."}
                    tail={{ x: 490, y: 580 }}
                    pop={settle(t, 233.05, 10, 170)}
                  />
                </g>
              ) : null}
            </g>
          }
          light={<Spot x={x} y={860} rx={230} ry={70} />}
        />
      </Camera>
      {iris > 0 ? (
        <path
          d={`M0,0 H1920 V1080 H0 Z M${twirl.x - irisR},${twirl.y} a${irisR},${irisR} 0 1,0 ${irisR * 2},0 a${irisR},${irisR} 0 1,0 ${-irisR * 2},0 Z`}
          fill="#000"
          fillRule="evenodd"
        />
      ) : null}
    </Canvas>
  )
}
