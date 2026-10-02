import type { ReactNode } from "react"
import { Easing } from "remotion"
import { cards } from "../acts"
import { Crystal, PocketCrystal } from "../awards"
import { StudyGuide, studyGuideLegs } from "../cast/coaches"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { Lamp } from "../cast/lamp"
import { PaperDolls, Squirrel } from "../cast/walk-ons"
import { Choir } from "../choir"
import { during, fly, keys, mix, onTwos, ramp, settle } from "../motion"
import { Door } from "../office"
import { Camera, Canvas, Cut } from "../paper"
import { Plain, Sunset } from "../sets"
import { Spot, Theatre } from "../theatre"
import { font, gold, ink, paper, wood } from "../theme"
import { at } from "../timeline"
import { walk } from "../walk"

// Act V, The People: the bridge, played warm and straight. The crew under the stage, the stand-ups and specs, the
// paper-doll chain of colleagues and the hand held a beat too long, what was learned and built and cached, the crystal
// splitting the sunset, and the doors closing one by one until the Lamp clicks off.

const crew = "#3b2618"

// One of the crew under the stage, a silhouette turning a capstan or hauling a line.
const Hand = ({ x, y, t, i }: { x: number; y: number; t: number; i: number }) => {
  const heave = Math.sin(t * 3 + i)
  return (
    <g transform={`translate(${x} ${y})`} fill={crew}>
      <circle cy="-150" r="18" />
      <path d={`M-20,-130 Q-26,-60 -16,0 H16 Q26,-60 20,-130 Z`} />
      <path
        d={`M-18,-116 L${-46 + heave * 10},-80 M18,-116 L${46 + heave * 10},-80`}
        stroke={crew}
        strokeWidth="10"
        strokeLinecap="round"
      />
    </g>
  )
}

// The cutaway under the stage: the crew who hold the show up, a capstan, ropes, and one asleep under a pager at 3 a.m.
const Cutaway = ({ t }: { t: number }) => (
  <g>
    <rect x="150" y="430" width="1620" height="470" fill="#5a3a22" />
    <rect x="150" y="430" width="1620" height="470" fill="url(#crosshatch)" opacity="0.12" />
    <ellipse cx="960" cy="700" rx="700" ry="240" fill="#ffb347" opacity="0.14" />
    <rect x="150" y="400" width="1620" height="34" fill={wood.light} stroke={ink} strokeWidth="4" />
    {[300, 640, 980, 1320, 1660].map((x) => (
      <path key={x} d={`M${x},434 V900`} stroke={wood.deep} strokeWidth="18" />
    ))}
    <g transform={`translate(760 760) rotate(${t * 60})`}>
      <circle r="70" fill={wood.base} stroke={ink} strokeWidth="4" />
      {[0, 60, 120].map((a) => (
        <path key={a} d="M-110,0 H110" stroke={wood.dark} strokeWidth="12" transform={`rotate(${a})`} />
      ))}
    </g>
    {[680, 840].map((x, i) => (
      <Hand key={x} x={x} y={898} t={t} i={i} />
    ))}
    <path d={`M1180,434 V${720 + Math.sin(t * 3) * 20}`} stroke="#c9a86a" strokeWidth="6" />
    <Hand x={1180} y={898} t={t} i={2} />
    <path d="M1380,700 Q1500,760 1620,700" fill="none" stroke="#c9a86a" strokeWidth="5" />
    <path d="M1400,706 Q1500,750 1600,706 L1600,716 Q1500,770 1400,716 Z" fill="#7a5a3a" stroke={ink} strokeWidth="2" />
    <g transform="translate(1500 716)" fill={crew}>
      <ellipse cx="0" cy="-10" rx="70" ry="16" />
      <circle cx="-74" cy="-14" r="16" />
      <rect x="-16" y="-34" width="30" height="20" rx="4" fill="#1b1c1f" stroke={ink} strokeWidth="2" />
      <circle cx="8" cy="-24" r="3" fill="#e23b3b" />
    </g>
    <text
      x="1460"
      y="660"
      fontFamily={font.chalk}
      fontSize="30"
      fill={paper.light}
      opacity={Math.max(0, Math.sin(t * 2))}
    >
      z z z
    </text>
    <g transform="translate(530 540)" filter="url(#cut)">
      <circle r="56" fill={paper.light} stroke={wood.dark} strokeWidth="8" />
      <path d="M0,0 V-38 M0,0 L28,0" stroke={ink} strokeWidth="5" strokeLinecap="round" />
      <text y="40" textAnchor="middle" fontFamily={font.book} fontSize="21" fill={ink}>
        3 a.m.
      </text>
    </g>
  </g>
)

