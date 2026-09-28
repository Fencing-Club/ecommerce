// The ad's sound effects, synthesized and placed on the moments in src/timeline.ts: whooshes on every move, clicks and
// ticks on the interface, pings for the email pile-up, slams for Amazon's rules, glitches for the errors. Written to
// public/audio/sfx.wav.
import { at, moments, type Section, seconds } from "../src/timeline.ts"
import { filter, master, mix, noise, place, rate, reverb, seeded, stereo, writeWav } from "./audio/dsp.ts"

const random = seeded(4471)

const sound = (length: number, sample: (t: number) => number) =>
  Float32Array.from({ length: Math.round(length * rate) }, (_, i) => sample(i / rate))

const tone = (frequency: number, decay: number) => (t: number) =>
  Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decay)

// Air rushing past: noise through a bandpass that sweeps up (or down) as it swells and fades.
const whoosh = (length: number, rising = true) => {
  const band = filter("bandpass", 1.4)
  return sound(length, (t) => {
    const x = t / length
    const sweep = rising ? x : 1 - x
    return band(noise(random), 350 * 14 ** sweep) * Math.sin(Math.PI * x) ** 1.6 * 1.8
  })
}
const click = (() => {
  const cut = filter("highpass")
  return sound(0.05, (t) => cut(noise(random), 3000) * Math.exp(-t / 0.004) + tone(2200, 0.008)(t) * 0.5)
})()
const tick = sound(0.12, (t) => tone(1568, 0.035)(t) + tone(3136, 0.02)(t) * 0.35)
const pop = (() => {
  let phase = 0
  return sound(0.16, (t) => {
    phase += (380 + 500 * Math.min(t / 0.05, 1)) / rate
    return Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.06)
  })
})()
const chime = sound(0.7, (t) => tone(1318.5, 0.22)(t) + (t > 0.07 ? tone(1975.5, 0.26)(t - 0.07) : 0))
const ping = sound(0.45, (t) => tone(1046.5, 0.1)(t) * 0.8 + (t > 0.06 ? tone(1568, 0.14)(t - 0.06) : 0))
const thump = (() => {
  let phase = 0
  return sound(0.4, (t) => {
    phase += (45 + 60 * Math.exp(-t / 0.03)) / rate
    return Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.16) + (t < 0.003 ? noise(random) * 0.4 : 0)
  })
})()
const slam = (() => {
  const band = filter("bandpass", 0.9)
  return sound(0.4, (t) => (thump[Math.round(t * rate)] ?? 0) + band(noise(random), 900) * Math.exp(-t / 0.05) * 1.4)
})()
const glitch = sound(0.16, (t) => {
  const on = Math.floor(t * 90) % 3 !== 1
  const square = Math.sin(2 * Math.PI * 180 * t) > 0 ? 0.5 : -0.5
  return on ? (square + noise(random) * 0.3) * (1 - t / 0.16) : 0
})
const key = (() => {
  const band = filter("bandpass", 1.5)
  return sound(0.03, (t) => band(noise(random), 2600) * Math.exp(-t / 0.006) * 1.5)
})()
const shimmer = sound(1.4, (t) =>
  [2093, 2637, 3136, 4186].reduce(
    (sum, frequency, i) => sum + (t > i * 0.035 ? tone(frequency, 0.35)(t - i * 0.035) * 0.3 : 0),
    0
  )
)

const out = stereo(seconds)
const sends = stereo(seconds)
const play = (sample: Float32Array, time: number, gain: number, pan = 0, send = 0) => {
  place(out, sample, time, gain, pan)
  if (send > 0) {
    place(sends, sample, time, send, pan)
  }
}
const pan = () => (random() - 0.5) * 1.2

// The hook: each line lands with a thump, the emails ping, the sheets swish, Amazon's rules slam and the errors
// glitch. The freeze is left silent.
const { hook, reveal, forecast, reorder, amazon, handoffs, agents, recap, outcome, end } = moments
play(whoosh(1.2, false), at("hook", 0), 0.2)
for (const time of hook.open) {
  play(ping, at("hook", time), 0.2, pan(), 0.1)
}
for (const line of hook.lines.slice(1)) {
  play(thump, at("hook", line), 0.5)
}
hook.emails.forEach((time, i) => play(ping, at("hook", time), 0.22 - i * 0.012, pan(), 0.1))
for (const time of hook.sheets) {
  play(whoosh(0.22), at("hook", time), 0.35, pan())
}
play(slam, at("hook", hook.stockout), 0.8, 0, 0.3)
for (const time of hook.stamps) {
  play(slam, at("hook", time), 0.55, pan(), 0.2)
}
for (const time of hook.errors) {
  play(glitch, at("hook", time), 0.22, pan())
}

// The reveal: the snap, the window sweeping together, the logo's sparkle, and ticks as the overview fills in.
play(click, at("reveal", reveal.snap), 0.7)
play(whoosh(0.5), at("reveal", reveal.assemble), 0.4)
play(shimmer, at("reveal", reveal.logo), 0.3, 0, 0.3)
for (let i = 0; i < 6; i++) {
  play(tick, at("reveal", reveal.tiles + i * 0.08), 0.14, pan())
}
for (let i = 0; i < 4; i++) {
  play(tick, at("reveal", reveal.rows + i * 0.12), 0.12, pan())
}

