"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { whenPageIdle } from "./use-page-idle"
import { releaseWhenGone } from "./webgl"

// The hero's backdrop, drawn with WebGL: a grid of points, one for every unit on the shelf. It opens on the mess a
// restock makes, the points scattered and drifting with a few red stockouts among them, then settles into order, as
// the ad's drop does. Once settled, a slow band of light sweeps across it, and the points warm up around the pointer.
// `settled` starts it in order, for the page's close.

const vertex = `
attribute vec2 a_cell;
attribute float a_seed;
uniform vec2 u_size;
uniform float u_spacing;
uniform float u_time;
uniform float u_chaos;
uniform vec2 u_pointer;
uniform float u_dpr;
varying float v_alpha;
varying float v_warm;
varying float v_alarm;
void main() {
  vec2 home = (a_cell + 0.5) * u_spacing;
  float speed = 0.35 + fract(a_seed * 7.13) * 0.5;
  vec2 wander = vec2(
    sin(a_seed * 91.7 + u_time * speed) + 0.6 * sin(a_seed * 17.3 + u_time * speed * 1.7),
    cos(a_seed * 47.1 + u_time * speed * 0.9) + 0.6 * cos(a_seed * 29.9 + u_time * speed * 1.3)
  ) * u_spacing * 1.6;
  vec2 scatter = (vec2(fract(a_seed * 13.7), fract(a_seed * 5.3)) - 0.5) * u_spacing * 9.0;
  vec2 p = home + (wander + scatter) * u_chaos;
  float sweep = 0.5 + 0.5 * sin((home.x + home.y * 0.6) * 0.011 - u_time * 0.8);
  float near = 1.0 - smoothstep(0.0, 220.0, distance(p, u_pointer));
  vec2 c = (p - vec2(u_size.x * 0.5, u_size.y * 0.08)) / u_size * vec2(1.4, 2.4);
  float stage = exp(-dot(c, c) * 3.0);
  v_warm = clamp(stage * 1.2 + near * 0.9, 0.0, 1.0);
  v_alarm = u_chaos * step(0.9, fract(a_seed * 3.71));
  v_alpha = 0.1 + 0.34 * stage + 0.45 * near + 0.22 * pow(sweep, 4.0) * (1.0 - u_chaos) + 0.55 * v_alarm;
  vec2 clip = p / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = (2.0 + 1.8 * near + 0.9 * stage + 1.4 * v_alarm) * u_dpr;
}`

const fragment = `
precision mediump float;
varying float v_alpha;
varying float v_warm;
varying float v_alarm;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float disc = 1.0 - smoothstep(0.32, 0.5, r);
  vec3 color = mix(mix(vec3(0.98), vec3(1.0, 0.54, 0.24), v_warm), vec3(1.0, 0.35, 0.31), v_alarm);
  float alpha = clamp(v_alpha, 0.0, 1.0) * disc;
  gl_FragColor = vec4(color * alpha, alpha);
}`

const spacing = 26

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) {
    return null
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}

function link(gl: WebGLRenderingContext) {
  const program = gl.createProgram()
  const parts = [compile(gl, gl.VERTEX_SHADER, vertex), compile(gl, gl.FRAGMENT_SHADER, fragment)]
  if (!program || parts.some((part) => !part)) {
    return null
  }
  for (const part of parts) {
    if (part) {
      gl.attachShader(program, part)
    }
  }
  gl.linkProgram(program)
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null
}