// An oval vignette in a gilt frame, faded in by `show`.
const Vignette = ({ x, y, show, children }: { x: number; y: number; show: number; children: ReactNode }) => (
  <g transform={`translate(${x} ${y}) scale(${0.8 * (0.85 + 0.15 * show)})`} opacity={show}>
    <ellipse rx="190" ry="150" fill="#fff4dc" stroke={gold.base} strokeWidth="14" />
    <ellipse rx="190" ry="150" fill="none" stroke={ink} strokeWidth="3" />
    <clipPath id={`vignette${x}`}>
      <ellipse rx="176" ry="136" />
    </clipPath>
    <g clipPath={`url(#vignette${x})`}>{children}</g>
  </g>
)

const Standup = ({ t }: { t: number }) => (
  <g>
    {[-128, -64, 0, 64, 128].map((x, i) => {
      // The ring of people seen from the front: the middle of it furthest back, so highest and smallest.
      const depth = Math.cos((x / 128) * (Math.PI / 2))
      const bob = Math.sin(t * 4 + i) * 3
      return (
        <g
          key={x}
          transform={`translate(${x} ${40 - depth * 22 + bob}) scale(${1 - depth * 0.12})`}
          fill={i % 2 === 0 ? "#4a3322" : "#7a5434"}
        >
          <circle cy="-74" r="15" />
          <path d="M-16,-56 Q-20,-20 -12,12 H12 Q20,-20 16,-56 Z" />
        </g>
      )
    })}
    <text y="120" textAnchor="middle" fontFamily={font.caps} fontSize="22" fill={ink}>
      The stand-up
    </text>
  </g>
)

const Specs = () => (
  <g>
    {[0, 1, 2, 3].map((i) => (
      <g key={i} transform={`translate(${i * 8 - 12} ${40 - i * 26}) rotate(${(i % 2 === 0 ? -1 : 1) * 4})`}>
        <rect x="-90" y="-50" width="180" height="110" fill="#fff" stroke={ink} strokeWidth="2.5" />
        <path d="M-70,-26 H70 M-70,-6 H50 M-70,14 H60" stroke="#9aa3ad" strokeWidth="3" />
      </g>
    ))}
    <rect x="40" y="-96" width="50" height="46" fill="#ffe27a" stroke={ink} strokeWidth="2" transform="rotate(8)" />
    <text y="120" textAnchor="middle" fontFamily={font.caps} fontSize="22" fill={ink}>
      The specs
    </text>
  </g>
)

const Loading = ({ t }: { t: number }) => (
  <g>
    <rect x="-150" y="-100" width="300" height="190" rx="10" fill="#f5f5fb" stroke={ink} strokeWidth="3" />
    <rect x="-150" y="-100" width="300" height="34" rx="10" fill="#5b5fc7" stroke={ink} strokeWidth="2" />
    <g transform={`translate(0 0) rotate(${t * 360})`}>
      {Array.from({ length: 8 }, (_, i) => (
        <circle
          key={i}
          cx={Math.cos((i / 8) * Math.PI * 2) * 30}
          cy={Math.sin((i / 8) * Math.PI * 2) * 30}
          r="6"
          fill="#5b5fc7"
          opacity={(i + 1) / 8}
        />
      ))}
    </g>
    <text y="120" textAnchor="middle" fontFamily={font.caps} fontSize="22" fill={ink}>
      Teams, loading
    </text>
  </g>
)

// Everything built, from the bottom up: the last few balanced on one small library, like the one holding up everything
// in the xkcd comic.
const lower = [
  "Windows Phone",
  "Microsoft Sales Compensation",
  "Microsoft Professional Program",
  "Microsoft Virtual Academy",
  "Project Lagro",
  "Career Coach",
  "Worldwide Learning R&D",
  "Enterprise Skills Initiative"
]
const keystone = "MSAL React"
const upper = ["School Data Sync", "Learning Activities", "Copilot Notebooks", "Study Guide"]
const projects = [...lower, keystone, ...upper]

const blockColors = ["#e9c46a", "#7fb3d5", "#e76f51", "#8ab17d", "#b39ddb", "#f4a261"]

