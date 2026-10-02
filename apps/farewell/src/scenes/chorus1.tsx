import { Easing, random } from "remotion"
import { cards } from "../acts"
import { Agent } from "../cast/agent"
import { Clippy } from "../cast/clippy"
import { ReadingCoach } from "../cast/coaches"
import { Copilot, Sparkle } from "../cast/copilot"
import { Duck } from "../cast/duck"
import { Engineer, type EngineerPose } from "../cast/engineer"
import { Octocat } from "../cast/octocat"
import { SadLady } from "../cast/sad-lady"
import { NinjaCat, Unicorn, unicornLegs } from "../cast/unicorn"
import { BadgeWalker, badgeLegs } from "../cast/walk-ons"
import { WindowsPhone } from "../cast/windows-phone"
import { Choir } from "../choir"
import { KickLine } from "../company"
import { during, hop, keys, mix, onTwos, ramp, settle, shake } from "../motion"
import { Beetle, BuildTower } from "../office"
import { Camera, Canvas, Cut } from "../paper"
import { Say } from "../props"
import { ChorusCloth } from "../sets"
import { HouseCurtain, Spot, Theatre } from "../theatre"
import { font, gold, ink, paper, velvet, wood } from "../theme"
import { at } from "../timeline"
import { walk } from "../walk"

// Act I, the first chorus: the kick line, the prompt engine, the bug that only dances for the Engineer, the
// acronyms, ten years of calendar, and the badge walking out.

// The prompt engine: a boiler with a hopper on top, fed a prompt as long as you like, shaking while it `works`.
const PromptEngine = ({ x, y, works, t, swing }: { x: number; y: number; works: number; t: number; swing: number }) => (
  <g transform={`translate(${x + shake(t, works * 4)} ${y})`}>
    <g filter="url(#cut)" strokeLinejoin="round">
      <rect x="-150" y="-230" width="300" height="230" rx="20" fill="#5b6f7a" stroke={ink} strokeWidth="4" />
      {[-110, -40, 30, 100].map((rx) => (
        <circle key={rx} cx={rx} cy="-30" r="6" fill={gold.base} stroke={ink} strokeWidth="1.5" />
      ))}
      <path d="M-90,-230 L-120,-330 H20 L-10,-230 Z" fill="#7a8a94" stroke={ink} strokeWidth="4" />
      <text x="-55" y="-286" textAnchor="middle" fontFamily={font.poster} fontSize="22" fill={paper.light}>
        PROMPT
      </text>
      <rect x="70" y="-380" width="44" height="150" fill="#3a4248" stroke={ink} strokeWidth="4" />
      <circle cx="0" cy="-120" r="56" fill={paper.light} stroke={ink} strokeWidth="4" />
      <text y="-108" textAnchor="middle" fontFamily={font.caps} fontSize="26" fill={ink}>
        {Math.floor(works * 99999).toLocaleString("en-US")}
      </text>
      <text y="-80" textAnchor="middle" fontFamily={font.book} fontSize="18" fill={velvet.dark}>
        tokens
      </text>
    </g>
    <g transform={`translate(150 -100) rotate(${-swing * 80})`}>
      <rect x="0" y="-10" width="190" height="20" fill="#9aa3ad" stroke={ink} strokeWidth="3" />
      <rect x="170" y="-30" width="40" height="60" fill="#5b6f7a" stroke={ink} strokeWidth="3" />
    </g>
    {works > 0 ? (
      <g fill="#f4efe4" stroke={ink} strokeWidth="2.5" opacity="0.9">
        {[0, 1, 2].map((i) => {
          const rise = (t * 1.4 + i / 3) % 1
          return <circle key={i} cx={92 + rise * 40} cy={-400 - rise * 160} r={18 + rise * 40} opacity={1 - rise} />
        })}
      </g>
    ) : null}
  </g>
)

