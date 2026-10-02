import { cards } from "../acts"
import { Clippy } from "../cast/clippy"
import { Engineer } from "../cast/engineer"
import { Lamp } from "../cast/lamp"
import { Octopus } from "../cast/octopus"
import { Choir } from "../choir"
import { mix, onTwos, ramp } from "../motion"
import { Camera, Canvas, Cut } from "../paper"
import { Say } from "../props"
import { Plain } from "../sets"
import { Spot, Theatre } from "../theatre"
import { font, gold, ink, paper, wood } from "../theme"
import { at } from "../timeline"

// The interlude: Clippy at a newsreader's desk on the bare stage, announcing something completely sincere, while the
// Lamp warms its light, the Pink Octopus takes up a harp, and the Engineer takes the headset off to listen.

const Harp = ({ t }: { t: number }) => (
  <g transform="translate(-150 -60)" filter="url(#cut)">
    <path d="M0,0 Q-10,-180 60,-240 L80,-230 Q20,-170 30,0 Z" fill={gold.base} stroke={ink} strokeWidth="3" />
    <path d="M60,-240 Q140,-220 150,-160 L150,0 H30" fill="none" stroke={gold.dark} strokeWidth="10" />
    {Array.from({ length: 8 }, (_, i) => (
      <path
        key={i}
        d={`M${40 + i * 14},${-200 + i * 6} V0`}
        stroke="#fff6d8"
        strokeWidth="1.5"
        transform={`translate(${Math.sin(t * 20 + i) * (i % 2)} 0)`}
      />
    ))}
  </g>
)

export const Sincere = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const start = at("sincere")
  const warm = ramp(t, start, start + 2)
  const down = ramp(s, start + 1.1, start + 1.5)
  return (
    <Canvas>
      <Camera scale={0.92} look={{ x: 960, y: 560 }}>
        <Theatre
          card={cards.sincere}
          boxes={{ left: <Choir t={t} side="left" mood="watch" />, right: <Choir t={t} side="right" mood="watch" /> }}
          backdrop={<Plain color="#2f2a36" />}
          stage={
            <g>
              <g filter="url(#cut)">
                <rect x="780" y="720" width="360" height="178" fill={wood.dark} stroke={ink} strokeWidth="4" />
                <rect x="760" y="700" width="400" height="26" fill={wood.base} stroke={ink} strokeWidth="3" />
                <rect x="840" y="760" width="240" height="60" fill={paper.light} stroke={ink} strokeWidth="2" />
                <text x="960" y="800" textAnchor="middle" fontFamily={font.caps} fontSize="26" fill={ink}>
                  The News
                </text>
              </g>
              <Cut>
                <Clippy
                  x={960}
                  y={720}
                  scale={0.7}
                  bowtie
                  brows={0.1}
                  look={{ x: 0, y: 0 }}
                  mouth={t > start + 0.3 && t < start + 2.4 && Math.floor(t * 6) % 2 === 0 ? "o" : "flat"}
                />
                <Engineer
                  x={560}
                  y={898}
                  scale={0.8}
                  pose={{
                    armL: mix(160, 20, down),
                    elbowL: mix(150, 10, down),
                    openL: true,
                    armR: 24,
                    cane: { hand: "right", angle: 4 },
                    headset: down > 0.5 ? "neck" : "on",
                    mouth: "flat",
                    look: { x: 1, y: 0 }
                  }}
                />
                <Lamp x={1470} y={898} scale={0.8} flip lean={-16} aim={-80} beam={260} look={{ x: -0.6, y: 0.4 }} />
              </Cut>
            </g>
          }
          front={
            t > start + 0.2 ? (
              <Say
                x={600}
                y={330}
                width={720}
                lines={["And now for something", "completely sincere."]}
                tail={{ x: 960, y: 560 }}
              />
            ) : null
          }
          light={
            <g>
              <rect
                x="150"
                y="130"
                width="1620"
                height="780"
                fill="#ffb347"
                opacity={0.12 * warm}
                style={{ mixBlendMode: "screen" }}
              />
              <Spot x={960} y={840} rx={300} ry={80} />
            </g>
          }
          pit={
            <Cut>
              <g transform="translate(1200 1040)">
                <Octopus x={0} y={0} scale={0.5} instruments={false} />
                <Harp t={t} />
              </g>
            </Cut>
          }
        />
      </Camera>
    </Canvas>
  )
}