// Every section opens on a whoosh as its headline arrives, with a swish as its window lands, and leaves on another.
const sectionIn = (section: Section, window: number) => {
  play(whoosh(0.6), at(section, 0), 0.35)
  play(whoosh(0.3), at(section, window), 0.25, 0.3)
}
const sectionOut = (section: Section, time: number) => play(whoosh(0.45, false), at(section, time), 0.3, -0.3)
const press = (section: Section, time: number, success: boolean) => {
  play(click, at(section, time), 0.45)
  if (success) {
    play(chime, at(section, time + 0.25), 0.26, 0, 0.25)
  }
}
const ticks = (section: Section, times: readonly number[], gain = 0.16) => {
  for (const time of times) {
    play(tick, at(section, time), gain, pan())
  }
}

sectionOut("reveal", reveal.out)

sectionIn("forecast", forecast.window)
press("forecast", forecast.connectShopify, true)
press("forecast", forecast.connectAmazon, true)
play(pop, at("forecast", forecast.synced), 0.3)
play(whoosh(0.3), at("forecast", forecast.restock), 0.25)
ticks("forecast", forecast.rows)
play(whoosh(0.5), at("forecast", forecast.zoom), 0.3)
ticks("forecast", forecast.maths)
play(chime, at("forecast", forecast.answer), 0.3, 0, 0.3)
play(whoosh(0.6), at("forecast", forecast.season - 0.3), 0.35)
play(glitch, at("forecast", forecast.runsOut), 0.2)
play(thump, at("forecast", forecast.lost), 0.35)
play(pop, at("forecast", forecast.orderBy), 0.3, -0.3)
play(chime, at("forecast", forecast.arrives), 0.28, 0.3, 0.3)
sectionOut("forecast", forecast.out)

sectionIn("reorder", reorder.window)
press("reorder", reorder.reorder, false)
play(whoosh(0.35), at("reorder", reorder.reorder + 0.3), 0.3)
ticks("reorder", reorder.lines)
press("reorder", reorder.submit, true)
play(whoosh(0.5), at("reorder", reorder.supplier), 0.35, 0.4)
ticks("reorder", reorder.cartons)
press("reorder", reorder.packed, true)
sectionOut("reorder", reorder.out)

sectionIn("amazon", amazon.window)
ticks("amazon", amazon.steps, 0.18)
for (const time of amazon.labels) {
  play(pop, at("amazon", time), 0.2, pan())
}
play(whoosh(0.5), at("amazon", amazon.split), 0.35)
play(pop, at("amazon", amazon.fba), 0.3, -0.5)
play(pop, at("amazon", amazon.awd), 0.3, 0)
play(whoosh(0.5, false), at("amazon", amazon.reflow), 0.16)
play(pop, at("amazon", amazon.offshore), 0.34, 0.5)
play(shimmer, at("amazon", amazon.offshore), 0.2, 0.5, 0.25)
play(whoosh(0.4, false), at("amazon", amazon.fees), 0.25)
sectionOut("amazon", amazon.out)

sectionIn("handoffs", handoffs.windows[0])
for (const time of handoffs.windows.slice(1)) {
  play(whoosh(0.3), at("handoffs", time), 0.22, pan())
}
play(shimmer, at("handoffs", handoffs.links), 0.18, 0, 0.2)
play(whoosh(0.5), at("handoffs", handoffs.supplier), 0.3)
ticks("handoffs", handoffs.checklist, 0.18)
press("handoffs", handoffs.download, false)
play(pop, at("handoffs", handoffs.download + 0.2), 0.3)
play(whoosh(0.5), at("handoffs", handoffs.forwarder), 0.3)
play(whoosh(0.5), at("handoffs", handoffs.buyer), 0.3)
press("handoffs", handoffs.shipped, true)
ticks("handoffs", handoffs.documents, 0.14)
sectionOut("handoffs", handoffs.out)

sectionIn("agents", agents.panels)
for (let t = agents.typing[0]; t < agents.typing[1]; t += 0.05 + random() * 0.05) {
  play(key, at("agents", t), 0.18 + random() * 0.08, pan())
}
play(whoosh(0.3), at("agents", agents.send), 0.3)
agents.steps.forEach((time, i) => play(i === agents.steps.length - 1 ? chime : tick, at("agents", time), 0.2, 0, 0.15))
for (const time of agents.partners) {
  play(ping, at("agents", time), 0.26, pan(), 0.15)
}
sectionOut("agents", agents.out)

// The recap cuts hit on the beat, and the logo sparkles as the final chord lands.
for (const time of recap.cuts) {
  play(whoosh(0.25, false), at("recap", time) - 0.12, 0.3)
  play(thump, at("recap", time), 0.4)
}
// The outcome's chart swings in and chimes as it comes up fully stocked.
play(whoosh(0.6), at("outcome", outcome.chart), 0.3)
play(chime, at("outcome", outcome.stocked), 0.3, 0, 0.3)

// The logo lands, the line and the call to action arrive, and the final chord sparkles.
play(shimmer, at("end", end.logo), 0.3, 0, 0.35)
play(whoosh(0.4), at("end", end.tagline), 0.2)
play(pop, at("end", end.cta), 0.3)
play(shimmer, at("end", end.final), 0.25, 0, 0.35)

mix(out, reverb(sends, 0.8, 0.4), 0.8)
master(out, 0.8)
await writeWav("public/audio/sfx.wav", out)
process.stdout.write("public/audio/sfx.wav\n")