// A giant keyboard laid on the stage, its keys going down wherever the bug's feet are.
const Keyboard = ({ x, y, bugX }: { x: number; y: number; bugX: number }) => (
  <g transform={`translate(${x} ${y})`} filter="url(#cut)">
    <path d="M-330,0 L-300,-70 H300 L330,0 Z" fill="#2e3138" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
    {[0, 1, 2].map((row) =>
      Array.from({ length: 12 - row }, (_, i) => {
        const kx = -290 + row * 18 + i * 50
        const down = Math.abs(kx + 20 - (bugX - x)) < 40 && row === 0 ? 4 : 0
        return (
          <rect
            key={`${row}-${i}`}
            x={kx}
            y={-64 + row * 20 + down}
            width="42"
            height="16"
            rx="3"
            fill="#e8e6df"
            stroke={ink}
            strokeWidth="1.5"
          />
        )
      })
    )}
  </g>
)

const acronyms = ["S360", "SFI", "IcM", "DRI", "OCE", "OKR", "MAU", "RTO", "OOF"]

// The wooden blocks the acronyms come in, dropped from the flies and bouncing to rest.
const Acronyms = ({ t }: { t: number }) => (
  <g>
    {acronyms.map((word, i) => {
      const start = at("acronyms") + i * 0.11
      const land = settle(t, start, 7, 120)
      const x = 470 + i * 125 + (random(`ax${i}`) - 0.5) * 16
      const restY = 880 - (i % 3) * 6
      return t > start ? (
        <g
          key={word}
          transform={`translate(${x} ${mix(-100, restY, land)}) rotate(${(random(`ar${i}`) - 0.5) * 30 * land})`}
          filter="url(#cut)"
        >
          <rect
            x="-56"
            y="-80"
            width="112"
            height="80"
            rx="6"
            fill={["#e9c46a", "#7fb3d5", "#e76f51", "#8ab17d"][i % 4]}
            stroke={ink}
            strokeWidth="3"
          />
          <text y="-28" textAnchor="middle" fontFamily={font.poster} fontSize="32" fill={ink}>
            {word}
          </text>
        </g>
      ) : null
    })}
  </g>
)

const pages: readonly { year: string; caption: string }[] = [
  { year: "2016", caption: "Ninja Cat" },
  { year: "2017", caption: "Teams" },
  { year: "2018", caption: "GitHub" },
  { year: "2019", caption: "Update README" },
  { year: "2020", caption: "You\u2019re on mute" },
  { year: "2021", caption: "Windows 11" },
  { year: "2022", caption: "Goodbye, IE" },
  { year: "2023", caption: "Copilot" },
  { year: "2024", caption: "The Copilot key" },
  { year: "2025", caption: "Goodbye, Skype" },
  { year: "2026", caption: "Agents" }
]

