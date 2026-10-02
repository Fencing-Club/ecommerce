import { Easing } from "remotion"
import { cards } from "../acts"
import { LoopBadge, Quartet } from "../cast/activities"
import { Clippy } from "../cast/clippy"
import { Copilot } from "../cast/copilot"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { Choir } from "../choir"
import { during, hop, mix, onTwos, ramp, settle, shake } from "../motion"
import { BankerLamp, Chair, Desk, Laptop, TeamsWall } from "../office"
import { Camera, Canvas, Cut } from "../paper"
import { Spot, Theatre } from "../theatre"
import { font, gold, ink, paper, wood } from "../theme"
import { at, beats } from "../timeline"
import { walk } from "../walk"

// Act I, the pre-chorus: one final commit, deploy and meeting, each dropped into Fill in the Blank's sign. The deploy
// is a circus cannon with Clippy in it; the meeting is an invite on bat wings that the Engineer fences with the cane
// until sixteen tons of DECLINED land on it.

const sign = { x: 1120, y: 420 }
const desk = 600
const cannon = { x: 1500, y: 802 }
// The cannon's muzzle, up and to the left of its wheel.
const muzzle = { x: cannon.x - 185, y: cannon.y - 99 }
const words = [
  { word: "commit", from: at("commit") + 0.78, to: at("deploy") - 0.1 },
  { word: "deploy", from: at("deploy") + 0.82, to: at("meeting") - 0.1 },
  { word: "meeting", from: at("meeting") + 0.8, to: 49.9 }
] as const

// Fill in the Blank's sign: "One final ______." on a pole, the word of the moment dropped into the blank.
const Sign = ({ t, up }: { t: number; up: number }) => (
  <g transform={`translate(${sign.x} ${sign.y + (1 - up) * 600})`}>
    <path d="M0,60 V420" stroke={wood.dark} strokeWidth="12" />
    <g filter="url(#cut)">
      <rect x="-250" y="-70" width="500" height="140" rx="10" fill={paper.light} stroke={ink} strokeWidth="4" />
      <rect x="-250" y="-70" width="500" height="34" rx="10" fill="#4f6bed" stroke={ink} strokeWidth="3" />
      <text x="-230" y="-45" fontFamily={font.sans} fontWeight="700" fontSize="20" fill="#fff">
        Fill in the Blank
      </text>
      <LoopBadge x={222} y={-53} size={0.9} />
      <text x="-220" y="38" fontFamily={font.book} fontSize="50" fill={ink}>
        One final
      </text>
      <path d="M-10,46 H220" stroke={ink} strokeWidth="4" />
    </g>
    {words.map(({ word, from, to }) => {
      const drop = settle(t, from, 9, 200)
      const lift = ramp(t, to, to + 0.3, Easing.in(Easing.cubic))
      return t > from - 0.01 && t < to + 0.3 ? (
        <text
          key={word}
          x="105"
          y={mix(-420, 38, drop) - lift * 500}
          textAnchor="middle"
          fontFamily={font.chalk}
          fontSize="56"
          fill="#2e5cb8"
        >
          {word}
        </text>
      ) : null
    })}
    {during(t, 41.7, 42.3) ? (
      <g transform={`rotate(-12) scale(${mix(2.2, 1, settle(t, 41.7, 12, 300))})`} opacity={1 - ramp(t, 42.1, 42.3)}>
        <rect x="-224" y="-44" width="448" height="88" rx="6" fill="none" stroke="#c0161c" strokeWidth="8" />
        <text
          y="19"
          textAnchor="middle"
          fontFamily={font.poster}
          fontSize="52"
          fill="#c0161c"
          textLength="380"
          lengthAdjust="spacingAndGlyphs"
        >
          COMMITTED
        </text>
      </g>
    ) : null}
  </g>
)