const ease = (value: number) => {
  const t = Math.min(1, Math.max(0, value))
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// Draws the field on `canvas` until the returned function stops it.
function play(canvas: HTMLCanvasElement | null, settled: boolean) {
  const gl = canvas?.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true })
  const program = gl && link(gl)
  if (!canvas || !gl || !program) {
    return
  }
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches
  const calm = still || settled
  const cells = gl.createBuffer()
  const at = (name: string) => gl.getUniformLocation(program, name)
  const cellAttribute = gl.getAttribLocation(program, "a_cell")
  const seedAttribute = gl.getAttribLocation(program, "a_seed")
  gl.useProgram(program)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  let size = { width: 0, height: 0 }
  let count = 0
  let dpr = 1
  const pointer = { x: -1e4, y: -1e4 }
  const start = performance.now()
  let frame = 0
  let visible = true

  // One point per grid cell over the canvas, each with its own seed for how it wanders.
  const layout = () => {
    dpr = Math.min(devicePixelRatio || 1, 2)
    size = { width: canvas.clientWidth, height: canvas.clientHeight }
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    gl.viewport(0, 0, canvas.width, canvas.height)
    const columns = Math.ceil(size.width / spacing)
    const rows = Math.ceil(size.height / spacing)
    const data = new Float32Array(columns * rows * 3)
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const i = (row * columns + column) * 3
        data[i] = column
        data[i + 1] = row
        data[i + 2] = (((column * 12.9898 + row * 78.233) % 1) + Math.abs(Math.sin(column * 3.1 + row * 1.7))) % 1
      }
    }
    count = columns * rows
    gl.bindBuffer(gl.ARRAY_BUFFER, cells)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(cellAttribute)
    gl.vertexAttribPointer(cellAttribute, 2, gl.FLOAT, false, 12, 0)
    gl.enableVertexAttribArray(seedAttribute)
    gl.vertexAttribPointer(seedAttribute, 1, gl.FLOAT, false, 12, 8)
  }

  const draw = (now: number) => {
    frame = 0
    const time = (now - start) / 1000
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(at("u_size"), size.width, size.height)
    gl.uniform1f(at("u_spacing"), spacing)
    gl.uniform1f(at("u_time"), still ? 0 : time)
    gl.uniform1f(at("u_chaos"), calm ? 0 : 1 - ease((time - 0.5) / 1.8))
    gl.uniform2f(at("u_pointer"), pointer.x, pointer.y)
    gl.uniform1f(at("u_dpr"), dpr)
    gl.drawArrays(gl.POINTS, 0, count)
    if (!still && visible) {
      frame = requestAnimationFrame(draw)
    }
  }
  const resume = () => {
    if (!frame) {
      frame = requestAnimationFrame(draw)
    }
  }

  const resize = new ResizeObserver(() => {
    layout()
    resume()
  })
  resize.observe(canvas)
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true
    if (visible) {
      resume()
    }
  })
  seen.observe(canvas)
  const move = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect()
    pointer.x = event.clientX - box.left
    pointer.y = event.clientY - box.top
  }
  addEventListener("pointermove", move, { passive: true })
  return () => {
    cancelAnimationFrame(frame)
    resize.disconnect()
    seen.disconnect()
    removeEventListener("pointermove", move)
    releaseWhenGone(canvas, gl)
  }
}

export function DotField({ settled = false, className }: { settled?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) {
      return
    }
    let stop: (() => void) | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    // A browser that won't make the context, as while its GPU process restarts, gets one more try a moment later.
    const start = (again: boolean) => {
      stop = play(canvas, settled)
      if (!stop && again) {
        retry = setTimeout(() => start(false), 1000)
      }
    }
    // A phone can drop the context to free memory. Preventing the default lets the browser give it back, and the field
    // starts over on it.
    const lost = (event: Event) => {
      event.preventDefault()
      stop?.()
      stop = undefined
    }
    const restored = () => start(false)
    canvas.addEventListener("webglcontextlost", lost)
    canvas.addEventListener("webglcontextrestored", restored)
    // WebGL starts once the page is idle, so compiling its shaders stays out of the way of the first paint and hydration.
    const cancel = whenPageIdle(() => start(true))
    return () => {
      cancel()
      clearTimeout(retry)
      stop?.()
      canvas.removeEventListener("webglcontextlost", lost)
      canvas.removeEventListener("webglcontextrestored", restored)
    }
  }, [settled])
  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />
}
