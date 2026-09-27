// The ad's temporary score, synthesized so it needs no license: a warm tech-house track at 120 BPM. The hook builds on A
// minor into a drop at 0:10, the features ride a C, G, A minor, F groove that eases off under the handoffs and builds
// through the agents, a second drop carries the recap at 1:20, and a final chord lands on the logo at 1:24. Written to
// public/audio/score.wav.
import { sections, seconds } from "../src/timeline.ts"
import {
  echo,
  envelope,
  filter,
  master,
  midi,
  mix,
  noise,
  place,
  rate,
  reverb,
  saw,
  seeded,
  type Stereo,
  stereo,
  writeWav
} from "./audio/dsp.ts"

const random = seeded(20260927)
const beat = 0.5
const bar = 2

// One-shot drums, rendered once and placed wherever they hit.
const oneShot = (length: number, sample: (t: number) => number) =>
  Float32Array.from({ length: Math.round(length * rate) }, (_, i) => sample(i / rate))

const kick = (() => {
  let phase = 0
  return oneShot(0.45, (t) => {
    phase += (48 + 110 * Math.exp(-t / 0.035)) / rate
    const click = t < 0.004 ? noise(random) * (1 - t / 0.004) * 0.3 : 0
    return Math.tanh((Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.2) + click) * 1.6)
  })
})()
const thinKick = (() => {
  const cut = filter("highpass")
  return kick.map((x) => cut(x, 160))
})()
const clap = (() => {
  const band = filter("bandpass", 0.9)
  return oneShot(0.35, (t) => {
    const bursts = [0, 0.011, 0.022].reduce((sum, start) => sum + (t >= start ? Math.exp(-(t - start) / 0.006) : 0), 0)
    const tail = t > 0.03 ? 0.7 * Math.exp(-(t - 0.03) / 0.09) : 0
    return band(noise(random) * (bursts + tail), 1300) * 2.2
  })
})()
const closedHat = (() => {
  const cut = filter("highpass")
  return oneShot(0.1, (t) => cut(noise(random), 8000) * Math.exp(-t / 0.03))
})()
const openHat = (() => {
  const cut = filter("highpass")
  return oneShot(0.4, (t) => cut(noise(random), 7000) * Math.exp(-t / 0.16))
})()
const snare = (() => {
  const band = filter("bandpass", 0.8)
  return oneShot(0.3, (t) => band(noise(random), 1800) * Math.exp(-t / 0.13) * 1.8 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.05) * 0.5)
})()
const crash = (() => {
  const cut = filter("highpass")
  return oneShot(2.6, (t) => cut(noise(random), 4500) * Math.exp(-t / 1.1))
})()
const impact = (() => {
  let phase = 0
  const low = filter("lowpass")
  return oneShot(2.6, (t) => {
    phase += (38 + 26 * Math.exp(-t / 0.25)) / rate
    return Math.sin(2 * Math.PI * phase) * Math.exp(-t / 1.1) + low(noise(random), 500) * Math.exp(-t / 0.25) * 0.8
  })
})()

// Noise swept up through a bandpass as it swells: tension into a drop.
const riser = (length: number) => {
  const band = filter("bandpass", 1.2)
  return oneShot(length, (t) => {
    const x = t / length
    return band(noise(random), 300 * 25 ** x) * x * x * 1.6
  })
}

// Chords as MIDI notes, voiced close so they move smoothly, with each one's bass root.
const chords = {
  C: { notes: [60, 64, 67, 71], root: 36 },
  G: { notes: [59, 62, 67, 69], root: 31 },
  Am: { notes: [57, 60, 64, 67], root: 33 },
  F: { notes: [57, 60, 65, 69], root: 29 }
}
const progression = [chords.C, chords.G, chords.Am, chords.F]

// A supersaw: seven detuned saws per note, spread across the stereo field, through a lowpass that can sweep.
const pad = (bus: Stereo, at: number, notes: readonly number[], length: number, cutoff: (t: number) => number, gain: number, release = 0.18) => {
  const tail = length + release * 4
  const n = Math.round(tail * rate)
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  const detunes = [-0.19, -0.12, -0.05, 0, 0.05, 0.12, 0.19]
  for (const note of notes) {
    detunes.forEach((detune, v) => {
      const step = midi(note + detune) / rate
      const pan = ((v - 3) / 3) * 0.8
      const l = Math.cos(((pan + 1) * Math.PI) / 4)
      const r = Math.sin(((pan + 1) * Math.PI) / 4)
      let phase = random()
      for (let i = 0; i < n; i++) {
        const s = saw(phase, step)
        phase += step
        if (phase >= 1) {
          phase -= 1
        }
        left[i] += s * l
        right[i] += s * r
      }
    })
  }
  const lowLeft = filter("lowpass", 0.8)
  const lowRight = filter("lowpass", 0.8)
  const scale = gain / (notes.length * 3)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const env = envelope(t, 0.03, 0.6, 0.85, length, release) * scale
    const c = cutoff(at + t)
    left[i] = lowLeft(left[i], c) * env
    right[i] = lowRight(right[i], c) * env
  }
  place(bus, left, at, 1, -1)
  place(bus, right, at, 1, 1)
}