// The circus cannon, its barrel cocked up to the left, with DEPLOY painted along it; it recoils by `kick`.
const Cannon = ({ x, y, kick }: { x: number; y: number; kick: number }) => (
  <g transform={`translate(${x + kick * 30} ${y})`} filter="url(#cut)">
    <g transform="rotate(28)">
      <path
        d="M-210,-40 L60,-56 L60,56 L-210,40 Z"
        fill="#b3202a"
        stroke={ink}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <ellipse cx="-210" cy="0" rx="16" ry="40" fill="#1a1414" stroke={ink} strokeWidth="3" />
      {[-196, -20].map((bx) => (
        <rect key={bx} x={bx} y="-54" width="14" height="108" fill={gold.base} stroke={ink} strokeWidth="2" />
      ))}
      <text
        x="-100"
        y="14"
        textAnchor="middle"
        fontFamily={font.poster}
        fontSize="38"
        fill={gold.light}
        stroke={ink}
        strokeWidth="1.5"
        textLength="140"
        lengthAdjust="spacingAndGlyphs"
      >
        DEPLOY
      </text>
    </g>
    <circle cx="40" cy="40" r="56" fill={wood.base} stroke={ink} strokeWidth="4" />
    {Array.from({ length: 8 }, (_, i) => (
      <path
        key={i}
        d={`M40,40 L${40 + Math.cos((i / 8) * Math.PI * 2) * 52},${40 + Math.sin((i / 8) * Math.PI * 2) * 52}`}
        stroke={wood.dark}
        strokeWidth="6"
      />
    ))}
    <circle cx="40" cy="40" r="12" fill={gold.base} stroke={ink} strokeWidth="3" />
  </g>
)

// The meeting invite: an Outlook card on bat wings, flapping with `t`.
const Invite = ({ x, y, t, squash, scale }: { x: number; y: number; t: number; squash: number; scale: number }) => {
  const flap = Math.sin(t * 16) * 22
  return (
    <g transform={`translate(${x} ${y}) scale(${scale * (1 + squash * 0.6)} ${scale * (1 - squash * 0.9)})`}>
      {[-1, 1].map((side) => (
        <path
          key={side}
          d={`M${side * 120},-40 Q${side * 230},${-140 + flap} ${side * 320},${-60 + flap} Q${side * 280},${-30 + flap} ${side * 260},${10 + flap} Q${side * 220},${-20 + flap} ${side * 190},${20 + flap} Q${side * 160},-10 ${side * 120},20 Z`}
          fill="#3a2a4a"
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      ))}
      <g filter="url(#cut)">
        <rect x="-150" y="-110" width="300" height="220" rx="8" fill="#fbfbfb" stroke={ink} strokeWidth="4" />
        <rect x="-150" y="-110" width="300" height="46" rx="8" fill="#0f6cbd" stroke={ink} strokeWidth="3" />
        <text x="-134" y="-79" fontFamily={font.sans} fontWeight="700" fontSize="24" fill="#fff">
          Quick sync
        </text>
        <text x="-134" y="-28" fontFamily={font.sans} fontSize="22" fill={ink}>
          2 hrs, 14 attendees
        </text>
        <text x="-134" y="6" fontFamily={font.sans} fontSize="18" fill="#6b6b6b">
          Recurring, forever
        </text>
        {["Accept", "Maybe", "Decline"].map((label, i) => (
          <g key={label} transform={`translate(${-134 + i * 92} 40)`}>
            <rect width="84" height="36" rx="5" fill={i === 0 ? "#0f6cbd" : "#e6e6e6"} stroke={ink} strokeWidth="2" />
            <text x="42" y="24" textAnchor="middle" fontFamily={font.sans} fontSize="16" fill={i === 0 ? "#fff" : ink}>
              {label}
            </text>
          </g>
        ))}
      </g>
      <circle cx="-40" cy="-130" r="14" fill="#fff" stroke={ink} strokeWidth="3" />
      <circle cx="40" cy="-130" r="14" fill="#fff" stroke={ink} strokeWidth="3" />
      <circle cx="-36" cy="-128" r="6" fill={ink} />
      <circle cx="36" cy="-128" r="6" fill={ink} />
      <path d="M-60,-150 L-24,-140 M60,-150 L24,-140" stroke={ink} strokeWidth="5" strokeLinecap="round" />
    </g>
  )
}

