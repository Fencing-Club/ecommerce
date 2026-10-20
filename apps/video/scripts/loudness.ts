// Measures a 48 kHz WAV's integrated loudness (ITU-R BS.1770: K-weighted, gated, in LUFS) and its sample peak, for
// normalizing the ad's mixes. Usage: node scripts/loudness.ts <file.wav>
import { readFile } from "node:fs/promises"

const [path] = process.argv.slice(2)
if (!path) {
  throw new Error("Usage: node scripts/loudness.ts <file.wav>")
}

// The channels of a PCM or float WAV, as numbers from -1 to 1.
const decode = (file: Buffer) => {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let format = { encoding: 0, channels: 0, rate: 0, bits: 0 }
  for (let at = 12; at + 8 <= file.length;) {
    const id = file.toString("ascii", at, at + 4)
    const size = view.getUint32(at + 4, true)
    if (id === "fmt ") {
      format = {
        encoding: view.getUint16(at + 8, true),
        channels: view.getUint16(at + 10, true),
        rate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true)
      }
    }
    if (id === "data") {
      const bytes = format.bits / 8
      const frames = Math.floor(Math.min(size, file.length - at - 8) / (bytes * format.channels))
      const channels = Array.from({ length: format.channels }, () => new Float32Array(frames))
      for (let frame = 0; frame < frames; frame++) {
        for (let channel = 0; channel < format.channels; channel++) {
          const offset = at + 8 + (frame * format.channels + channel) * bytes
          channels[channel]![frame] =
            format.encoding === 3 ? view.getFloat32(offset, true) : view.getInt16(offset, true) / 32768
        }
      }
      return { rate: format.rate, channels }
    }
    at += 8 + size + (size % 2)
  }
  throw new Error(`${path} has no audio data`)
}

// The two-stage K-weighting filter at 48 kHz: a high shelf for the head, then a high-pass.
const weighted = (input: Float32Array) => {
  const stages = [
    { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] },
    { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] }
  ]
  let signal = input
  for (const { b, a } of stages) {
    const out = new Float32Array(signal.length)
    let [x1, x2, y1, y2] = [0, 0, 0, 0]
    for (let i = 0; i < signal.length; i++) {
      const x = signal[i]!
      const y = b[0]! * x + b[1]! * x1 + b[2]! * x2 - a[0]! * y1 - a[1]! * y2
      ;[x2, x1, y2, y1] = [x1, x, y1, y]
      out[i] = y
    }
    signal = out
  }
  return signal
}

const { rate, channels } = decode(await readFile(path))
if (rate !== 48000) {
  throw new Error(`${path} is ${rate} Hz; decode it at 48 kHz`)
}
const filtered = channels.map(weighted)
const length = filtered[0]?.length ?? 0

// Mean square in 400 ms blocks overlapping by 75%, summed over the channels.
const block = 0.4 * rate
const blocks: number[] = []
for (let start = 0; start + block <= length; start += block / 4) {
  let power = 0
  for (const channel of filtered) {
    let sum = 0
    for (let i = start; i < start + block; i++) {
      sum += channel[i]! ** 2
    }
    power += sum / block
  }
  blocks.push(power)
}
const loudness = (power: number) => -0.691 + 10 * Math.log10(power)
const mean = (powers: readonly number[]) => powers.reduce((sum, power) => sum + power, 0) / Math.max(1, powers.length)
const audible = blocks.filter((power) => loudness(power) > -70)
const gated = audible.filter((power) => loudness(power) > loudness(mean(audible)) - 10)
const peak = Math.max(
  ...channels.map((channel) => channel.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0))
)
process.stdout.write(`Integrated loudness: ${loudness(mean(gated)).toFixed(1)} LUFS\n`)
process.stdout.write(`Sample peak: ${(20 * Math.log10(peak)).toFixed(1)} dBFS\n`)