// A short saw pluck whose filter snaps shut: the arpeggio and the offbeat bass.
const pluck = (note: number, length: number, bright: number, decay: number) => {
  const step = midi(note) / rate
  const low = filter("lowpass", 1.1)
  let phase = random()
  return oneShot(length, (t) => {
    const s = saw(phase, step)
    phase = (phase + step) % 1
    return low(s, 300 + bright * Math.exp(-t / 0.06)) * Math.exp(-t / decay)
  })
}

// A sine sub following the chord root for a bar.
const sub = (note: number, length: number) =>
  oneShot(length, (t) => Math.sin(2 * Math.PI * midi(note) * t) * envelope(t, 0.01, 1, 1, length - 0.05, 0.03))

const drums = stereo(seconds)
const bass = stereo(seconds)
const pads = stereo(seconds)
const arps = stereo(seconds)
const fx = stereo(seconds)
const sends = stereo(seconds)
const kicks: number[] = []

const hitKick = (at: number, gain = 1, sample = kick) => {
  place(drums, sample, at, 0.9 * gain)
  kicks.push(at)
}
const hitClap = (at: number, gain = 1) => {
  place(drums, clap, at, 0.42 * gain)
  place(sends, clap, at, 0.5 * gain)
}
const hitCrash = (at: number) => {
  place(fx, crash, at, 0.28, -0.3)
  place(fx, crash, at + 0.012, 0.28, 0.3)
  place(sends, crash, at, 0.3)
}
const hitImpact = (at: number) => {
  place(fx, impact, at, 0.75)
  place(sends, impact, at, 0.35)
  hitCrash(at)
}
// A snare roll that speeds up from eighths to sixteenths to thirty-seconds as it climbs.
const roll = (from: number, to: number) => {
  const gaps = [beat / 2, beat / 4, beat / 8]
  let t = from
  while (t < to) {
    const x = (t - from) / (to - from)
    place(drums, snare, t, 0.15 + 0.35 * x, (random() - 0.5) * 0.4)
    place(sends, snare, t, 0.2 * x)
    t += gaps[Math.min(Math.floor(x * 3), 2)]
  }
}

type Groove = {
  claps: boolean
  openHats: boolean
  closedHats: number
  arp: number
  half?: boolean
  cutoff: (t: number) => number
}

// One bar of the groove: drums, bass and chords, plus the arpeggio when it's up.
const grooveBar = (b: number, { claps, openHats, closedHats, arp, half, cutoff }: Groove) => {
  const start = b * bar
  const chord = progression[(b - 5 + 400) % 4]
  for (let k = 0; k < 4; k++) {
    const t = start + k * beat
    if (!half || k % 2 === 0) {
      hitKick(t)
    }
    if (claps && k % 2 === 1) {
      hitClap(t)
    }
    if (openHats) {
      place(drums, openHat, t + beat / 2, 0.2, 0.25)
    }
    place(bass, pluck(chord.root + 12, 0.25, 900, 0.1), t + beat / 2, 0.32)
  }
  for (let s = 0; s < 16; s++) {
    if (closedHats > 0) {
      place(drums, closedHat, start + s * (beat / 4), closedHats * (s % 2 === 0 ? 1 : 0.6), -0.2)
    }
  }
  place(bass, sub(chord.root, bar), start, 0.36)
  pad(pads, start, chord.notes, bar, cutoff, 0.5)
  if (arp > 0) {
    const shape = [0, 1, 2, 3, 4, 3, 2, 1]
    for (let s = 0; s < 16; s++) {
      const index = shape[s % 8]
      const note = index === 4 ? chord.notes[0] + 24 : chord.notes[index] + 12
      const hit = pluck(note, 0.35, 4200, 0.16)
      place(arps, hit, start + s * (beat / 4), arp, s % 2 === 0 ? -0.35 : 0.35)
    }
  }
}

const groove = (from: number, to: number, settings: (b: number) => Groove) => {
  for (let b = from; b < to; b++) {
    grooveBar(b, settings(b))
  }
}