// The picture on each calendar page, drawn about its middle.
const PageArt = ({ i }: { i: number }) => {
  if (i === 0) {
    return <NinjaCat x={0} y={40} scale={1.3} />
  }
  if (i === 1) {
    return (
      <g>
        <rect x="-60" y="-60" width="120" height="120" rx="16" fill="#5b5fc7" stroke={ink} strokeWidth="4" />
        <text y="38" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="96" fill="#fff">
          T
        </text>
      </g>
    )
  }
  if (i === 2) {
    return <Octocat x={0} y={80} scale={0.55} />
  }
  if (i === 3) {
    return (
      <g>
        <rect x="-110" y="-50" width="220" height="100" fill="#fff" stroke={ink} strokeWidth="3" />
        <rect x="-110" y="-50" width="8" height="100" fill="#e8a33d" />
        <text x="-90" y="-10" fontFamily={font.sans} fontWeight="700" fontSize="24" fill={ink}>
          Update README
        </text>
        <text x="-90" y="26" fontFamily={font.sans} fontSize="18" fill="#6b6b6b">
          Active
        </text>
      </g>
    )
  }
  if (i === 4) {
    return (
      <g>
        <rect x="-140" y="-30" width="280" height="60" rx="30" fill="#c4314b" stroke={ink} strokeWidth="3" />
        <text y="10" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="26" fill="#fff">
          {"You\u2019re on mute"}
        </text>
      </g>
    )
  }
  if (i === 5) {
    return (
      <g>
        {[0, 1, 2, 3].map((k) => (
          <rect
            key={k}
            x={-62 + (k % 2) * 64}
            y={-62 + Math.floor(k / 2) * 64}
            width="60"
            height="60"
            fill="#1f8ff0"
            stroke={ink}
            strokeWidth="3"
          />
        ))}
      </g>
    )
  }
  if (i === 6) {
    return (
      <g>
        <text y="44" textAnchor="middle" fontFamily={font.title} fontSize="150" fill="#2b7bd4">
          e
        </text>
        <path d="M-70,-50 L70,40 M-62,-58 L78,32" stroke={ink} strokeWidth="10" />
      </g>
    )
  }
  if (i === 7) {
    return <Copilot x={0} y={110} scale={0.42} sparkle={false} />
  }
  if (i === 8) {
    return (
      <g>
        <rect x="-64" y="-60" width="128" height="120" rx="14" fill="#2e3138" stroke={ink} strokeWidth="4" />
        <rect x="-50" y="-48" width="100" height="84" rx="10" fill="#4a4e57" />
        <Sparkle x={0} y={-6} size={30} fill="#9fd3ff" />
      </g>
    )
  }
  if (i === 9) {
    return (
      <g>
        <path d="M-70,60 V-20 Q-70,-80 0,-80 Q70,-80 70,-20 V60 Z" fill="#b8b8bc" stroke={ink} strokeWidth="4" />
        <text y="0" textAnchor="middle" fontFamily={font.title} fontSize="34" fill={ink}>
          R.I.P.
        </text>
        <text y="38" textAnchor="middle" fontFamily={font.sans} fontWeight="700" fontSize="44" fill="#00aff0">
          S
        </text>
      </g>
    )
  }
  return <Agent x={0} y={120} scale={0.6} armL={150} armR={150} />
}

// The tear-off calendar for "ten years went by": a page a half-beat, the last landing on "true".
const Calendar = ({ t }: { t: number }) => {
  const from = at("tenYearsWent") + 0.2
  const step = 60 / 145.94 / 1.6
  const index = Math.min(pages.length - 1, Math.max(0, Math.floor((t - from) / step)))
  const torn = (t - from) / step - index
  return (
    <g transform="translate(960 470)">
      <g filter="url(#cut)">
        <rect x="-300" y="-330" width="600" height="660" fill={paper.light} stroke={ink} strokeWidth="5" />
        <rect x="-300" y="-330" width="600" height="80" fill={velvet.base} stroke={ink} strokeWidth="4" />
        {[-200, -100, 0, 100, 200].map((rx) => (
          <circle key={rx} cx={rx} cy="-330" r="10" fill={wood.dark} stroke={ink} strokeWidth="2" />
        ))}
      </g>
      <text y="-130" textAnchor="middle" fontFamily={font.poster} fontSize="120" fill={ink}>
        {pages[index]?.year}
      </text>
      <g transform="translate(0 70)">
        <PageArt i={index} />
      </g>
      <text y="290" textAnchor="middle" fontFamily={font.caps} fontSize="40" fill={velvet.dark}>
        {pages[index]?.caption}
      </text>
      {index < pages.length - 1 && t > from ? (
        <g transform={`translate(${torn * 500} ${-torn * 600}) rotate(${torn * 60})`} opacity={1 - torn}>
          <rect x="-300" y="-250" width="600" height="580" fill={paper.light} stroke={ink} strokeWidth="3" />
          <text y="-130" textAnchor="middle" fontFamily={font.poster} fontSize="120" fill={ink} opacity="0.6">
            {pages[index]?.year}
          </text>
        </g>
      ) : null}
    </g>
  )
}

