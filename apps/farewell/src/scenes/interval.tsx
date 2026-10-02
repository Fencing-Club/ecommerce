import { Easing } from "remotion"
import { cards } from "../acts"
import { Clippy } from "../cast/clippy"
import { Cane, Engineer } from "../cast/engineer"
import { Octopus } from "../cast/octopus"
import { Choir } from "../choir"
import { hop, mix, onTwos, ramp, settle } from "../motion"
import { Camera, Canvas, Cut } from "../paper"
import { HouseCurtain, Spot, Theatre } from "../theatre"
import { font, gold, ink, paper } from "../theme"
import { at, beats } from "../timeline"

// The interval: seven seconds of jaunty brass. The curtain comes down, the Pink Octopus climbs out of the pit to play
// trumpet and clap, the Engineer eats an ice cream on the edge of the stage, and Clippy counts it down.

// A theatre ice cream: a little tub with a wooden spoon in it.
const IceCream = () => (
  <g transform="translate(2 -6)" filter="url(#cut)">
    <path d="M-16,-14 L-12,14 H12 L16,-14 Z" fill="#fff" stroke={ink} strokeWidth="2.5" />
    <path d="M-16,-14 Q0,-30 16,-14 Z" fill="#f6a5c0" stroke={ink} strokeWidth="2" />
    <path d="M-12,-2 H12" stroke="#e85a8a" strokeWidth="3" />
  </g>
)

// The wooden spoon, `tilt` degrees round from pointing straight down.
const Spoon = ({ tilt }: { tilt: number }) => (
  <g transform={`translate(0 8) rotate(${tilt})`}>
    <path d="M0,0 V30" stroke="#c99a5b" strokeWidth="4" strokeLinecap="round" />
    <ellipse cy="34" rx="5" ry="7" fill="#c99a5b" stroke={ink} strokeWidth="1.5" />
  </g>
)

// A trumpet, bell to the right, drawn about its mouthpiece.
const Trumpet = () => (
  <g filter="url(#cut)">
    <path d="M0,0 H110 L150,-26 V26 L110,0" fill={gold.base} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
    <rect x="34" y="-14" width="40" height="14" rx="4" fill="none" stroke={gold.dark} strokeWidth="4" />
    {[44, 54, 64].map((x) => (
      <rect key={x} x={x - 3} y="-24" width="6" height="12" fill={gold.light} stroke={ink} strokeWidth="1.5" />
    ))}
  </g>
)

export const Interval = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const b = beats(s)
  const start = at("interval")
  const down = ramp(t, start - 0.6, start, Easing.out(Easing.bounce))
  const octopusUp = settle(s, start + 0.3, 10, 120)
  const left = Math.max(0, 7 - Math.floor(t - start))
  const clippyUp = settle(s, start + 0.8, 9, 160) * (1 - ramp(s, 82.6, 82.9))
  const blink = t > 82 && t < 82.7 && Math.floor((t - 82) * 6) % 2 === 0
  const gobble = ramp(s, 82.1, 82.5)
  const spoon = Math.max(0, Math.sin(Math.PI * b))
  const leave = ramp(s, 82.5, 83.1, Easing.in(Easing.cubic))
  return (
    <Canvas>
      <Camera scale={0.9} look={{ x: 960, y: 560 }}>
        <Theatre
          curtain={0}
          card={cards.interval}
          dark={blink ? 0.6 : 0}
          boxes={{ left: <Choir t={t} side="left" mood="watch" />, right: <Choir t={t} side="right" mood="watch" /> }}
          front={
            <g>
              <g transform={`translate(0 ${-820 * (1 - down)})`}>
                <HouseCurtain />
              </g>
              {clippyUp > 0.01 ? (
                <g transform={`translate(0 ${(1 - clippyUp) * 500})`}>
                  <Cut>
                    <Clippy
                      x={960}
                      y={898}
                      scale={0.7}
                      hat
                      bowtie
                      brows={0.8}
                      look={{ x: 0.6, y: 0.2 }}
                      rotate={Math.sin(s * 6) * 4}
                    />
                  </Cut>
                  <g transform="translate(1110 520) rotate(6)" filter="url(#cut)">
                    <path d="M0,60 V300" stroke="#5a3818" strokeWidth="10" />
                    <rect
                      x="-80"
                      y="-80"
                      width="160"
                      height="150"
                      rx="8"
                      fill={paper.light}
                      stroke={ink}
                      strokeWidth="4"
                    />
                    <text y="40" textAnchor="middle" fontFamily={font.poster} fontSize="110" fill="#c0161c">
                      {left}
                    </text>
                  </g>
                </g>
              ) : null}
              <Spot x={960} y={860} rx={300} ry={70} />
            </g>
          }
          pit={
            <g>
              <Cut>
                <g transform={`translate(1280 ${1012 + (1 - octopusUp) * 220 - hop(t) * 6})`}>
                  <Octopus
                    x={0}
                    y={0}
                    scale={0.55}
                    baton={Math.sin(Math.PI * b) * 30}
                    rotate={Math.sin(Math.PI * b) * 4}
                  />
                  <g transform={`translate(-30 -150) rotate(${-10 + Math.sin(t * 9) * 4})`}>
                    <Trumpet />
                  </g>
                  {Math.floor(b) % 2 === 0 ? (
                    <g stroke={gold.light} strokeWidth="4" strokeLinecap="round">
                      {[0, 1, 2].map((i) => (
                        <path key={i} d={`M${-120 + i * 30},-120 l${-10 + i * 10},-24`} />
                      ))}
                    </g>
                  ) : null}
                </g>
                <g transform={`translate(${mix(700, 960, leave)} ${-leave * 220})`}>
                  <Engineer
                    x={0}
                    y={905 + 168 * 0.8}
                    scale={0.8}
                    pose={{
                      armL: mix(10, -55, gobble),
                      elbowL: mix(-120, -126, gobble),
                      holdL: <IceCream />,
                      armR: mix(mix(-8, -60, spoon), 30, gobble),
                      elbowR: mix(mix(-111, -116, spoon), 20, gobble),
                      holdR: <Spoon tilt={mix(30, 160, spoon)} />,
                      legL: Math.sin(t * 5) * 14,
                      legR: Math.sin(t * 5 + 1.6) * 14,
                      mouth: spoon > 0.7 || gobble > 0 ? "o" : "smile",
                      look: { x: 0.4, y: 0.2 }
                    }}
                  />
                  <g transform={`translate(${-70} ${905 + 4}) rotate(-88)`}>
                    <Cane />
                  </g>
                </g>
              </Cut>
            </g>
          }
        />
      </Camera>
    </Canvas>
  )
}