// One project's block, as wide as its name, standing on (0, 0) once `place` has dropped it in from above.
const Block = ({ label, i, place, small = false }: { label: string; i: number; place: number; small?: boolean }) => {
  const height = small ? 28 : 44
  const width = small ? 108 : 64 + label.length * 9.6
  return (
    <g transform={`translate(0 ${-(1 - place) * 400})`} filter="url(#cut)">
      <rect
        x={-width / 2}
        y={-height}
        width={width}
        height={height}
        rx="4"
        fill={blockColors[i % blockColors.length]}
        stroke={ink}
        strokeWidth="3"
      />
      <text y={small ? -9 : -15} textAnchor="middle" fontFamily={font.caps} fontSize={small ? 16 : 22} fill={ink}>
        {label}
      </text>
    </g>
  )
}

// The tower of projects, a block at a time as `built` goes from 0 to 1. MSAL React sits off to one side of the block
// under it, and the more that's piled on it, the further the rest leans, teetering.
const Tower = ({ x, y, t, built }: { x: number; y: number; t: number; built: number }) => {
  const place = (i: number) => Math.min(1, Math.max(0, built * projects.length - i))
  const perch = { x: 56, y: -lower.length * 44 }
  const load = upper.reduce((sum, _, j) => sum + place(lower.length + 1 + j), 0) / upper.length
  const teeter = load * (2.5 + Math.sin(t * 3.2) * 1.5)
  return (
    <g transform={`translate(${x} ${y})`}>
      {lower.map((label, i) =>
        place(i) > 0 ? (
          <g key={label} transform={`translate(${i % 2 === 0 ? -6 : 6} ${-i * 44})`}>
            <Block label={label} i={i} place={place(i)} />
          </g>
        ) : null
      )}
      {place(lower.length) > 0 ? (
        <g transform={`translate(${perch.x} ${perch.y})`}>
          <Block label={keystone} i={lower.length} place={place(lower.length)} small />
        </g>
      ) : null}
      <g transform={`translate(${perch.x} ${perch.y - 28}) rotate(${teeter})`}>
        {upper.map((label, j) => {
          const i = lower.length + 1 + j
          return place(i) > 0 ? (
            <g key={label} transform={`translate(${j % 2 === 0 ? -4 : 4} ${-j * 44})`}>
              <Block label={label} i={i} place={place(i)} />
            </g>
          ) : null
        })}
      </g>
    </g>
  )
}

// The crystal held up to the sunset, splitting the light into a rainbow that sweeps across the stage.
const Rainbow = ({ x, y, spread }: { x: number; y: number; spread: number }) => (
  <g opacity={0.55 * spread} style={{ mixBlendMode: "screen" }}>
    {["#ff4d4d", "#ff9f40", "#ffe14d", "#5ee06b", "#4db8ff", "#7d6bff"].map((color, i) => (
      <path
        key={color}
        d={`M${x},${y} L${x + 1400 * spread},${y - 260 + i * 70 * spread} L${x + 1400 * spread},${y - 200 + (i + 1) * 70 * spread} Z`}
        fill={color}
      />
    ))}
  </g>
)

const doors = ["General", "Random", "Stand-up", "On-call", "Lunch?"]

