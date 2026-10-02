import { Easing } from "remotion"
import { cards } from "../acts"
import { Clippy } from "../cast/clippy"
import { Cane } from "../cast/engineer"
import { Lamp } from "../cast/lamp"
import { Octopus } from "../cast/octopus"
import { Choir } from "../choir"
import { hop, mix, onTwos, ramp, settle, sway } from "../motion"
import { Camera, Canvas, Cut } from "../paper"
import { Balloon, Playbill, Pointer } from "../props"
import { Spot, Theatre } from "../theatre"
import { beats } from "../timeline"

// The overture, from black: footlights up, the Pink Octopus striking up in the pit, the choir rising into the boxes,
// the playbill flown in, and Clippy in the Lamp's spot offering help, until a white glove clicks "Just leave", the
// Engineer's cane pokes through the curtain to tap the playbill away, and the camera settles for the curtain.
export const OvertureScene = ({ t }: { t: number }) => {
  const s = onTwos(t)
  const settled = ramp(t, 11.9, 13)
  const billDrop = settle(t, 2.4, 9, 70)
  const billOut = ramp(t, 12.2, 12.9, Easing.in(Easing.cubic))
  const knock = t > 11.85 && t < 12.2 ? Math.sin((t - 11.85) * 40) * 6 : 0
  const billY = mix(-660, 268, billDrop) - 940 * billOut + knock
  const beamOn = t > 7.6 && !(t < 7.95 && Math.floor(t * 18) % 2 === 0)
  const clippyUp = settle(s, 8.1, 9, 160)
  const balloon = settle(t, 8.8, 10, 170) * (1 - ramp(t, 11.05, 11.3))
  const glove = (() => {
    if (t < 9.7 || t > 11.3) {
      return null
    }
    const arrive = ramp(t, 9.7, 10.35, Easing.out(Easing.cubic))
    const leave = ramp(t, 10.75, 11.3, Easing.in(Easing.cubic))
    return {
      x: mix(1900, 1222, arrive) + 500 * leave,
      y: mix(1150, 452, arrive) + 600 * leave,
      pressed: ramp(t, 10.45, 10.52) * (1 - ramp(t, 10.6, 10.7))
    }
  })()
  // The cane's crook out through the gap in the curtain: out, two taps on the playbill, a flourish, and back in.
  const poke = ramp(s, 11.4, 11.75, Easing.out(Easing.cubic)) * (1 - ramp(s, 12.55, 12.95, Easing.in(Easing.cubic)))
  const tap = s > 11.8 && s < 12.2 ? Math.abs(Math.sin((s - 11.8) * Math.PI * 5)) * 10 : 0
  const flourish = ramp(s, 12.2, 12.5) * 40
  return (
    <Canvas>
      <Camera scale={mix(0.78, 1, settled)} look={{ x: 960, y: mix(560, 540, settled) }}>
        <Theatre
          curtain={0}
          card={cards.overture}
          lit={ramp(t, 0.25, 1, Easing.linear)}
          dark={1 - ramp(t, 0.2, 2.2)}
          boxes={{
            left: <Choir t={t} side="left" mood={t > 1.7 && t < 12.9 ? "sing" : "watch"} rise={0.9} />,
            right: <Choir t={t} side="right" mood={t > 1.7 && t < 12.9 ? "sing" : "watch"} rise={1.05} />
          }}
          front={
            <g>
              <g transform={`rotate(${sway(t, 2.9, 2.5, 6)} 800 ${billY - 240})`}>
                <Playbill x={800} y={billY} />
              </g>
              {poke > 0 ? (
                <g clipPath="url(#curtainGap)">
                  <clipPath id="curtainGap">
                    <rect x="150" y="140" width="808" height="765" />
                  </clipPath>
                  <Cut>
                    <g
                      transform={`translate(${mix(1010, 930, poke)} ${862 - tap}) rotate(${mix(-90, -132, poke) + flourish})`}
                    >
                      <Cane grip={1} />
                    </g>
                  </Cut>
                </g>
              ) : null}
              {beamOn ? <Spot x={1540} y={840} rx={210} ry={70} /> : null}
              <Cut>
                <Clippy
                  x={1520}
                  y={902 + (1 - clippyUp) * 420 - (t > 8.6 ? hop(t) * 5 : 0)}
                  scale={0.9}
                  hat
                  bowtie
                  brows={t > 10.5 && t < 11.1 ? -0.6 : 0.8}
                  look={glove ? { x: -0.2, y: -0.6 } : { x: -0.6, y: 0.1 }}
                />
                <Lamp
                  x={1712}
                  y={904}
                  scale={0.8}
                  flip
                  aim={mix(-55, -88, ramp(s, 7.3, 7.8))}
                  beam={beamOn ? 300 : 0}
                  look={{ x: -0.6, y: 0.4 }}
                />
              </Cut>
              {balloon > 0.01 ? (
                <Balloon
                  x={1180}
                  y={292}
                  width={560}
                  title="It looks like you’re writing a farewell."
                  body="Would you like help?"
                  options={["Get help with leaving", "Just leave"]}
                  tail={{ x: 1500, y: 548 }}
                  pop={balloon}
                  chosen={t > 10.48 ? 1 : undefined}
                />
              ) : null}
              {glove ? <Pointer x={glove.x} y={glove.y} pressed={glove.pressed} /> : null}
            </g>
          }
          pit={
            <Cut>
              <Octopus
                x={914}
                y={1012 + (1 - settle(s, 0.4, 10, 120)) * 170 - hop(t) * 4}
                scale={0.5}
                rotate={Math.sin(Math.PI * beats(s)) * 3}
                baton={t > 1.2 && t < 12.9 ? Math.sin(Math.PI * beats(s)) * 16 : 0}
              />
            </Cut>
          }
        />
      </Camera>
    </Canvas>
  )
}
