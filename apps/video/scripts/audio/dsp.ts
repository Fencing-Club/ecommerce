// A small synthesis kit for the ad's score and sound effects: oscillators, filters, envelopes, reverb and a WAV
// writer, all at 44.1 kHz stereo.
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export const rate = 44100

export type Stereo = { left: Float32Array; right: Float32Array }

export const stereo = (seconds: number): Stereo => ({
  left: new Float32Array(Math.ceil(seconds * rate)),
  right: new Float32Array(Math.ceil(seconds * rate))
})

export const midi = (note: number) => 440 * 2 ** ((note - 69) / 12)

// A seeded random (Park-Miller), so every render is identical.
export const seeded = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
}

// White noise from a seeded random, -1 to 1.
export const noise = (random: () => number) => random() * 2 - 1

// Adds a mono signal into a stereo bus at `at` seconds; `pan` runs from -1 (left) to 1 (right).
export const place = (bus: Stereo, signal: Float32Array, at: number, gain = 1, pan = 0) => {
  const start = Math.round(at * rate)
  const left = gain * Math.cos(((pan + 1) * Math.PI) / 4)
  const right = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  const end = Math.min(signal.length, bus.left.length - start)
  for (let i = Math.max(0, -start); i < end; i++) {
    bus.left[start + i] += signal[i] * left
    bus.right[start + i] += signal[i] * right
  }
}

// Mixes `source` into `target`, scaled by `gain`, or by a gain curve sampled per sample.
export const mix = (target: Stereo, source: Stereo, gain: number | Float32Array = 1) => {
  for (let i = 0; i < target.left.length; i++) {
    const g = typeof gain === "number" ? gain : gain[i]
    target.left[i] += source.left[i] * g
    target.right[i] += source.right[i] * g
  }
}

// A saw with polyBLEP smoothing at the wrap, so high notes don't alias.
const blep = (phase: number, step: number) => {
  if (phase < step) {
    const x = phase / step
    return x + x - x * x - 1
  }
  if (phase > 1 - step) {
    const x = (phase - 1) / step
    return x * x + x + x + 1
  }
  return 0
}
export const saw = (phase: number, step: number) => 2 * phase - 1 - blep(phase, step)

type FilterType = "lowpass" | "highpass" | "bandpass"

// An RBJ biquad; call it once per sample with the cutoff for that sample.
export const filter = (type: FilterType, q = 0.707) => {
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let a1 = 0
  let a2 = 0
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  let tuned = -1
  const tune = (frequency: number) => {
    const w = (2 * Math.PI * Math.min(Math.max(frequency, 10), rate * 0.45)) / rate
    const cos = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    if (type === "lowpass") {
      b0 = (1 - cos) / 2 / a0
      b1 = (1 - cos) / a0
      b2 = b0
    } else if (type === "highpass") {
      b0 = (1 + cos) / 2 / a0
      b1 = -(1 + cos) / a0
      b2 = b0
    } else {
      b0 = alpha / a0
      b1 = 0
      b2 = -alpha / a0
    }
    a1 = (-2 * cos) / a0
    a2 = (1 - alpha) / a0
    tuned = frequency
  }
  return (x: number, frequency: number) => {
    if (frequency !== tuned) {
      tune(frequency)
    }
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}

// Attack, then exponential decay toward `sustain`, then release after `hold` seconds.
export const envelope = (t: number, attack: number, decay: number, sustain: number, hold: number, release: number) => {
  if (t < attack) {
    return t / attack
  }
  const level = sustain + (1 - sustain) * Math.exp(-(t - attack) / decay)
  if (t < hold) {
    return level
  }
  return level * Math.exp(-(t - hold) / release)
}

// Freeverb: eight damped combs into four allpasses per side. Returns only the wet signal.
export const reverb = (input: Stereo, room = 0.84, damp = 0.3) => {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
  const allpasses = [556, 441, 341, 225]
  const side = (spread: number) => {
    const out = new Float32Array(input.left.length)
    const lines = combs.map((length) => ({ buffer: new Float32Array(length + spread), index: 0, store: 0 }))
    const passes = allpasses.map((length) => ({ buffer: new Float32Array(length + spread), index: 0 }))
    for (let i = 0; i < out.length; i++) {
      const x = (input.left[i] + input.right[i]) * 0.015
      let sum = 0
      for (const line of lines) {
        const y = line.buffer[line.index]
        line.store = y * (1 - damp) + line.store * damp
        line.buffer[line.index] = x + line.store * room
        line.index = (line.index + 1) % line.buffer.length
        sum += y
      }
      for (const pass of passes) {
        const y = pass.buffer[pass.index]
        pass.buffer[pass.index] = sum + y * 0.5
        pass.index = (pass.index + 1) % pass.buffer.length
        sum = y - sum
      }
      out[i] = sum
    }
    return out
  }
  return { left: side(0), right: side(23) }
}

// A ping-pong echo: each repeat swaps sides and fades by `feedback`.
export const echo = (input: Stereo, delay: number, feedback: number, repeats = 5) => {
  const out = stereo(input.left.length / rate)
  const shift = Math.round(delay * rate)
  for (let r = 1; r <= repeats; r++) {
    const gain = feedback ** r
    const swap = r % 2 === 1
    for (let i = 0; i + r * shift < out.left.length; i++) {
      out.left[i + r * shift] += (swap ? input.right[i] : input.left[i]) * gain
      out.right[i + r * shift] += (swap ? input.left[i] : input.right[i]) * gain
    }
  }
  return out
}

// Soft-clips, removes rumble below 30 Hz, and scales the loudest peak to `peak`.
export const master = (bus: Stereo, peak = 0.89) => {
  for (const channel of [bus.left, bus.right]) {
    const rumble = filter("highpass")
    for (let i = 0; i < channel.length; i++) {
      channel[i] = Math.tanh(rumble(channel[i], 30) * 1.1)
    }
  }
  let loudest = 0
  for (let i = 0; i < bus.left.length; i++) {
    loudest = Math.max(loudest, Math.abs(bus.left[i]), Math.abs(bus.right[i]))
  }
  for (const channel of [bus.left, bus.right]) {
    for (let i = 0; i < channel.length; i++) {
      channel[i] *= peak / loudest
    }
  }
}

// Writes 16-bit stereo PCM.
export const writeWav = async (path: string, bus: Stereo) => {
  const frames = bus.left.length
  const data = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.left[i])) * 32767), i * 4)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.right[i])) * 32767), i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(data.length, 40)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.concat([header, data]))
}