export const Act5 = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const cutaway = t < at("standups")
  const sunset = t >= 188.4

  const camera = {
    scale: keys(t, [
      [179.9, 1],
      [180.5, 1.3],
      [184.3, 1.3],
      [184.58, 1]
    ]),
    x: keys(t, [
      [179.9, 960],
      [180.5, 630],
      [184.3, 630],
      [184.58, 960]
    ]),
    y: keys(t, [
      [179.9, 540],
      [180.5, 620],
      [184.3, 620],
      [184.58, 540]
    ])
  }

  const vignette = (k: number) => settle(t, [172.6, 173.4, 174.1][k] ?? 172, 12, 120) * (1 - ramp(t, 176.2, 176.48))
  const unfold =
    ramp(t, 176.7, 179.4, Easing.inOut(Easing.sin)) * (1 - ramp(t, 182.44, 183.6, Easing.inOut(Easing.sin)))
  const flash = ramp(s, 185.1, 185.3)
  const cardOut = ramp(s, 185.55, 185.85, Easing.in(Easing.cubic))
  const built = ramp(t, 185.65, 186.75, Easing.linear)
  const squirrel = ramp(s, 186.6, 187, Easing.out(Easing.cubic)) * (1 - ramp(s, 188.25, 188.6, Easing.in(Easing.cubic)))
  const acorns = Math.min(3, Math.max(0, Math.floor((t - 187) / 0.3)))
  const crystalUp = ramp(s, 189, 189.6) * (1 - ramp(s, 192, 192.4))
  // From the dolls across to the castle, as the camera pulls back; later a step aside to close the last door.
  const crossing = walk(s, { from: 184, to: 184.8, x0: 490, x1: 700, steps: 3 })
  // Study Guide walks on out of shot while the camera's still in on the dolls.
  const guide = walk(t, {
    from: 184,
    to: 185.2,
    x0: 1850,
    x1: 1400,
    steps: 7,
    scale: 0.74,
    build: studyGuideLegs,
    stance: -1
  })
  const sidle = walk(s, { from: 196.6, to: 197.2, x0: 700, x1: 650, steps: 2, gait: "side" })
  const footing = t < at("closeTeams") ? crossing : sidle
  const spread = ramp(t, 189.9, 191.2, Easing.out(Easing.cubic)) * (1 - ramp(t, 192, 192.4))
  const shut = (k: number) =>
    ramp(
      s,
      [193.86, 194.72, 195.68, 196.48, 197.3][k] ?? 199,
      ([193.86, 194.72, 195.68, 196.48, 197.3][k] ?? 199) + 0.3
    )
  const narrow = ramp(t, 194.8, 198.4)
  const blackout = t >= at("blackout")

  // The pocket from here on: the crystal, unless it's held up, and whatever acorns the squirrel has left.
  const stash = (
    <g>
      {crystalUp > 0.5 ? null : <PocketCrystal t={t} />}
      {Array.from({ length: acorns }, (_, i) => (
        <ellipse key={i} cx={-4 + i * 9} cy={-6 - i * 4} rx="7" ry="9" fill="#b58a3c" stroke={ink} strokeWidth="1.5" />
      ))}
    </g>
  )
  let pose: EngineerPose = {
    armR: 24,
    cane: { hand: "right", angle: 4 },
    armL: 18,
    headset: "neck",
    mouth: "smile",
    look: { x: 0.4, y: 0.2 }
  }
  if (cutaway) {
    pose = {
      ...pose,
      armL: 40,
      elbowL: 30,
      armR: 40,
      cane: { hand: "right", angle: 30 },
      look: { x: 0.3, y: 1 },
      tilt: 10
    }
  } else if (t < at("people")) {
    pose = { ...pose, look: { x: 1, y: -0.4 } }
  } else if (t < at("learned")) {
    pose = {
      ...pose,
      armR: mix(90, 24, ramp(s, 183.4, 183.9)),
      elbowR: 10,
      openR: true,
      cane: { hand: "left", angle: 4 },
      armL: 16,
      look: { x: 1, y: 0 },
      mouth: t > 182.44 ? "sad" : "smile"
    }
  } else if (t < at("tenGoodYears")) {
    pose = {
      ...pose,
      pocket: stash,
      look: t > 186.6 ? { x: 1, y: 0.6 } : { x: 0.8, y: -0.5 }
    }
  } else if (t < at("closeTeams")) {
    pose = {
      ...pose,
      armL: mix(18, 165, crystalUp),
      elbowL: mix(10, 0, crystalUp),
      openL: true,
      holdL: crystalUp > 0.5 ? <Crystal x={0} y={-4} scale={0.5} /> : undefined,
      pocket: stash,
      look: { x: -0.4, y: -1 },
      mouth: "smile"
    }
  } else {
    const closing = ramp(s, 197.2, 197.6)
    pose = {
      ...pose,
      armR: 20,
      armL: Math.max(mix(20, 100, closing), mix(18, 165, crystalUp)),
      elbowL: 0,
      cane: { hand: "left", angle: mix(10, 96, closing), grip: mix(0, 0.95, closing) },
      pocket: stash,
      look: { x: -1, y: 0 },
      mouth: "smile"
    }
  }
  if (!cutaway) {
    pose = { ...pose, stride: footing.stride }
  }
  const engineerX = (() => {
    if (cutaway) {
      return 760
    }
    return footing.x
  })()

  return (
    <Canvas>
      <Camera scale={camera.scale} look={{ x: camera.x, y: camera.y }}>
        <Theatre
          card={cards.act5}
          dark={blackout ? 1 : 0}
          lit={blackout ? 0 : 1}
          boxes={{ left: <Choir t={t} side="left" mood="watch" />, right: <Choir t={t} side="right" mood="watch" /> }}
          backdrop={
            <g>
              <Plain color="#3a2a2e" />
              {sunset ? (
                <g transform={`translate(0 ${(1 - ramp(t, 188.4, 189, Easing.out(Easing.cubic))) * -800})`}>
                  <Sunset sink={ramp(t, 189, 198)} />
                </g>
              ) : null}
            </g>
          }
          stage={
            <g>
              {cutaway ? <Cutaway t={t} /> : null}
              {during(t, at("standups"), at("people")) ? (
                <g>
                  <Vignette x={640} y={470} show={vignette(0)}>
                    <Standup t={t} />
                  </Vignette>
                  <Vignette x={960} y={470} show={vignette(1)}>
                    <Specs />
                  </Vignette>
                  <Vignette x={1280} y={470} show={vignette(2)}>
                    <Loading t={t} />
                  </Vignette>
                </g>
              ) : null}
              {during(t, at("people"), at("learned")) ? (
                <PaperDolls x={570} y={898} scale={1.2} count={12} unfold={unfold} />
              ) : null}
              {during(t, 184, at("tenGoodYears") + 0.1) ? (
                <g opacity={1 - ramp(t, at("tenGoodYears") - 0.25, at("tenGoodYears") + 0.1)}>
                  <Cut>
                    <StudyGuide
                      x={guide.x}
                      y={guide.y}
                      scale={0.74}
                      stride={guide.stride}
                      armL={150}
                      armR={40}
                      mouth="smile"
                    />
                  </Cut>
                </g>
              ) : null}
              {during(t, at("learned"), at("tenGoodYears") + 0.1) ? (
                <g opacity={1 - ramp(t, at("tenGoodYears") - 0.25, at("tenGoodYears") + 0.1)}>
                  <g
                    transform={`translate(1180 ${380 - cardOut * 700}) scale(${Math.abs(1 - 2 * flash)} 1)`}
                    filter="url(#cut)"
                  >
                    <rect
                      x="-170"
                      y="-90"
                      width="340"
                      height="180"
                      rx="12"
                      fill={flash < 0.5 ? "#fff" : "#fff4b8"}
                      stroke={ink}
                      strokeWidth="4"
                    />
                    <text y="16" textAnchor="middle" fontFamily={font.book} fontSize={flash < 0.5 ? 34 : 64} fill={ink}>
                      {flash < 0.5 ? "What did you learn?" : "A lot."}
                    </text>
                  </g>
                  <Tower x={1080} y={898} t={t} built={built} />
                  {squirrel > 0 ? (
                    <Squirrel
                      x={mix(1900, engineerX + 110, squirrel)}
                      y={898}
                      scale={0.9}
                      flip
                      wink={t > 188.1}
                      acorn={t < 187.9}
                    />
                  ) : null}
                </g>
              ) : null}
              {t >= at("closeTeams") ? (
                <g transform={`translate(0 ${fly(t, at("closeTeams"), Number.POSITIVE_INFINITY, 700)})`}>
                  {doors.map((label, k) => (
                    <Door key={label} x={520 + k * 240} y={820} scale={0.72} open={1 - shut(4 - k)} label={label} />
                  ))}
                </g>
              ) : null}
              <Cut>
                <Engineer x={engineerX} y={cutaway ? 400 : footing.y} scale={cutaway ? 0.55 : 0.8} pose={pose} />
              </Cut>
              {during(t, at("tenGoodYears"), at("closeTeams")) ? (
                <Rainbow x={engineerX - 70} y={898 - 370} spread={spread} />
              ) : null}
            </g>
          }
          front={
            cutaway ? undefined : (
              <Cut>
                <Lamp
                  x={1590}
                  y={898}
                  scale={0.8}
                  flip
                  lean={-14}
                  aim={-70 - narrow * 10}
                  beam={blackout ? 0 : 280}
                  look={{ x: -0.6, y: 0.3 }}
                />
              </Cut>
            )
          }
          light={
            <g>
              <rect
                x="150"
                y="130"
                width="1620"
                height="780"
                fill="#ffb347"
                opacity="0.1"
                style={{ mixBlendMode: "screen" }}
              />
              {t >= at("closeTeams") ? (
                <path
                  d={`M150,130 H1770 V910 H150 Z M${engineerX - mix(700, 130, narrow)},880 a${mix(700, 130, narrow)},${mix(260, 50, narrow)} 0 1,0 ${mix(1400, 260, narrow)},0 a${mix(700, 130, narrow)},${mix(260, 50, narrow)} 0 1,0 ${-mix(1400, 260, narrow)},0 Z`}
                  fill="#000"
                  fillRule="evenodd"
                  opacity={0.8 * narrow}
                />
              ) : null}
              <Spot x={engineerX} y={cutaway ? 400 : 870} rx={mix(320, 140, narrow)} ry={70} />
            </g>
          }
        />
      </Camera>
    </Canvas>
  )
}