// Sixteen tons, stamped DECLINED, on a rope from the flies.
const Weight = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M0,-260 V-1200" stroke={ink} strokeWidth="4" />
    <path d="M-30,-260 Q0,-300 30,-260" fill="none" stroke={ink} strokeWidth="10" />
    <g filter="url(#cut)">
      <path d="M-120,-260 H120 L170,0 H-170 Z" fill="#2c2c30" stroke={ink} strokeWidth="5" strokeLinejoin="round" />
      <text y="-150" textAnchor="middle" fontFamily={font.poster} fontSize="56" fill="#e8e4da">
        16 TONS
      </text>
      <g transform="translate(0 -70) rotate(-8)">
        <rect x="-130" y="-30" width="260" height="56" fill="none" stroke="#e23b3b" strokeWidth="6" />
        <text y="16" textAnchor="middle" fontFamily={font.poster} fontSize="40" fill="#e23b3b" letterSpacing="3">
          DECLINED
        </text>
      </g>
    </g>
  </g>
)

export const PreChorus = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const b = beats(s)
  const quartetUp = settle(s, at("commit"), 10, 160) * (1 - ramp(s, 45.5, 46, Easing.in(Easing.back(1.5))))
  const cannonIn = ramp(s, 42.35, 42.9, Easing.out(Easing.cubic)) * (1 - ramp(s, 44.6, 45.2, Easing.in(Easing.cubic)))
  const fire = 43.4
  const flight = ramp(t, fire, 44.1, Easing.linear)
  const clippyInCannon = t > 42.85 && t < fire
  const invite = (() => {
    const swoop = ramp(t, 45.3, 46.3, Easing.out(Easing.cubic))
    const lunge = t > 46.3 ? Math.max(0, Math.sin(Math.PI * (b - beats(46.3)))) * 60 : 0
    const rear = ramp(t, 48.7, 49.5, Easing.inOut(Easing.cubic))
    return { x: mix(2100, 1260, swoop) - lunge, y: mix(260, 560, swoop) - rear * 120, scale: 0.8 + rear * 0.35 }
  })()
  const weight = ramp(t, 49.45, 49.62, Easing.in(Easing.quad))
  const squashed = t >= 49.62 ? settle(t, 49.62, 8, 300) : 0

  // The Engineer steps back from the log-off to conduct the quartet with the cane, then fences the invite.
  const conduct = Math.sin(Math.PI * b)
  const retreat = walk(s, { from: 40.72, to: 41.6, x0: 980, x1: 860, steps: 3, gait: "back" })
  const advance = walk(s, { from: 45.3, to: 46, x0: 860, x1: 900, steps: 2, gait: "side", lunge: 50 })
  const footing = t < 45.3 ? retreat : advance
  // The bounce on the beat stops while his feet are busy.
  const steady = Math.max(
    ramp(t, 40.55, 40.72) * (1 - ramp(t, 41.6, 41.8)),
    ramp(t, 45.15, 45.3) * (1 - ramp(t, 46, 46.2))
  )
  let pose: EngineerPose = {
    armR: 120 + conduct * 20,
    elbowR: 20,
    cane: { hand: "right", angle: 150 + conduct * 30, grip: 0.4 },
    armL: 40,
    elbowL: 30,
    openL: true,
    stride: footing.stride,
    mouth: "sing",
    look: { x: 0.8, y: -0.4 }
  }
  if (t >= 43.3 && t < 44.4) {
    pose = {
      ...pose,
      armR: 90,
      cane: { hand: "right", angle: 70, grip: 0.4 },
      mouth: "o",
      look: { x: -0.6 + flight * -0.4, y: -0.8 }
    }
  }
  if (t >= 45.3) {
    const parry = Math.floor(b * 2) % 2 === 0
    pose = {
      armR: parry ? 80 : 100,
      elbowR: parry ? 10 : -10,
      cane: { hand: "right", angle: parry ? 70 : 105, grip: 0.95 },
      armL: 150,
      elbowL: 60,
      openL: true,
      stride: footing.stride,
      mouth: "grin",
      look: { x: 1, y: -0.3 }
    }
  }
  if (t >= 49.62) {
    pose = {
      armR: 160,
      elbowR: 140,
      openR: true,
      armL: 20,
      cane: { hand: "left", angle: 6 },
      mouth: "smile",
      look: { x: 0, y: 0 }
    }
  }

  return (
    <Canvas>
      <Camera>
        <Theatre
          card={cards.act1}
          boxes={{ left: <Choir t={t} side="left" mood="watch" />, right: <Choir t={t} side="right" mood="watch" /> }}
          backdrop={<TeamsWall lit={6} t={t} />}
          stage={
            <g>
              <Cut>
                <Chair x={desk} y={894} scale={0.95} />
                <Copilot
                  x={desk}
                  y={868 - (t > 43.9 && t < 44.4 ? 40 : 0)}
                  scale={0.62}
                  armL={t > 43.8 && t < 44.6 ? 160 : 40}
                  armR={t > 43.8 && t < 44.6 ? 160 : 60 + Math.sin(t * 14) * 10}
                  mouth={t > 43.8 && t < 44.6 ? "o" : "grin"}
                  look={t > 43.4 && t < 44.6 ? { x: 1, y: -1 } : { x: 0.6, y: 0.2 }}
                />
              </Cut>
              <Desk x={desk} y={898} />
              <Cut>
                <BankerLamp x={desk - 110} y={748} on={0} />
                <Laptop x={desk + 92} y={748} scale={0.8} glow={1} />
                {t >= 44.1 ? (
                  <Clippy x={desk - 40} y={748} scale={0.3} hat bowtie brows={-0.4} look={{ x: 1, y: 0 }} />
                ) : null}
              </Cut>
              <Sign t={t} up={quartetUp} />
              <Cut>
                <Quartet x={sign.x} y={898 + (1 - quartetUp) * 380} scale={0.62} mouth="sing" />
                <Engineer x={footing.x} y={footing.y - hop(t) * 6 * (1 - steady)} scale={0.8} pose={pose} />
              </Cut>
              {cannonIn > 0 ? (
                <g>
                  {clippyInCannon ? (
                    <Clippy
                      x={muzzle.x + (1 - cannonIn) * 400}
                      y={mix(400, muzzle.y + 40, ramp(t, 42.85, 43.05))}
                      scale={0.32}
                      hat
                      bowtie
                      mouth="o"
                    />
                  ) : null}
                  <Cannon
                    x={mix(cannon.x + 400, cannon.x, cannonIn)}
                    y={cannon.y}
                    kick={t > fire ? Math.max(0, 1 - (t - fire) * 4) : 0}
                  />
                </g>
              ) : null}
              {t >= fire && t < 44.1 ? (
                <Cut>
                  <Clippy
                    x={mix(muzzle.x, desk - 40, flight)}
                    y={mix(muzzle.y, 748, flight) - Math.sin(flight * Math.PI) * 480}
                    scale={0.32}
                    rotate={flight * -540}
                    hat
                    bowtie
                    mouth="o"
                  />
                </Cut>
              ) : null}
              {t >= fire && t < fire + 0.6 ? (
                <g opacity={1 - (t - fire) / 0.6} fill="#f4efe4" stroke={ink} strokeWidth="3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <circle
                      key={i}
                      cx={muzzle.x - 20 - i * 30 - (t - fire) * 200}
                      cy={muzzle.y - 30 - i * 14}
                      r={30 + (t - fire) * 90}
                    />
                  ))}
                </g>
              ) : null}
            </g>
          }
          front={
            <g>
              {t >= 45.2 ? (
                <Cut>
                  <Invite x={invite.x} y={invite.y + squashed * 300} t={t} squash={squashed} scale={invite.scale} />
                </Cut>
              ) : null}
              {t >= 49.4 ? (
                <Weight x={1260} y={mix(-300, 898 - squashed * 20, weight) + shake(t, t > 49.62 && t < 49.9 ? 4 : 0)} />
              ) : null}
              {t >= 49.62 && t < 50.1 ? (
                <g opacity={1 - (t - 49.62) / 0.48} fill={paper.shade} stroke={ink} strokeWidth="2">
                  {[-1, 1].map((side) =>
                    [0, 1, 2].map((i) => (
                      <circle
                        key={`${side}${i}`}
                        cx={1260 + side * (190 + (t - 49.62) * 300 + i * 30)}
                        cy={880 - i * 10}
                        r={22 + i * 6}
                      />
                    ))
                  )}
                </g>
              ) : null}
            </g>
          }
          light={
            <g>
              <Spot x={900} y={870} rx={220} ry={60} />
              <Spot x={sign.x} y={860} rx={260} ry={70} />
            </g>
          }
        />
      </Camera>
    </Canvas>
  )
}