export const Chorus1 = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const calendar = during(t, at("tenYearsWent") - 0.1, at("badge"))
  const badgeShot = t >= at("badge")
  const kicking = t < at("prompt") || during(t, at("soLong2"), at("acronyms"))
  // The Unicorn galloping across the front, its halves out of step, front leg with back leg.
  const gallop = (lead: -1 | 1) =>
    walk(t, {
      from: at("soLong2") + 0.1,
      to: at("acronyms") - 0.1,
      x0: 1990,
      x1: -10,
      steps: 26,
      gait: "run",
      scale: 0.72,
      build: unicornLegs,
      profile: 1,
      flip: true,
      lead,
      rush: true
    })
  const galloping = { front: gallop(1), back: gallop(-1) }

  const camera = {
    scale: keys(t, [
      [at("tenYearsWent") - 0.3, 1],
      [at("tenYearsWent"), 1.25],
      [at("badge") - 0.05, 1.25],
      [at("badge"), 0.84]
    ]),
    x: keys(t, [
      [at("tenYearsWent") - 0.3, 960],
      [at("tenYearsWent"), 960],
      [at("badge") - 0.05, 960],
      [at("badge"), 940]
    ]),
    y: keys(t, [
      [at("tenYearsWent") - 0.3, 540],
      [at("tenYearsWent"), 500],
      [at("badge") - 0.05, 500],
      [at("badge"), 560]
    ])
  }

  // Shot 16: the Engineer feeds the prompt in; the engine's arm knocks the BUILD tower down on "broken".
  const feed = ramp(s, 53.7, 54.9)
  const knock = ramp(t, 55.3, 55.5, Easing.in(Easing.cubic)) * (1 - ramp(t, 55.8, 56.3))
  const crumble = ramp(t, 55.46, 56.3, Easing.out(Easing.quad))
  const sad = settle(t, 55.5, 9, 180) * (1 - ramp(t, 56.6, 56.86))

  // Shots 17 and 18: the bug dances for the Engineer; when the duck comes near it hides under a lampshade.
  const bugX = 900 + Math.sin(t * 5) * 120
  const duckNear =
    ramp(s, at("cameNear"), 61.2, Easing.inOut(Easing.cubic)) * (1 - ramp(s, 62, 62.9, Easing.inOut(Easing.cubic)))
  const hiding = during(t, 60.15, 62.6)

  // Shot 22: the badge pops off its reel and walks out with a tiny suitcase.
  const pop = 73.6
  const badgeWalk = walk(t, {
    from: 74.1,
    to: 76,
    x0: 960 + 41 * 0.82,
    x1: 1420,
    steps: 16,
    scale: 0.8,
    build: badgeLegs,
    rush: true
  })
  const badgeX = badgeWalk.x
  const cord = t > pop && t < 75.2
  const snapped = t >= 75.2

  let engineer: EngineerPose = {
    armR: 60,
    elbowR: 20,
    cane: { hand: "right", angle: 20 },
    armL: 20,
    mouth: "sing",
    look: { x: 0.6, y: 0 }
  }
  if (during(t, at("prompt"), at("bug"))) {
    engineer = {
      armL: mix(40, 70, feed),
      elbowL: 60,
      armR: mix(40, 70, feed),
      elbowR: 60,
      cane: "hood",
      openL: true,
      openR: true,
      mouth: crumble > 0 ? "o" : "sing",
      look: { x: 1, y: -0.2 }
    }
  } else if (during(t, at("bug"), at("soLong2"))) {
    const pointing = during(s, 58.1, 60.2)
    const facepalm = during(s, 62.6, 63.28)
    engineer = {
      armR: pointing ? 100 : 40,
      elbowR: 0,
      cane: { hand: "right", angle: pointing ? 100 : 15, grip: 0.1 },
      armL: facepalm ? 150 : 20,
      elbowL: facepalm ? 150 : 10,
      openL: facepalm,
      mouth: facepalm ? "flat" : "sing",
      look: pointing ? { x: 1, y: 0.4 } : { x: 0.6, y: 0.5 },
      tilt: facepalm ? 10 : 0
    }
  } else if (badgeShot) {
    engineer = {
      armR: snapped ? 140 + Math.sin(t * 12) * 10 : 30,
      elbowR: 10,
      cane: { hand: "right", angle: snapped ? 160 + Math.sin(t * 12) * 12 : 15 },
      armL: 30,
      elbowL: 60,
      openL: true,
      mouth: "sad",
      look: { x: 1, y: 0.3 },
      badge: t < pop
    }
  }

  return (
    <Canvas>
      <Camera scale={camera.scale} look={{ x: camera.x, y: camera.y }}>
        <Theatre
          card={cards.act1}
          boxes={{
            left: <Choir t={t} side="left" mood={badgeShot ? "sob" : "sing"} />,
            right: <Choir t={t} side="right" mood={badgeShot ? "sob" : "sing"} />
          }}
          backdrop={<ChorusCloth />}
          stage={
            <g>
              {kicking ? <KickLine t={t} shift={t >= at("soLong2") ? 40 : 0} unicorn={t < at("soLong2")} /> : null}
              {during(t, at("prompt"), at("bug")) ? (
                <g>
                  <PromptEngine x={1080} y={898} works={ramp(t, 54.5, 55)} t={t} swing={knock} />
                  <Cut>
                    <BuildTower x={1420} y={898} bricks={7} fall={crumble} scale={0.95} />
                  </Cut>
                  <path
                    d={`M${790},${720} Q${880 - feed * 40},${640 - feed * 120} ${960},${590 - feed * 10}`}
                    fill="none"
                    stroke={paper.light}
                    strokeWidth="26"
                  />
                  <path
                    d={`M${790},${720} Q${880 - feed * 40},${640 - feed * 120} ${960},${590 - feed * 10}`}
                    fill="none"
                    stroke={ink}
                    strokeWidth="2"
                    strokeDasharray="10 8"
                  />
                  <Cut>
                    <Engineer x={720} y={898} scale={0.8} pose={engineer} />
                  </Cut>
                </g>
              ) : null}
              {during(t, at("bug"), at("soLong2")) ? (
                <g>
                  <Keyboard x={960} y={898} bugX={hiding ? 960 : bugX} />
                  <Cut>
                    <Beetle
                      x={hiding ? 960 : bugX}
                      y={830 - (hiding ? 0 : hop(t) * 18)}
                      scale={1.1}
                      walk={hiding ? 0 : t}
                      topHat={!hiding}
                      cane={hiding ? undefined : Math.sin(t * 8) * 40}
                      shade={hiding}
                    />
                    <Engineer x={560} y={898} scale={0.8} pose={engineer} />
                    <Duck
                      x={mix(1450, 1180, duckNear)}
                      y={898}
                      scale={0.9}
                      flip
                      rotate={during(s, 61.2, 62) ? Math.sin(s * 20) * 8 : 0}
                    />
                  </Cut>
                  {during(t, 61.3, 62) ? (
                    <Say x={1130} y={520} width={150} lines={["?"]} tail={{ x: 1180, y: 790 }} />
                  ) : null}
                </g>
              ) : null}
              {during(t, at("acronyms"), at("tenYearsWent")) ? (
                <g>
                  <Cut>
                    <ReadingCoach
                      x={800}
                      y={898}
                      scale={0.78}
                      armL={60}
                      armR={120}
                      mouth={t < 68.44 ? "o" : "flat"}
                      look={{ x: 0.4, y: -0.3 }}
                    />
                    <Engineer
                      x={560}
                      y={898}
                      scale={0.8}
                      pose={{
                        armR: 70,
                        elbowR: 30,
                        cane: { hand: "right", angle: 30 },
                        look: { x: 0.8, y: -0.3 },
                        mouth: "flat"
                      }}
                    />
                  </Cut>
                  <Acronyms t={t} />
                  <g transform="translate(900 500)">
                    <Say
                      x={-240}
                      y={-90}
                      width={480}
                      lines={t < 67.9 ? ["S\u2026 F\u2026 I\u2026"] : ["I-c-M\u2026 O-K-R\u2026 M-A-U\u2026"]}
                      tail={{ x: -90, y: 100 }}
                    />
                    {t >= 68.44 ? (
                      <g transform={`rotate(-6) scale(${mix(1.6, 1, settle(t, 68.44, 12, 300))})`}>
                        <rect x="-230" y="-56" width="460" height="64" fill="#111" />
                        <text
                          y="-12"
                          textAnchor="middle"
                          fontFamily={font.poster}
                          fontSize="40"
                          fill="#fff"
                          letterSpacing="6"
                        >
                          CENSORED
                        </text>
                      </g>
                    ) : null}
                  </g>
                </g>
              ) : null}
              {calendar ? <Calendar t={t} /> : null}
              {badgeShot ? (
                <g>
                  <Cut>
                    <WindowsPhone x={640} y={896} scale={0.8} armL={40} armR={100} face="o" look={{ x: 0.5, y: 0 }} />
                    <ReadingCoach
                      x={1320}
                      y={898}
                      scale={0.72}
                      armL={150}
                      armR={150}
                      mouth="sad"
                      look={{ x: -0.6, y: 0.2 }}
                    />
                    <Clippy
                      x={1530}
                      y={896}
                      scale={0.6}
                      hat
                      bowtie
                      brows={-0.6}
                      mouth="sad"
                      look={{ x: -0.7, y: 0.3 }}
                    />
                    <Engineer x={960} y={898} scale={0.82} pose={engineer} />
                  </Cut>
                  <g transform="translate(690 640)" filter="url(#cut)">
                    <rect x="-36" y="-20" width="72" height="40" fill="#8fc8ec" stroke={ink} strokeWidth="3" />
                    <path d="M-10,-20 Q0,-50 14,-24" fill="#fff" stroke={ink} strokeWidth="2" />
                  </g>
                  {cord ? (
                    <path
                      d={`M${960 + 40 * 0.82},${898 - 166 * 0.82} Q${(960 + badgeX) / 2},${898 - 40} ${badgeX},${880 - 110}`}
                      fill="none"
                      stroke="#3b3b3b"
                      strokeWidth="2"
                    />
                  ) : null}
                  {t > pop ? (
                    <Cut>
                      <BadgeWalker
                        x={badgeX}
                        y={badgeWalk.y - (t < 74.1 ? Math.sin(ramp(t, pop, 74.1) * Math.PI) * 60 : 0)}
                        scale={0.8}
                        stride={badgeWalk.stride}
                      />
                    </Cut>
                  ) : null}
                  {snapped ? (
                    <g transform={`translate(${960 + 140 * 0.82 + 30} ${898 - 400})`}>
                      <path
                        d="M0,0 q30,-10 50,8 q-8,20 6,40 q-30,4 -50,-10 q8,-18 -6,-38 Z"
                        fill="#fff"
                        stroke={ink}
                        strokeWidth="2.5"
                      />
                    </g>
                  ) : null}
                </g>
              ) : null}
              {during(t, at("soLong2") + 0.1, at("acronyms") - 0.1) ? (
                <Cut>
                  <Unicorn
                    x={galloping.front.x}
                    y={galloping.front.y}
                    scale={0.72}
                    flip
                    strides={{ front: galloping.front.stride, back: galloping.back.stride }}
                  />
                </Cut>
              ) : null}
            </g>
          }
          front={
            <g>
              {sad > 0 ? (
                <g transform={`translate(1520 ${mix(1000, 600, sad)})`}>
                  <SadLady x={0} y={0} scale={0.8} />
                </g>
              ) : null}
              {t >= 75.42 ? (
                <g transform={`translate(0 ${-820 * (1 - ramp(t, 75.42, 76.02, Easing.out(Easing.bounce)))})`}>
                  <HouseCurtain />
                </g>
              ) : null}
            </g>
          }
          light={<Spot x={960} y={870} rx={420} ry={80} />}
        />
      </Camera>
    </Canvas>
  )
}