// The hook, 0:00 to 0:09.5: an A minor pad opening up over a thin kick, ticking hats, claps, then a snare roll and a
// riser. It all stops dead half a beat before the drop.
const hookEnd = sections.hook.to - beat
pad(pads, 0, [57, 60, 64, 69], hookEnd - 0.05, (t) => 300 * 10 ** Math.min(t / hookEnd, 1), 0.55, 0.02)
place(bass, sub(33, hookEnd), 0, 0.22)
for (let t = 2; t < hookEnd; t += beat) {
  hitKick(t, 0.8, thinKick)
}
for (let t = 2; t < hookEnd; t += beat / 4) {
  place(drums, closedHat, t, 0.06 + 0.12 * ((t - 2) / (hookEnd - 2)), 0.2)
}
for (let t = 4.5; t < 8; t += 2 * beat) {
  hitClap(t, 0.8)
}
roll(8, hookEnd)
place(fx, riser(3.5), 6, 0.5)
place(sends, riser(3.5), 6, 0.2)

// The drop at 0:10, and the groove through the reveal and the first three features, with fills into each section.
hitImpact(sections.reveal.from)
const full = (cutoff: number, arp: number): Groove => ({
  claps: true,
  openHats: true,
  closedHats: 0.14,
  arp,
  cutoff: () => cutoff
})
groove(5, 15, (b) => full(3200, b >= 9 ? 0.12 : 0))
groove(15, 20, () => full(3600, 0.16))
groove(20, 28, () => full(4200, 0.14))
for (const section of [sections.reorder.from, sections.amazon.from, sections.handoffs.from]) {
  roll(section - 1, section)
  place(fx, riser(1), section - 1, 0.3)
  hitCrash(section)
}

// The handoffs ease off: half-time kick, no claps, a darker pad, then the full kick comes back to lead into the build.
groove(28, 33, () => ({ claps: false, openHats: false, closedHats: 0.1, arp: 0.14, half: true, cutoff: () => 2400 }))
groove(33, 35, () => full(2800, 0.14))

// The agents build: the pads open up bar by bar, a snare roll and a riser, then a beat of silence before the second
// drop.
const build = sections.agents
hitCrash(build.from)
groove(35, 40, () => ({
  ...full(0, 0.18),
  cutoff: (t) => 2400 + 3600 * Math.min((t - build.from) / (build.to - build.from), 1)
}))
roll(build.to - 2, build.to - beat / 2)
place(fx, riser(3.5), build.to - 4, 0.5)

// The recap's drop at 1:20, then the logo's chord at 1:24, left to ring out.
hitImpact(sections.recap.from)
groove(40, 42, () => full(5200, 0.18))
hitImpact(sections.end.from)
hitKick(sections.end.from)
pad(pads, sections.end.from, [48, 55, 60, 64, 67, 71, 76], 3.5, () => 3800, 0.9, 0.9)
place(bass, sub(36, 4), sections.end.from, 0.4)

// Pumping: everything but the drums ducks under each kick.
const pump = new Float32Array(drums.left.length).fill(1)
for (const k of kicks) {
  const start = Math.round(k * rate)
  for (let i = 0; i < Math.round(0.4 * rate) && start + i < pump.length; i++) {
    pump[start + i] = Math.min(pump[start + i], 1 - 0.62 * Math.exp(-i / rate / 0.09))
  }
}

const song = stereo(seconds)
mix(song, drums)
mix(song, bass, pump)
mix(song, pads, pump)
mix(song, arps, pump)
mix(song, echo(arps, beat * 0.75, 0.38), pump)
mix(song, fx)
mix(song, reverb(sends, 0.86, 0.35), 0.9)
mix(song, reverb(pads, 0.8, 0.5), 0.25)

// Silence before each drop, and a fade at the very end.
const silence = (from: number, to: number) => {
  for (let i = Math.round(from * rate); i < Math.round(to * rate); i++) {
    song.left[i] = 0
    song.right[i] = 0
  }
}
silence(hookEnd, sections.reveal.from)
silence(build.to - beat / 2, build.to)
for (let i = Math.round((seconds - 2) * rate); i < song.left.length; i++) {
  const fade = (song.left.length - i) / (2 * rate)
  song.left[i] *= fade
  song.right[i] *= fade
}

master(song)
// Again after mastering, whose filter would otherwise ring on into the gaps.
silence(hookEnd, sections.reveal.from)
silence(build.to - beat / 2, build.to)
await writeWav("public/audio/score.wav", song)
process.stdout.write("public/audio/score.wav\n")
