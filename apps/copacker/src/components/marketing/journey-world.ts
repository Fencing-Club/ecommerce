import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

// The journey's world: a paper diorama of one purchase order's trip, from the supplier's factory through customs to
// Amazon and the seller's own warehouse, built from rounded blocks and played by the page's scroll. `frame` poses the
// whole scene for a point on the trip, 0 to 1, and a time for the idle motion (the water, the smoke, the belt, the
// ship's bob). Nothing carries over from one frame to the next, so the trip scrubs both ways. The beats line up with
// the chapters, notes and documents in ./journey.
//
// The ground runs along x: the supplier's side (x -25 to 0), the sea (0 to 34), then the destination (34 to 65). z runs
// toward the viewer, and y is up, with the ground at 0.

export type Place =
  | "factory"
  | "order"
  | "stickers"
  | "fit"
  | "labels"
  | "packing"
  | "china"
  | "quay"
  | "ship"
  | "customs"
  | "fba"
  | "yours"

export type World = {
  // Sizes the view, with the scene's subject placed at `focus`, a share of the width and height from the top left.
  resize: (width: number, height: number, focus: { x: number; y: number }) => void
  frame: (progress: number, time: number) => void
  // Where a place is on screen, in pixels from the top left.
  locate: (place: Place) => { x: number; y: number }
  dispose: () => void
}

const palette = {
  land: "#f4eee5",
  quay: "#e3dacd",
  road: "#e8e0d4",
  seaBed: "#86b1c0",
  sea: "#a7cad6",
  wall: "#fbf8f3",
  roof: "#5f5750",
  roofLight: "#ded5c8",
  glass: "#46413c",
  orange: "#f54a00",
  orangeSoft: "#ff8f45",
  kraft: "#c99760",
  kraftDark: "#b5834f",
  tape: "#e6c28e",
  wood: "#b98b5c",
  ink: "#26221f",
  navy: "#232f3e",
  white: "#ffffff",
  cream: "#efe7da",
  steel: "#c9ccd1",
  belt: "#3a3632",
  leaf: "#a8bf92",
  leafDark: "#8fae7c",
  trunk: "#8b6b4b",
  smoke: "#f6f2ec",
  cloud: "#ffffff"
} as const

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const span = (p: number, from: number, to: number) => clamp((p - from) / (to - from))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeOut = (t: number) => 1 - (1 - t) ** 3
const smooth = (t: number) => t * t * (3 - 2 * t)
// Overshoots a little, then settles: for things that pop into place.
const pop = (t: number) => {
  if (t <= 0) {
    return 0
  }
  if (t >= 1) {
    return 1
  }
  return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2
}
// Up and back down over t, for hops.
const hop = (t: number) => 4 * t * (1 - t)

type Point = readonly [number, number]

// A route over the ground, walked by distance so a vehicle keeps a steady pace. The heading looks a little ahead and
// behind, which rounds off the corners.
function route(points: readonly Point[]) {
  const legs = points.slice(1).map((point, i) => {
    const from = points[i] ?? point
    return { from, to: point, length: Math.hypot(point[0] - from[0], point[1] - from[1]) }
  })
  const length = legs.reduce((total, leg) => total + leg.length, 0)
  const position = (distance: number) => {
    let left = clamp(distance, 0, length)
    for (const [i, leg] of legs.entries()) {
      if (left <= leg.length || i === legs.length - 1) {
        const k = leg.length ? left / leg.length : 0
        return { x: lerp(leg.from[0], leg.to[0], k), z: lerp(leg.from[1], leg.to[1], k) }
      }
      left -= leg.length
    }
    return { x: points[0]?.[0] ?? 0, z: points[0]?.[1] ?? 0 }
  }
  const at = (distance: number) => {
    const here = position(distance)
    const ahead = position(Math.min(length, distance + 0.6))
    const behind = position(Math.max(0, distance - 0.6))
    return { ...here, heading: Math.atan2(-(ahead.z - behind.z), ahead.x - behind.x) }
  }
  return { length, at }
}

// Canvas-drawn pictures: the purchase order's page, the labels, the containers' ribs, the belt and the lettering.
function drawn(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (context) {
    draw(context)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// The beats of the trip, as points on it. ./journey's chapters, notes and documents follow the same ones.
const beat = {
  order: [0.02, 0.08],
  lit: [0.07, 0.1],
  // The packing line: units out of the door with their FNSKU and suffocation warning labels on, a box formed and
  // right-sized round them, then sealed, given its carton and shipping labels, and stacked, and the rest of the order
  // after it.
  units: [0.105, 0.17],
  box: [0.17, 0.185],
  fit: [0.19, 0.21],
  seal: [0.21, 0.22],
  toLabeler: [0.22, 0.23],
  labels: [0.23, 0.24],
  toEnd: [0.24, 0.25],
  stack: [0.25, 0.265],
  rest: [0.265, 0.335],
  // The split: Amazon picks up the AWD share, the forwarder the rest.
  forwarderLoad: [0.35, 0.39],
  amazonIn: [0.34, 0.38],
  amazonLoad: [0.38, 0.42],
  forwarderDrive: [0.4, 0.47],
  amazonDrive: [0.43, 0.47],
  awd: [0.47, 0.5],
  lift: [0.5, 0.56],
  sail: [0.57, 0.69],
  // At the other end the crane unloads both containers onto the forwarder's truck, which leaves the seller's at
  // customs and waits at the barrier. Once customs releases the order, FedEx loads the seller's cartons at the customs
  // dock, and the forwarder takes Amazon's container to FBA and drives off. FedEx follows, to the seller's warehouse.
  unloadFirst: [0.7, 0.73],
  unloadSecond: [0.73, 0.76],
  toCustoms: [0.765, 0.78],
  customsDrop: [0.782, 0.8],
  release: [0.805, 0.815],
  pickup: [0.818, 0.842],
  toFba: [0.82, 0.845],
  fbaDrop: [0.845, 0.865],
  away: [0.865, 0.89],
  fedexOut: [0.845, 0.865],
  toYours: [0.87, 0.915],
  yoursDrop: [0.92, 0.945]
} satisfies Record<string, [number, number]>
const during = (p: number, [from, to]: [number, number]) => span(p, from, to)

// `words` are the ones painted into the world in the reader's language: the purchase order's name on its page.
export function createWorld(canvas: HTMLCanvasElement, words: { purchaseOrder: string; customs: string }): World {
  // Phones and tablets get a lighter renderer, with fewer pixels and a smaller shadow map, so the world fits in their
  // GPU's memory next to the hero's. A browser that won't make an anti-aliased context gets one more try without.
  const handheld = matchMedia("(pointer: coarse)").matches
  const make = (antialias: boolean) =>
    new THREE.WebGLRenderer({
      canvas,
      antialias,
      alpha: true,
      powerPreference: handheld ? "default" : "high-performance"
    })
  let renderer: THREE.WebGLRenderer
  try {
    renderer = make(true)
  } catch {
    renderer = make(false)
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, handheld ? 1.5 : 2))
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400)
  // The camera looks from the front right and above, so the route reads left to right.
  const view = new THREE.Vector3(0.42, 0.88, 1.3).normalize()
  const size = { width: 1, height: 1, focus: { x: 0.5, y: 0.5 } }

  scene.add(new THREE.HemisphereLight("#fff9f0", "#e6d7c4", 1.7))
  const sun = new THREE.DirectionalLight("#fff3e3", 2.3)
  sun.castShadow = true
  sun.shadow.mapSize.setScalar(handheld ? 1024 : 2048)
  sun.shadow.radius = 4
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  scene.add(sun, sun.target)

  const font = getComputedStyle(document.body).fontFamily || "sans-serif"
  const disposables: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(thing: T) => {
    disposables.push(thing)
    return thing
  }

  const paint = (color: string, options: THREE.MeshStandardMaterialParameters = {}) =>
    keep(new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...options }))
  const solid = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    keep(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }
  // A rounded block standing on y = 0 of its own frame.
  const rounded = (w: number, h: number, d: number, radius = 0.08) => {
    const geometry = new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, Math.min(radius, w / 2, h / 2, d / 2) - 0.001))
    geometry.translate(0, h / 2, 0)
    return geometry
  }
  const block = (w: number, h: number, d: number, material: THREE.Material, radius = 0.08) =>
    solid(rounded(w, h, d, radius), material)
  const at = <T extends THREE.Object3D>(object: T, x: number, y: number, z: number) => {
    object.position.set(x, y, z)
    return object
  }
  const put = <T extends THREE.Object3D>(object: T, x = 0, y = 0, z = 0) => {
    scene.add(at(object, x, y, z))
    return object
  }
  const cylinder = (radius: number, height: number, material: THREE.Material, segments = 20) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments)
    geometry.translate(0, height / 2, 0)
    return solid(geometry, material)
  }
  // Lettering or a label, printed on a flat sheet that sits on a face.
  const decal = (texture: THREE.Texture, width: number, height: number) => {
    const mesh = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(width, height)),
      keep(new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6 }))
    )
    mesh.receiveShadow = true
    return mesh
  }

  const matte = {
    land: paint(palette.land, { roughness: 0.95 }),
    quay: paint(palette.quay, { roughness: 0.95 }),
    road: paint(palette.road, { roughness: 0.95 }),
    wall: paint(palette.wall),
    roof: paint(palette.roof),
    roofLight: paint(palette.roofLight),
    orange: paint(palette.orange, { roughness: 0.6 }),
    orangeSoft: paint(palette.orangeSoft, { roughness: 0.6 }),
    ink: paint(palette.ink, { roughness: 0.6 }),
    navy: paint(palette.navy, { roughness: 0.55 }),
    white: paint(palette.white, { roughness: 0.55 }),
    cream: paint(palette.cream),
    wood: paint(palette.wood, { roughness: 0.9 }),
    kraft: paint(palette.kraft, { roughness: 0.9 }),
    kraftDark: paint(palette.kraftDark, { roughness: 0.9 }),
    tape: paint(palette.tape, { roughness: 0.5 }),
    steel: paint(palette.steel, { roughness: 0.3, metalness: 0.55 }),
    leaf: paint(palette.leaf, { flatShading: true }),
    leafDark: paint(palette.leafDark, { flatShading: true }),
    trunk: paint(palette.trunk),
    smoke: paint(palette.smoke, { roughness: 1 }),
    cloud: paint(palette.cloud, { roughness: 1 }),
    glass: paint(palette.glass, { roughness: 0.35 })
  }

  // ---------------------------------------------------------------------------------------------------- The ground
  put(block(25, 1.6, 20, matte.land, 0.5), -12.5, -1.6, 0)
  put(block(31, 1.6, 20, matte.land, 0.5), 49.5, -1.6, 0)
  put(block(34.6, 1.22, 19.4, paint(palette.seaBed), 0.3), 17, -1.6, 0)
  put(block(1.2, 0.08, 19.2, matte.quay, 0.03), -0.7, 0, 0)
  put(block(1.2, 0.08, 19.2, matte.quay, 0.03), 34.7, 0, 0)
  put(block(23.4, 0.05, 1.8, matte.road, 0.02), -13, 0, 3)
  put(block(1.8, 0.05, 6.1, matte.road, 0.02), -8, 0, -0.95)
  put(block(29.4, 0.05, 1.8, matte.road, 0.02), 49.9, 0, 3)
  for (const x of [50.5, 60]) {
    put(block(2.4, 0.05, 1.3, matte.road, 0.02), x, 0, 1.55)
  }
  // The yard in front of customs, a little lower than the road so the two never flicker where they meet.
  put(block(7.4, 0.04, 4.3, matte.road, 0.02), 41.8, 0, -0.1)
  // Dashes down the middle of the roads.
  const dashes = [-23, -20, -17, -14, -11, -5, -2, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64]
  const lines = new THREE.InstancedMesh(keep(rounded(0.7, 0.02, 0.12, 0.01)), matte.white, dashes.length)
  for (const [i, x] of dashes.entries()) {
    lines.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.05, 3))
  }
  lines.receiveShadow = true
  scene.add(lines)

  // The sea: a sheet of soft waves, pale by the quays and deeper out in the middle, with foam lapping at the quays and
  // round the ship's hull, and slow glints of light drifting over it. Its color is worked out for every point of it from
  // where the point is on the board.
  const waterGeometry = keep(new THREE.PlaneGeometry(34, 19.2, 68, 38))
  waterGeometry.rotateX(-Math.PI / 2)
  const sea = {
    tide: { value: 0 },
    hull: { value: new THREE.Vector2(5.8, 3) },
    shallow: { value: new THREE.Color("#c3e3e8") },
    deep: { value: new THREE.Color("#79adbf") }
  }
  const seaMaterial = paint(palette.sea, { roughness: 0.4 })
  seaMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sea)
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 seaPoint;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nseaPoint = (modelMatrix * vec4(transformed, 1.0)).xyz;")
    // The glints are contour lines of a slowly drifting noise, stretched along the sea, which reads as lines of
    // ripples rather than a pattern.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 seaPoint;
        uniform float tide;
        uniform vec2 hull;
        uniform vec3 shallow;
        uniform vec3 deep;
        float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float seaNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), u.x), mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float shore = min(seaPoint.x, 34.0 - seaPoint.x);
        diffuseColor.rgb = mix(shallow, deep, smoothstep(0.4, 9.0, shore));
        vec2 drift = seaPoint.xz * vec2(0.22, 0.6) + vec2(tide * 0.05, tide * 0.02);
        float swell = seaNoise(drift) * 0.65 + seaNoise(drift * 2.3 + 7.0) * 0.35;
        float ripple = 1.0 - smoothstep(0.0, 0.045, abs(fract(swell * 3.0) - 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, shallow, 0.35 * ripple * smoothstep(0.6, 3.0, shore));
        float lap = 0.5 + 0.14 * sin(seaPoint.z * 2.3 + tide * 1.7);
        float foam = 1.0 - smoothstep(lap - 0.3, lap, shore);
        float ring = length((seaPoint.xz - hull) / vec2(6.1, 1.75));
        foam = max(foam, 0.5 * smoothstep(0.9, 1.0, ring) * (1.0 - smoothstep(1.0, 1.16, ring)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.85 * foam);`
      )
  }
  const water = new THREE.Mesh(waterGeometry, seaMaterial)
  water.receiveShadow = true
  put(water, 17, -0.32, 0)
  const waterBase = Float32Array.from(waterGeometry.attributes.position?.array ?? [])

  // ---------------------------------------------------------------------------------------------------- The factory
  // Shenzhen Metalworks: a sawtooth-roofed factory with an orange door at the head of its packing line, and a chimney.
  const factory = put(new THREE.Group(), -19.5, 0, -5.4)
  factory.add(block(8, 2.8, 4.6, matte.wall, 0.14))
  const tooth = (w: number, h: number, d: number) => {
    const shape = new THREE.Shape()
    shape.moveTo(-w / 2, 0)
    shape.lineTo(w / 2, 0)
    shape.lineTo(-w / 2, h)
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false })
    geometry.translate(0, 0, -d / 2)
    return solid(geometry, matte.roof)
  }
  for (let i = 0; i < 3; i++) {
    factory.add(at(tooth(8 / 3, 1.1, 4.4), -4 + (i + 0.5) * (8 / 3), 2.8, 0))
  }
  factory.add(at(cylinder(0.32, 2.4, matte.orange), 3.05, 2.8, -1.3))
  factory.add(at(cylinder(0.36, 0.22, matte.ink), 3.05, 5.2, -1.3))
  // The door rolls up, showing the dark inside, to take the purchase order in and to let the units out.
  factory.add(at(block(1.36, 1.72, 0.03, matte.ink, 0.01), -3.1, 0, 2.315))
  const factoryDoor = at(block(1.5, 1.8, 0.12, matte.orange, 0.03), -3.1, 0, 2.3)
  factory.add(factoryDoor)
  const glow = paint(palette.glass, { roughness: 0.35, emissive: "#ff9a45", emissiveIntensity: 0 })
  for (const x of [-0.8, 0.8, 2.4]) {
    factory.add(at(block(0.85, 0.7, 0.08, glow, 0.02), x, 1.5, 2.3))
  }
  const puffs = Array.from({ length: 4 }, () => {
    const puff = solid(keep(new THREE.IcosahedronGeometry(0.36, 1)), matte.smoke)
    puff.castShadow = false
    return put(puff)
  })

  // The packing line along the factory's front: a belt from the door, an FNSKU labeler over it, the frame where each
  // box is sized to what it holds, and a carton labeler at the end.
  const line = { from: -23.1, to: -14.5, z: -2.3, top: 0.62 }
  const stations = { stickers: -20.8, fit: -18.4, labels: -16.3, end: -14.95 }
  const beltTexture = keep(
    drawn(256, 32, (context) => {
      context.fillStyle = palette.belt
      context.fillRect(0, 0, 256, 32)
      context.fillStyle = "rgba(255,255,255,0.12)"
      for (let x = 0; x < 256; x += 16) {
        context.fillRect(x, 0, 3, 32)
      }
    })
  )
  beltTexture.wrapS = THREE.RepeatWrapping
  beltTexture.repeat.set(10, 1)
  const beltLength = line.to - line.from
  put(block(beltLength + 0.3, 0.5, 1.05, matte.ink, 0.06), (line.from + line.to) / 2, 0.08, line.z)
  const beltTop = put(
    new THREE.Mesh(
      keep(new THREE.PlaneGeometry(beltLength, 0.9).rotateX(-Math.PI / 2)),
      keep(new THREE.MeshStandardMaterial({ map: beltTexture, roughness: 0.7 }))
    ),
    (line.from + line.to) / 2,
    line.top - 0.035,
    line.z
  )
  beltTop.receiveShadow = true
  for (const x of [line.from + 0.4, (line.from + line.to) / 2, line.to - 0.4]) {
    for (const dz of [-0.4, 0.4]) {
      put(block(0.12, 0.1, 0.12, matte.ink, 0.02), x, 0, line.z + dz)
    }
  }
  // A gantry over the belt: two posts and a head, with a lamp that lights while it works.
  const gantry = (x: number, head: THREE.Material) => {
    const group = put(new THREE.Group(), x, 0, line.z)
    for (const dz of [-0.62, 0.62]) {
      group.add(at(block(0.12, 1.55, 0.12, matte.ink, 0.03), 0, 0, dz))
    }
    group.add(at(block(0.5, 0.16, 1.36, matte.white, 0.04), 0, 1.5, 0))
    group.add(at(block(0.56, 0.38, 0.62, head, 0.08), 0, 1.12, 0))
    const lamp = paint(palette.orange, { emissive: palette.orange, emissiveIntensity: 0, roughness: 0.4 })
    group.add(at(block(0.2, 0.06, 0.2, lamp, 0.02), 0, 1.1, 0.26))
    return lamp
  }
  const stickerLamp = gantry(stations.stickers, matte.white)
  const fitLamp = gantry(stations.fit, matte.orangeSoft)
  const labelLamp = gantry(stations.labels, matte.white)

  // ---------------------------------------------------------------------------------------------------- Warehouses
  // A warehouse facing its road, with an orange band and loading doors that light up as stock arrives.
  const warehouse = (x: number, z: number, width: number) => {
    const group = put(new THREE.Group(), x, 0, z)
    group.add(block(width, 3, 4.4, matte.wall, 0.12))
    group.add(at(block(width + 0.24, 0.24, 4.64, matte.roofLight, 0.06), 0, 3, 0))
    group.add(at(block(width - 0.6, 0.34, 0.08, matte.orange, 0.02), 0, 2.35, 2.2))
    const door = paint(palette.glass, { roughness: 0.4, emissive: "#ffb070", emissiveIntensity: 0 })
    for (const offset of [-1.4, 0, 1.4]) {
      group.add(at(block(1.05, 1.45, 0.08, door, 0.02), offset, 0, 2.2))
    }
    return door
  }
  const chinaDoor = warehouse(-8, -6.2, 6.4)
  const fbaDoor = warehouse(50.5, -1.2, 6)

  // The seller's own warehouse: smaller, with a pitched roof, a roll-up door and its name over it.
  const yours = put(new THREE.Group(), 60, 0, -1.2)
  yours.add(block(5.6, 2.3, 4, matte.cream, 0.12))
  const gable = new THREE.Shape()
  gable.moveTo(-3, 0)
  gable.lineTo(3, 0)
  gable.lineTo(0, 1)
  gable.closePath()
  const roofGeometry = new THREE.ExtrudeGeometry(gable, { depth: 4.3, bevelEnabled: false })
  roofGeometry.translate(0, 0, -2.15)
  yours.add(at(solid(roofGeometry, matte.roof), 0, 2.3, 0))
  const yoursDoor = paint("#8b847c", { roughness: 0.6, emissive: "#ffb070", emissiveIntensity: 0 })
  yours.add(at(block(2, 1.55, 0.08, yoursDoor, 0.02), -0.9, 0, 2))
  const yoursDoorX = 60 - 0.9
  const yoursFront = -1.2 + 2
  const sign = decal(
    keep(
      drawn(512, 96, (context) => {
        context.fillStyle = palette.ink
        context.beginPath()
        context.roundRect(0, 0, 512, 96, 18)
        context.fill()
        context.fillStyle = "#ffffff"
        context.font = `700 44px ${font}`
        context.textAlign = "center"
        context.fillText("RIDGELINE GOODS", 256, 64)
      })
    ),
    2.4,
    0.45
  )
  yours.add(at(sign, 1.3, 1.75, 2.02))

  // ---------------------------------------------------------------------------------------------------- Customs
  // The port's customs house: a door the seller's container goes in by, and a dock where FedEx backs up to collect its
  // cartons. Across the road, a booth whose barrier lifts and whose lamp turns green when customs releases the order.
  const customs = put(new THREE.Group(), 41.8, 0, -4)
  const customsFront = -4 + 1.8
  customs.add(block(7, 2.7, 3.6, matte.cream, 0.12))
  customs.add(at(block(7.24, 0.24, 3.84, matte.roofLight, 0.06), 0, 2.7, 0))
  customs.add(at(block(6.4, 0.46, 0.08, matte.navy, 0.02), 0, 2.12, 1.8))
  const customsDoor = paint(palette.glass, { roughness: 0.4, emissive: "#ffb070", emissiveIntensity: 0 })
  customs.add(at(block(2.6, 1.6, 0.08, customsDoor, 0.02), -1.3, 0, 1.8))
  customs.add(at(block(1.7, 1.98, 0.08, matte.glass, 0.02), 1.6, 0, 1.8))
  const customsName = decal(
    keep(
      drawn(512, 64, (context) => {
        context.fillStyle = "#ffffff"
        context.textAlign = "center"
        context.letterSpacing = "6px"
        // The sign is in the reader's language, and a long word shrinks to fit it.
        const sign = words.customs.toLocaleUpperCase()
        context.font = `700 40px ${font}`
        context.font = `700 ${Math.min(40, (40 * 470) / Math.max(1, context.measureText(sign).width))}px ${font}`
        context.fillText(sign, 256, 46)
      })
    ),
    3.2,
    0.4
  )
  customs.add(at(customsName, 0, 2.35, 1.85))
  const booth = put(new THREE.Group(), 46.6, 0, 4.95)
  booth.add(block(0.9, 1.15, 0.9, matte.white, 0.08))
  booth.add(at(block(1.1, 0.12, 1.1, matte.navy, 0.04), 0, 1.15, 0))
  booth.add(at(block(0.6, 0.4, 0.04, matte.glass, 0.01), 0, 0.55, 0.45))
  const stop = new THREE.Color("#ef4444")
  const go = new THREE.Color("#22c55e")
  const signal = paint("#ef4444", { emissive: "#ef4444", emissiveIntensity: 0.9, roughness: 0.4 })
  booth.add(at(block(0.24, 0.2, 0.24, signal, 0.06), 0, 1.27, 0))
  // The barrier's arm, striped and hinged at the booth, reaching across the road.
  const arm = put(new THREE.Group(), 46.6, 0.8, 4.45)
  for (let i = 0; i < 5; i++) {
    arm.add(at(block(0.1, 0.1, 0.5, i % 2 ? matte.white : matte.orange, 0.03), 0, -0.05, -0.25 - i * 0.5))
  }

  const tree = (x: number, z: number, scale: number, light: boolean) => {
    const group = put(new THREE.Group(), x, 0, z)
    group.add(cylinder(0.12, 0.7, matte.trunk, 8))
    const crown = solid(keep(new THREE.IcosahedronGeometry(0.75, 0)), light ? matte.leaf : matte.leafDark)
    group.add(at(crown, 0, 1.25, 0))
    group.scale.setScalar(scale)
  }
  const trees: [number, number, number][] = [
    [-24, 7, 1],
    [-22.4, 8.2, 0.8],
    [-13, 7.4, 1.1],
    [-4.5, 7.8, 0.9],
    [-24, -9, 0.8],
    [-13.4, -8.4, 1],
    [-2.6, -6.5, 0.9],
    [38, 7.6, 1],
    [49, 7.2, 1.2],
    [57, 7.8, 0.9],
    [63.6, 6.8, 1],
    [63.2, -6.8, 1],
    [54.8, -7.4, 0.8],
    [36.6, -7.5, 0.9]
  ]
  for (const [i, [x, z, scale]] of trees.entries()) {
    tree(x, z, scale, i % 2 === 0)
  }

  // Soft clouds drifting over the board. Their shadows would read as spots without the clouds in view, so they cast
  // none.
  const puffShapes: [number, number, number][] = [
    [0, 0, 1],
    [1.1, -0.2, 0.75],
    [-1.1, -0.25, 0.7],
    [0.4, 0.45, 0.65]
  ]
  const clouds = [
    { x: -8, z: -3, y: 11, scale: 1.2, speed: 0.35 },
    { x: 20, z: 4, y: 12, scale: 1, speed: 0.28 },
    { x: 50, z: -5, y: 11.5, scale: 1.1, speed: 0.32 }
  ].map((cloud) => {
    const group = put(new THREE.Group(), cloud.x, cloud.y, cloud.z)
    for (const [dx, dy, r] of puffShapes) {
      const puff = solid(keep(new THREE.IcosahedronGeometry(r, 2)), matte.cloud)
      puff.castShadow = false
      puff.receiveShadow = false
      group.add(at(puff, dx, dy, 0))
    }
    group.scale.set(cloud.scale * 1.4, cloud.scale * 0.8, cloud.scale)
    return { group, ...cloud }
  })

  // ---------------------------------------------------------------------------------------------------- Labels
  const barcode = (context: CanvasRenderingContext2D, x0: number, y0: number, width: number, height: number) => {
    let x = x0
    let seed = 7
    context.fillStyle = palette.ink
    while (x < x0 + width) {
      seed = (seed * 9301 + 49297) % 233280
      const bar = 2 + (seed % 5)
      context.fillRect(x, y0, bar, height)
      x += bar + 2 + (seed % 3)
    }
  }
  const cartonLabel = keep(
    drawn(256, 176, (context) => {
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, 256, 176)
      barcode(context, 22, 22, 210, 84)
      context.fillStyle = palette.ink
      context.fillRect(22, 124, 150, 12)
      context.fillRect(22, 146, 96, 10)
    })
  )
  const hazardLabel = keep(
    drawn(192, 128, (context) => {
      context.fillStyle = "#fcd34d"
      context.fillRect(0, 0, 192, 128)
      context.fillStyle = palette.ink
      context.beginPath()
      context.moveTo(40, 22)
      context.lineTo(70, 76)
      context.lineTo(10, 76)
      context.closePath()
      context.fill()
      context.fillStyle = "#fcd34d"
      context.fillRect(37, 40, 6, 20)
      context.fillRect(37, 64, 6, 6)
      context.fillStyle = palette.ink
      context.fillRect(84, 28, 92, 12)
      context.fillRect(84, 50, 72, 10)
      context.fillRect(84, 68, 84, 10)
      context.fillRect(10, 94, 172, 10)
    })
  )
  // A shipping label: sender and address lines, a big barcode, and the shipment's number in bold.
  const shippingLabel = keep(
    drawn(192, 288, (context) => {
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, 192, 288)
      context.strokeStyle = palette.ink
      context.lineWidth = 4
      context.strokeRect(6, 6, 180, 276)
      context.fillStyle = palette.ink
      context.fillRect(18, 20, 90, 9)
      context.fillRect(18, 36, 70, 9)
      context.fillRect(126, 18, 50, 34)
      context.fillRect(18, 66, 150, 12)
      context.fillRect(18, 86, 120, 12)
      barcode(context, 18, 116, 156, 96)
      context.fillRect(18, 226, 156, 18)
      context.fillRect(18, 254, 96, 10)
    })
  )
  const unitLabel = keep(
    drawn(96, 80, (context) => {
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, 96, 80)
      barcode(context, 10, 10, 76, 42)
      context.fillStyle = palette.ink
      context.fillRect(10, 60, 52, 8)
    })
  )
  const labelMaterial = (texture: THREE.Texture) =>
    keep(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 }))

  // ---------------------------------------------------------------------------------------------------- Units and boxes
  // The six units the camera follows down the line: steel bottles with orange caps, three by two.
  const units = Array.from({ length: 6 }, (_, i) => ({ dx: ((i % 3) - 1) * 0.25, dz: i < 3 ? -0.13 : 0.13 }))
  const bottleGeometry = keep(new THREE.CylinderGeometry(0.1, 0.1, 0.44, 18).translate(0, 0.22, 0))
  const capGeometry = keep(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 14).translate(0, 0.48, 0))
  const bottles = new THREE.InstancedMesh(bottleGeometry, matte.steel, units.length)
  const caps = new THREE.InstancedMesh(capGeometry, matte.orange, units.length)
  // Each unit's FNSKU label, and its suffocation warning label beneath.
  const stickers = new THREE.InstancedMesh(
    keep(new THREE.PlaneGeometry(0.13, 0.1)),
    labelMaterial(unitLabel),
    units.length
  )
  const warnings = new THREE.InstancedMesh(
    keep(new THREE.PlaneGeometry(0.13, 0.087)),
    labelMaterial(hazardLabel),
    units.length
  )
  for (const mesh of [bottles, caps, stickers, warnings]) {
    mesh.castShadow = mesh === bottles || mesh === caps
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    scene.add(mesh)
  }

  // The box that forms round them: a floor, four walls and a lid, drawn from unit blocks sized every frame.
  const cube = keep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0))
  const box = put(new THREE.Group())
  const floor = new THREE.Mesh(cube, matte.kraft)
  const sides = [0, 1, 2, 3].map(() => new THREE.Mesh(cube, matte.kraft))
  const lid = new THREE.Mesh(cube, matte.kraftDark)
  const boxTape = new THREE.Mesh(cube, matte.tape)
  for (const part of [floor, ...sides, lid, boxTape]) {
    part.castShadow = true
    part.receiveShadow = true
    box.add(part)
  }
  const wall = 0.03
  // Shapes the box to an inside of w by h by d, with its walls up to `rise` of their height and the lid `closed`.
  const shape = (w: number, h: number, d: number, rise: number, closed: number) => {
    const height = Math.max(0.001, h * rise)
    floor.scale.set(w + wall * 2, wall, d + wall * 2)
    const [left, right, back, front] = sides
    left?.scale.set(wall, height, d + wall * 2)
    left?.position.set(-w / 2 - wall / 2, 0, 0)
    right?.scale.set(wall, height, d + wall * 2)
    right?.position.set(w / 2 + wall / 2, 0, 0)
    back?.scale.set(w, height, wall)
    back?.position.set(0, 0, -d / 2 - wall / 2)
    // The front wall stays low until the box closes, so the units show inside.
    front?.scale.set(w, Math.max(0.001, height * lerp(0.45, 1, closed)), wall)
    front?.position.set(0, 0, d / 2 + wall / 2)
    lid.visible = closed > 0
    lid.scale.set(w + wall * 2, wall, d + wall * 2)
    lid.position.set(0, h + 0.6 * (1 - closed), 0)
    boxTape.visible = closed >= 1
    boxTape.scale.set(0.18, 0.012, d + wall * 2 + 0.01)
    boxTape.position.set(0, h + wall, 0)
  }
  // The right size for six bottles, and the stock box it starts from.
  const fitted = { w: 0.78, h: 0.54, d: 0.54 }
  const stock = { w: 1.3, h: 0.86, d: 1.02 }

  // The order's cartons, stacked on four pallets, 24 to a pallet: the first is the one the camera follows.
  const pallets = [-22.4, -20, -17.6, -15.2].map((x) => ({ x, z: 0.5, mesh: put(block(2, 0.22, 2, matte.wood, 0.04)) }))
  const carton = { w: fitted.w + wall * 2, h: fitted.h + wall, d: fitted.d + wall * 2 }
  const slots = [0, 1, 2, 3].flatMap((layer) =>
    [-0.58, 0, 0.58].flatMap((z) => [-0.42, 0.42].map((x) => new THREE.Vector3(x, 0.22 + layer * carton.h, z)))
  )
  // Filled from the pallet nearest the end of the line.
  const order = [3, 2, 1, 0].flatMap((pallet) => slots.map((_, slot) => ({ pallet, slot })))
  const count = order.length
  // After them, the seller's cartons that FedEx collects from customs, drawn from the same meshes.
  const parcels = [-0.45, -0.15, 0.15, 0.45]
  const capacity = count + parcels.length
  const cartons = new THREE.InstancedMesh(keep(rounded(carton.w, carton.h, carton.d, 0.04)), matte.kraft, capacity)
  const tapes = new THREE.InstancedMesh(keep(rounded(0.18, 0.012, carton.d + 0.01, 0.005)), matte.tape, capacity)
  const cartonLabels = new THREE.InstancedMesh(
    keep(new THREE.PlaneGeometry(0.3, 0.2)),
    labelMaterial(cartonLabel),
    capacity
  )
  const shippingLabels = new THREE.InstancedMesh(
    keep(new THREE.PlaneGeometry(0.24, 0.36)),
    labelMaterial(shippingLabel),
    capacity
  )
  for (const mesh of [cartons, tapes, cartonLabels, shippingLabels]) {
    mesh.castShadow = mesh === cartons || mesh === tapes
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    scene.add(mesh)
  }

  // ---------------------------------------------------------------------------------------------------- Vehicles
  const wheels = (group: THREE.Group, xs: number[]) => {
    const geometry = keep(new THREE.CylinderGeometry(0.27, 0.27, 0.2, 16))
    geometry.rotateX(Math.PI / 2)
    for (const x of xs) {
      for (const z of [-0.58, 0.58]) {
        group.add(at(solid(geometry, matte.ink), x, 0.27, z))
      }
    }
  }
  // A truck faces +x in its own frame: a cab up front and a chassis behind it, `length` long.
  const truck = (length: number, cab = matte.white) => {
    const group = new THREE.Group()
    group.add(at(block(1.05, 1.15, 1.3, cab, 0.14), 1.2, 0.3, 0))
    group.add(at(block(0.06, 0.42, 1.08, matte.glass, 0.02), 1.74, 0.85, 0))
    group.add(at(block(length, 0.16, 1.05, matte.ink, 0.03), 0.62 - length / 2, 0.3, 0))
    wheels(group, [1.2, 0.2 - length * 0.35, 0.62 - length + 0.45])
    return group
  }
  // Lettering for both long sides of a trailer or container, `length` long, centered at x along it.
  const lettering = (
    group: THREE.Object3D,
    texture: THREE.Texture,
    x: number,
    y: number,
    depth: number,
    w: number,
    h: number
  ) => {
    const near = decal(texture, w, h)
    group.add(at(near, x, y, depth / 2 + 0.012))
    const far = decal(texture, w, h)
    far.rotation.y = Math.PI
    group.add(at(far, x, y, -depth / 2 - 0.012))
  }

  // Amazon's truck, which picks up the cartons bound for AWD overseas.
  const amazonMark = keep(
    drawn(512, 160, (context) => {
      context.fillStyle = palette.navy
      context.font = `700 104px ${font}`
      context.textAlign = "center"
      context.fillText("amazon", 256, 92)
      context.strokeStyle = "#ff9900"
      context.lineWidth = 12
      context.lineCap = "round"
      context.beginPath()
      context.moveTo(110, 116)
      context.quadraticCurveTo(250, 170, 390, 110)
      context.stroke()
      context.beginPath()
      context.moveTo(360, 100)
      context.lineTo(394, 108)
      context.lineTo(382, 140)
      context.stroke()
    })
  )
  const amazonTruck = put(truck(4.9, matte.navy))
  amazonTruck.add(at(block(4.3, 1.5, 1.3, matte.white, 0.08), -2.3, 0.46, 0))
  lettering(amazonTruck, amazonMark, -2.3, 1.22, 1.3, 3.2, 1)

  // The forwarder's lettering, on its containers.
  const forwarderMark = keep(
    drawn(512, 128, (context) => {
      context.fillStyle = "#ffffff"
      context.font = `800 60px ${font}`
      context.textAlign = "center"
      context.fillText("PACIFIC LINK", 256, 66)
      context.font = `600 30px ${font}`
      context.fillText("LOGISTICS", 256, 106)
    })
  )
  const pickupTruck = put(truck(2.9))
  const deliveryTruck = put(truck(5.4))

  // FedEx's box truck, which collects the seller's cartons from customs and takes them to its warehouse.
  const fedexMark = keep(
    drawn(512, 160, (context) => {
      context.font = `800 124px ${font}`
      context.textBaseline = "middle"
      const fed = context.measureText("Fed").width
      const x = 256 - (fed + context.measureText("Ex").width) / 2
      context.fillStyle = "#4d148c"
      context.fillText("Fed", x, 84)
      context.fillStyle = "#ff6200"
      context.fillText("Ex", x + fed, 84)
    })
  )
  const fedexTruck = put(truck(3.2))
  fedexTruck.add(at(block(3, 1.35, 1.3, matte.white, 0.08), -0.98, 0.46, 0))
  lettering(fedexTruck, fedexMark, -0.98, 1.14, 1.3, 2.3, 0.72)

  // ---------------------------------------------------------------------------------------------------- The port
  // A ship-to-shore crane: legs astride the road, and a boom out over the water along z = 3.
  const crane = (x: number, from: number, to: number) => {
    const group = put(new THREE.Group(), x, 0, 3)
    for (const dx of [-1.1, 1.1]) {
      for (const dz of [-1.5, 1.5]) {
        group.add(at(block(0.26, 6.2, 0.26, matte.orange, 0.04), dx, 0, dz))
      }
      group.add(at(block(0.3, 0.3, 3.3, matte.orange, 0.04), dx, 5.9, 0))
    }
    for (const dz of [-1.5, 1.5]) {
      group.add(at(block(2.5, 0.26, 0.3, matte.orange, 0.04), 0, 3.4, dz))
    }
    const length = Math.abs(to - from)
    group.add(at(block(length, 0.34, 0.55, matte.orange, 0.05), (from + to) / 2 - x, 6.2, 0))
    group.add(at(block(1.5, 0.9, 1.3, matte.white, 0.1), (from < to ? from + 0.9 : from - 0.9) - x, 6.54, 0))
    const trolley = at(block(0.7, 0.26, 0.7, matte.ink, 0.05), 0, 5.94, 0)
    const cable = at(block(0.05, 1, 0.05, matte.ink, 0.01), 0, 0, 0)
    group.add(trolley, cable)
    // Hangs the hoist over (hx, height) in world x, with its cable reaching down to `bottom`.
    return (hx: number, bottom: number) => {
      trolley.position.x = hx - x
      cable.position.set(hx - x, bottom, 0)
      cable.scale.y = Math.max(0.01, 5.95 - bottom)
    }
  }
  const hoistOut = crane(-1.8, -4.2, 9.4)
  const hoistIn = crane(36.1, 41.4, 26.6)

  // The ship: a dark hull with an orange band, a white bridge aft and a deck of containers. It faces +x, with its
  // waterline at y = 0 of its own frame.
  const ship = put(new THREE.Group())
  const outline = (scale = 1) => {
    const shape = new THREE.Shape()
    shape.moveTo(-5.2 * scale, -1.45 * scale)
    shape.lineTo(2.6 * scale, -1.45 * scale)
    shape.bezierCurveTo(4 * scale, -1.45 * scale, 5 * scale, -0.8 * scale, 5.6 * scale, 0)
    shape.bezierCurveTo(5 * scale, 0.8 * scale, 4 * scale, 1.45 * scale, 2.6 * scale, 1.45 * scale)
    shape.lineTo(-5.2 * scale, 1.45 * scale)
    shape.closePath()
    return shape
  }
  const hull = (scale: number, depth: number, bevel: number) => {
    const geometry = new THREE.ExtrudeGeometry(outline(scale), {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 18
    })
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }
  ship.add(at(solid(hull(1, 1.5, 0.12), matte.ink), 0, -0.9, 0))
  ship.add(at(solid(hull(1.012, 0.2, 0), matte.orange), 0, 0.12, 0))
  ship.add(at(solid(hull(0.96, 0.04, 0), paint("#403b36")), 0, 0.71, 0))
  // The bridge stands aft of the deck's bays, clear of them, and a deck above the containers.
  ship.add(at(block(1.4, 2.5, 2.4, matte.white, 0.1), -4.15, 0.72, 0))
  ship.add(at(block(1.44, 0.28, 2.44, matte.glass, 0.04), -4.15, 2.78, 0))
  ship.add(at(block(0.56, 0.9, 0.7, matte.orange, 0.08), -4.45, 3.22, 0))
  const deck = 0.76
  const bays = [-2.2, 0.15, 2.5] as const
  const bay = (x: number, tier: number, z: number) => new THREE.Vector3(x, deck + tier * 0.98, z)
  const ribs = keep(
    drawn(128, 64, (context) => {
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, 128, 64)
      context.fillStyle = "rgba(0,0,0,0.14)"
      for (let x = 0; x < 128; x += 8) {
        context.fillRect(x, 0, 3, 64)
      }
    })
  )
  const containerGeometry = keep(rounded(2.3, 0.96, 0.96, 0.05))
  const container = (color: string) => solid(containerGeometry, paint(color, { map: ribs, roughness: 0.6 }))
  const tones = [palette.orange, palette.ink, palette.orangeSoft, palette.cream, palette.kraft, "#3f6f7f"]
  let tone = 0
  // Every bay on deck is full except the one the purchase order's container takes, and the one at the far end that the
  // delivery truck also carries.
  const loaded = { x: bays[1], tier: 1, z: 0.5 }
  const second = { x: bays[2], tier: 1, z: -0.5 }
  for (const x of bays) {
    for (const tier of [0, 1]) {
      for (const z of [-0.5, 0.5]) {
        const isLoaded = x === loaded.x && tier === loaded.tier && z === loaded.z
        const isSecond = x === second.x && tier === second.tier && z === second.z
        if (!isLoaded && !isSecond) {
          const boxed = container(tones[tone++ % tones.length] ?? palette.cream)
          ship.add(at(boxed, x, bay(x, tier, z).y, z))
        }
      }
    }
  }
  // The forwarder's two containers, lettered on both sides.
  const branded = (color: string) => {
    const group = put(new THREE.Group())
    group.add(container(color))
    lettering(group, forwarderMark, 0, 0.5, 0.96, 1.9, 0.48)
    return group
  }
  const ordered = branded(palette.orange)
  const other = branded(palette.ink)
  // The wake behind the ship while it sails: a white trail that widens and fades behind the stern.
  const trail = keep(
    drawn(256, 128, (context) => {
      const along = context.createLinearGradient(256, 0, 0, 0)
      along.addColorStop(0, "rgba(255,255,255,0.9)")
      along.addColorStop(1, "rgba(255,255,255,0)")
      context.fillStyle = along
      context.beginPath()
      context.moveTo(256, 44)
      context.lineTo(0, 0)
      context.lineTo(0, 128)
      context.lineTo(256, 84)
      context.closePath()
      context.fill()
    })
  )
  const wakeMaterial = keep(
    new THREE.MeshBasicMaterial({ map: trail, transparent: true, opacity: 0, depthWrite: false })
  )
  const wake = put(new THREE.Mesh(keep(new THREE.PlaneGeometry(7, 3.2).rotateX(-Math.PI / 2)), wakeMaterial))

  // ---------------------------------------------------------------------------------------------------- The purchase order
  const page = keep(
    drawn(384, 480, (context) => {
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, 384, 480)
      context.fillStyle = palette.orange
      context.fillRect(0, 0, 384, 96)
      context.fillStyle = "#ffffff"
      // The name shrinks to fit the page's header when a language needs more room.
      context.font = `600 34px ${font}`
      const size = Math.min(34, (34 * 328) / Math.max(1, context.measureText(words.purchaseOrder).width))
      context.font = `600 ${size.toFixed(1)}px ${font}`
      context.fillText(words.purchaseOrder, 28, 60)
      context.fillStyle = "#e9e3da"
      for (let i = 0; i < 5; i++) {
        context.fillRect(30, 140 + i * 56, i % 2 ? 230 : 320, 20)
      }
      context.fillStyle = palette.ink
      context.fillRect(30, 420, 150, 22)
    })
  )
  const purchaseOrder = put(
    new THREE.Mesh(
      keep(new THREE.PlaneGeometry(1.5, 1.875)),
      keep(new THREE.MeshStandardMaterial({ map: page, side: THREE.DoubleSide, roughness: 0.7 }))
    )
  )
  purchaseOrder.castShadow = true
  // Just in front of the factory's door, at its middle.
  const door = new THREE.Vector3(-22.6, 0.95, -2.99)

  // ---------------------------------------------------------------------------------------------------- The camera
  const camTarget = new THREE.Vector3()
  const shots = [
    { at: 0, x: -18.5, z: -3.4, height: 18 },
    { at: 0.09, x: -19.5, z: -3, height: 15 },
    { at: 0.125, x: -20.9, z: -2.3, height: 6.5 },
    { at: 0.165, x: -19.4, z: -2.3, height: 6.2 },
    { at: 0.21, x: -18.3, z: -2.3, height: 6.2 },
    { at: 0.245, x: -16.3, z: -2.1, height: 6.8 },
    { at: 0.28, x: -17.8, z: -0.8, height: 12 },
    { at: 0.335, x: -18, z: 0, height: 17 },
    { at: 0.39, x: -16.5, z: 1, height: 19 },
    { at: 0.47, x: -9.5, z: 0, height: 20 },
    { at: 0.52, x: -2.5, z: 2.5, height: 17 },
    { at: 0.58, x: 4, z: 2.5, height: 18 },
    { at: 0.69, x: 30, z: 2.5, height: 18 },
    { at: 0.75, x: 37, z: 2, height: 16 },
    { at: 0.81, x: 42, z: 0, height: 15 },
    { at: 0.87, x: 48, z: 1.2, height: 17 },
    { at: 0.935, x: 57, z: 1.2, height: 17 },
    // The whole board, which is about 92 wide as the camera sees it, with a margin.
    { at: 1, x: 20, z: 0.5, height: 36, width: 100 }
  ]
  const frameCamera = (p: number) => {
    const next = shots.findIndex((shot) => shot.at >= p)
    const b = shots[Math.max(0, next)] ?? shots[shots.length - 1]
    const a = shots[Math.max(0, next - 1)] ?? b
    if (!a || !b) {
      return
    }
    const t = a === b ? 1 : smooth(span(p, a.at, b.at))
    camTarget.set(lerp(a.x, b.x, t), 0.6, lerp(a.z, b.z, t))
    const aspect = size.width / size.height
    // On a narrow screen, pull back far enough to keep the subject's width in view: a quarter more than the shot's
    // height, or what the shot asks for.
    const height = Math.max(
      lerp(a.height, b.height, t),
      lerp(a.width ?? a.height * 1.25, b.width ?? b.height * 1.25, t) / aspect
    )
    const width = height * aspect
    // The last shot takes in the whole board, centered.
    const focusX = lerp(size.focus.x, 0.5, smooth(span(p, 0.945, 1)))
    const focusY = lerp(size.focus.y, 0.5, smooth(span(p, 0.945, 1)))
    camera.left = -width * focusX
    camera.right = width * (1 - focusX)
    camera.top = height * focusY
    camera.bottom = -height * (1 - focusY)
    camera.position.copy(camTarget).addScaledVector(view, 80)
    camera.lookAt(camTarget)
    camera.updateProjectionMatrix()
    // The sun follows the view, so its shadows stay sharp wherever the camera is.
    const reach = Math.max(width, height) * 0.75
    sun.position.set(camTarget.x - 14, 26, camTarget.z + 16)
    sun.target.position.copy(camTarget)
    const shadow = sun.shadow.camera
    shadow.left = -reach
    shadow.right = reach
    shadow.top = reach
    shadow.bottom = -reach
    shadow.near = 1
    shadow.far = 80
    shadow.updateProjectionMatrix()
  }

  // ---------------------------------------------------------------------------------------------------- Motion
  const matrix = new THREE.Matrix4()
  const carrier = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const vector = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  const compose = (target: THREE.Matrix4, x: number, y: number, z: number, heading = 0, s = 1, sy = s) =>
    target.compose(vector.set(x, y, z), quaternion.setFromAxisAngle(up, heading), scale.set(s, sy, s))
  // Poses carton i with its tape and labels, each label grown to its share of its full size; with no pose, hides it.
  const setCarton = (i: number, pose?: THREE.Matrix4, labelShown = 1, shippingShown = 1) => {
    if (!pose) {
      for (const mesh of [cartons, tapes, cartonLabels, shippingLabels]) {
        mesh.setMatrixAt(i, hidden)
      }
      return
    }
    cartons.setMatrixAt(i, pose)
    tapes.setMatrixAt(i, local.multiplyMatrices(pose, compose(local, 0, carton.h, 0)))
    cartonLabels.setMatrixAt(
      i,
      local.multiplyMatrices(
        pose,
        compose(local, -0.19, carton.h * 0.55, carton.d / 2 + 0.004, 0, Math.max(0.0001, labelShown))
      )
    )
    shippingLabels.setMatrixAt(
      i,
      local.multiplyMatrices(
        pose,
        compose(local, 0.2, carton.h * 0.5, carton.d / 2 + 0.004, 0, Math.max(0.0001, shippingShown))
      )
    )
  }

  const amazonIn = route([
    [-28, 3],
    [-20.2, 3]
  ])
  const amazonOut = route([
    [-20.2, 3],
    [-8, 3],
    [-8, -2.3]
  ])
  const pickupRoute = route([
    [-14, 3],
    [-1.9, 3]
  ])
  // The forwarder's truck at the other end: from under the crane to customs, on to FBA, then off the board.
  const deliveryRoute = route([
    [40.3, 3],
    [69.5, 3]
  ])
  const stops = { customs: 43.7 - 40.3, fba: 51.25 - 40.3 }
  // FedEx's truck: out of the customs dock, onto the road, and along it to the seller's warehouse.
  const fedexRoute = route([
    [43.4, 0.43],
    [43.4, 3],
    [60.3, 3]
  ])
  // Where it waits for the road to clear: a little way along it, behind the forwarder's truck.
  const onRoad = 3 - 0.43 + 1

  // Where each pallet is, and how big: the first two go in Amazon's trailer, the other two in the forwarder's container.
  const palletAt = (i: number, p: number, amazonX: number) => {
    const pallet = pallets[i] ?? pallets[0]
    const home = { x: pallet?.x ?? 0, z: pallet?.z ?? 0 }
    const [from, to] = i < 2 ? beat.amazonLoad : beat.forwarderLoad
    const half = (to - from) / 2
    const start = i % 2 === 0 ? from : from + half
    const load = ease(span(p, start, start + half))
    const into = i < 2 ? { x: amazonX - 2.3 + (i === 0 ? -1 : 1), y: 0.5 } : { x: -14.6, y: 0.5 }
    return {
      x: lerp(home.x, into.x, load),
      y: 0.9 * hop(load) + into.y * load,
      z: lerp(home.z, 3, load),
      scale: 1 - load
    }
  }

  const frame = (progress: number, time: number) => {
    const p = clamp(progress)
    frameCamera(p)

    // The purchase order drifts down in front of the factory like a dropped sheet, turned to the viewer, then squares
    // up to the door, which rolls up to take it in and closes behind it; then the windows light up. It stays in front
    // of the building the whole way, clear of the roof and the belt.
    const flight = during(p, beat.order)
    purchaseOrder.visible = flight > 0 && flight < 1
    if (purchaseOrder.visible) {
      const fall = easeOut(span(flight, 0, 0.72))
      const slip = ease(span(flight, 0.72, 1))
      const sway = Math.sin(fall * Math.PI * 2.2) * (1 - fall)
      purchaseOrder.position.set(
        lerp(lerp(-20.6, door.x, fall) + sway * 0.9, door.x, slip),
        lerp(lerp(14, 2.2, fall), door.y, slip),
        lerp(lerp(-0.4, -1.5, fall), door.z, slip)
      )
      purchaseOrder.rotation.set(lerp(-0.57 + sway * 0.3, 0, slip), lerp(0.31, 0, slip), lerp(sway * 0.4, 0, slip))
      purchaseOrder.scale.setScalar(Math.max(0.0001, pop(span(flight, 0, 0.12)) * lerp(1, 0.14, slip)))
    }
    glow.emissiveIntensity = 1.1 * smooth(during(p, beat.lit))
    const open = Math.max(
      smooth(span(p, 0.058, 0.066)) * (1 - smooth(span(p, 0.081, 0.09))),
      smooth(span(p, 0.1, 0.108)) * (1 - smooth(span(p, 0.128, 0.138)))
    )
    factoryDoor.scale.y = 1 - 0.88 * open
    factoryDoor.position.y = 1.8 * 0.88 * open

    // The belt runs while the line works.
    beltTexture.offset.x = -time * 0.35

    // Six units come out of the door, get their FNSKU and suffocation warning labels under the first gantry, and stop
    // at the next, where a stock box forms round them and shrinks to fit before its lid closes.
    const out = during(p, beat.units)
    const groupX = lerp(line.from + 0.3, stations.fit, easeOut(out))
    const packing = p >= beat.units[0] && p < beat.seal[1]
    for (const [i, unit] of units.entries()) {
      if (!packing) {
        bottles.setMatrixAt(i, hidden)
        caps.setMatrixAt(i, hidden)
        stickers.setMatrixAt(i, hidden)
        warnings.setMatrixAt(i, hidden)
        continue
      }
      const x = groupX + unit.dx
      const appear = pop(span(x, line.from + 0.25, line.from + 0.7))
      compose(matrix, x, line.top, line.z + unit.dz, 0, Math.max(0.0001, appear))
      bottles.setMatrixAt(i, matrix)
      caps.setMatrixAt(i, matrix)
      const labeled = pop(span(x, stations.stickers - 0.05, stations.stickers + 0.2))
      compose(local, x, line.top + 0.3, line.z + unit.dz + 0.101, 0, Math.max(0.0001, labeled * appear))
      stickers.setMatrixAt(i, local)
      const warned = pop(span(x, stations.stickers + 0.08, stations.stickers + 0.33))
      compose(local, x, line.top + 0.17, line.z + unit.dz + 0.101, 0, Math.max(0.0001, warned * appear))
      warnings.setMatrixAt(i, local)
    }
    bottles.instanceMatrix.needsUpdate = true
    caps.instanceMatrix.needsUpdate = true
    stickers.instanceMatrix.needsUpdate = true
    warnings.instanceMatrix.needsUpdate = true
    stickerLamp.emissiveIntensity = 2 * hop(span(groupX, stations.stickers - 0.5, stations.stickers + 0.5))

    const forming = during(p, beat.box)
    const fitting = pop(during(p, beat.fit))
    const sealing = smooth(during(p, beat.seal))
    box.visible = forming > 0 && p < beat.seal[1]
    if (box.visible) {
      box.position.set(stations.fit, line.top, line.z)
      shape(
        lerp(stock.w, fitted.w, fitting),
        lerp(stock.h, fitted.h, fitting),
        lerp(stock.d, fitted.d, fitting),
        easeOut(forming),
        sealing
      )
    }
    fitLamp.emissiveIntensity = 2 * hop(during(p, beat.fit))

    // The sealed box, now the order's first carton, gets its carton label and shipping label at the end of the line,
    // and goes onto the nearest pallet. The rest of the order follows it off the line.
    const amazonArrive = amazonIn.at(amazonIn.length * ease(during(p, beat.amazonIn)))
    const amazonLeave = amazonOut.at(amazonOut.length * ease(during(p, beat.amazonDrive)))
    const amazonAt = p < beat.amazonDrive[0] ? amazonArrive : amazonLeave
    labelLamp.emissiveIntensity = 2 * hop(during(p, beat.labels))
    for (let i = 0; i < count; i++) {
      const spot = order[i]
      const slot = spot ? slots[spot.slot] : undefined
      if (!spot || !slot) {
        continue
      }
      const pallet = palletAt(spot.pallet, p, amazonArrive.x)
      compose(carrier, pallet.x, pallet.y, pallet.z, 0, pallet.scale)
      let labelShown = 1
      let shippingShown = 1
      if (i === 0) {
        if (p < beat.seal[1] || pallet.scale <= 0.001) {
          setCarton(i)
          continue
        }
        labelShown = pop(span(p, beat.labels[0], beat.labels[0] + 0.006))
        shippingShown = pop(span(p, beat.labels[0] + 0.004, beat.labels[1]))
        const stack = during(p, beat.stack)
        if (stack <= 0) {
          const along = lerp(stations.fit, stations.labels, ease(during(p, beat.toLabeler)))
          const x = lerp(along, stations.end, ease(during(p, beat.toEnd)))
          compose(matrix, x, line.top, line.z)
        } else {
          const home = vector.copy(slot).applyMatrix4(carrier)
          const k = easeOut(stack)
          compose(
            matrix,
            lerp(stations.end, home.x, k),
            lerp(line.top, home.y, k) + 1.2 * hop(k),
            lerp(line.z, home.z, k)
          )
          if (stack >= 1) {
            compose(local, slot.x, slot.y, slot.z)
            matrix.multiplyMatrices(carrier, local)
          }
        }
      } else {
        const start = beat.rest[0] + ((i - 1) / (count - 1)) * (beat.rest[1] - beat.rest[0] - 0.012)
        const fly = span(p, start, start + 0.012)
        if (fly <= 0 || pallet.scale <= 0.001) {
          setCarton(i)
          continue
        }
        if (fly < 1) {
          const home = vector.copy(slot).applyMatrix4(carrier)
          const k = easeOut(fly)
          const x = lerp(stations.end, home.x, k)
          const y = lerp(line.top, home.y, k) + 1.4 * hop(k)
          const z = lerp(line.z, home.z, k)
          compose(matrix, x, y, z, (1 - k) * 0.8, 0.8 + 0.2 * k)
        } else {
          const settle = span(p, start + 0.012, start + 0.02)
          compose(local, slot.x, slot.y, slot.z, 0, 1, 1 - 0.1 * Math.sin(Math.PI * settle))
          matrix.multiplyMatrices(carrier, local)
        }
      }
      setCarton(i, matrix, labelShown, shippingShown)
    }
    for (const [i, pallet] of pallets.entries()) {
      const spot = palletAt(i, p, amazonArrive.x)
      pallet.mesh.position.set(spot.x, spot.y, spot.z)
      pallet.mesh.scale.setScalar(Math.max(0.0001, spot.scale))
      pallet.mesh.visible = spot.scale > 0.001
    }

    // Amazon's truck drives in from the edge of the board, takes the first two pallets, and turns up to AWD in China.
    amazonTruck.position.set(amazonAt.x, 0.05, amazonAt.z)
    amazonTruck.rotation.y = amazonAt.heading
    amazonTruck.scale.setScalar(Math.max(0.0001, span(amazonAt.x, -26.4, -24.6)))
    chinaDoor.emissiveIntensity = 1.3 * smooth(during(p, beat.awd))

    // The forwarder takes the other two to the port in its container, and the crane lifts it aboard.
    const drive = pickupRoute.at(pickupRoute.length * ease(during(p, beat.forwarderDrive)))
    pickupTruck.position.set(drive.x, 0.05, drive.z)
    pickupTruck.rotation.y = drive.heading

    const sail = ease(during(p, beat.sail))
    const bob = Math.sin(time * 1.3) * 0.05
    ship.position.set(lerp(5.8, 28.3, sail), -0.3 + bob, 3)
    ship.rotation.set(Math.sin(time * 1.1) * 0.012, 0, Math.sin(time * 0.9) * 0.02 + Math.sin(sail * Math.PI) * 0.01)
    ship.updateMatrixWorld()
    const wakeStrength = Math.sin(Math.PI * sail)
    wake.position.set(ship.position.x - 8.6, -0.2, 3)
    wake.scale.set(0.5 + wakeStrength * 0.8, 1, 0.6 + wakeStrength * 0.5)
    wakeMaterial.opacity = 0.8 * wakeStrength

    // The forwarder's truck takes both containers from the crane, leaves the seller's at customs and waits at the
    // barrier. Once customs releases the order, it takes Amazon's container to FBA and drives off the board.
    const delivery = deliveryRoute.at(
      stops.customs * ease(during(p, beat.toCustoms)) +
        (stops.fba - stops.customs) * ease(during(p, beat.toFba)) +
        (deliveryRoute.length - stops.fba) * ease(during(p, beat.away))
    )
    const leaving = 1 - span(delivery.x, 62.5, 64.5)
    deliveryTruck.position.set(delivery.x, 0.05, delivery.z)
    deliveryTruck.rotation.y = delivery.heading
    deliveryTruck.scale.setScalar(Math.max(0.0001, leaving))
    deliveryTruck.visible = leaving > 0.001
    // FedEx's truck waits at the customs dock while the seller's cartons go in, noses out behind the forwarder's
    // truck, and follows it along the road to the seller's warehouse.
    const fedex = fedexRoute.at(
      onRoad * ease(during(p, beat.fedexOut)) + (fedexRoute.length - onRoad) * ease(during(p, beat.toYours))
    )
    fedexTruck.position.set(fedex.x, 0.05, fedex.z)
    fedexTruck.rotation.y = fedex.heading
    pickupTruck.updateMatrixWorld()
    deliveryTruck.updateMatrixWorld()
    fedexTruck.updateMatrixWorld()

    const aboard = (spot: { x: number; tier: number; z: number }) =>
      bay(spot.x, spot.tier, spot.z).applyMatrix4(ship.matrixWorld)
    const swing = (from: THREE.Vector3, to: THREE.Vector3, t: number, top = 4.7) => {
      const rise = span(t, 0, 0.25)
      const across = span(t, 0.25, 0.75)
      const lower = span(t, 0.75, 1)
      const x = lerp(from.x, to.x, ease(across))
      const z = lerp(from.z, to.z, ease(across))
      const y = t < 0.75 ? lerp(from.y, top, ease(rise)) : lerp(top, to.y, ease(lower))
      return new THREE.Vector3(x, y, z)
    }
    const lift = during(p, beat.lift)
    const unloadOther = during(p, beat.unloadFirst)
    const unloadOrdered = during(p, beat.unloadSecond)
    const onDelivery = (x: number) => new THREE.Vector3(x, 0.46, 0).applyMatrix4(deliveryTruck.matrixWorld)
    const onPickup = new THREE.Vector3(-0.6, 0.46, 0).applyMatrix4(pickupTruck.matrixWorld)
    let orderedAt: THREE.Vector3
    let orderedScale = 1
    if (lift <= 0) {
      orderedAt = onPickup
    } else if (lift < 1) {
      orderedAt = swing(onPickup, aboard(loaded), lift)
      hoistOut(orderedAt.x, orderedAt.y + 0.96)
    } else if (unloadOrdered <= 0) {
      orderedAt = aboard(loaded)
    } else if (unloadOrdered < 1) {
      orderedAt = swing(aboard(loaded), onDelivery(-3.2), unloadOrdered)
    } else {
      // Off the truck at customs, across the yard and in through its door.
      orderedAt = onDelivery(-3.2)
      const into = during(p, beat.customsDrop)
      orderedAt.y = lerp(orderedAt.y, 0.06, smooth(span(into, 0, 0.25)))
      orderedAt.z = lerp(orderedAt.z, customsFront - 0.3, ease(into))
      orderedScale = 1 - span(into, 0.7, 1)
    }
    if (lift <= 0) {
      hoistOut(-2.4, 4.6)
    } else if (lift >= 1) {
      hoistOut(4, 4.6)
    }
    ordered.position.copy(orderedAt)
    ordered.rotation.set(0, 0, 0)
    if (lift >= 1 && unloadOrdered <= 0) {
      ordered.quaternion.copy(ship.quaternion)
    }
    ordered.scale.setScalar(Math.max(0.0001, orderedScale))
    ordered.visible = orderedScale > 0.001

    let otherAt: THREE.Vector3
    let otherScale = 1
    if (unloadOther <= 0) {
      otherAt = aboard(second)
      other.quaternion.copy(ship.quaternion)
    } else {
      other.rotation.set(0, 0, 0)
      if (unloadOther < 1) {
        otherAt = swing(aboard(second), onDelivery(-0.75), unloadOther)
      } else {
        otherAt = onDelivery(-0.75)
        const into = during(p, beat.fbaDrop)
        otherAt.z -= into * 2.2
        otherScale = 1 - into
      }
    }
    other.position.copy(otherAt)
    other.scale.setScalar(Math.max(0.0001, otherScale))
    other.visible = otherScale > 0.001
    if (unloadOther > 0 && unloadOther < 1) {
      hoistIn(otherAt.x, otherAt.y + 0.96)
    } else if (unloadOrdered > 0 && unloadOrdered < 1) {
      hoistIn(orderedAt.x, orderedAt.y + 0.96)
    } else {
      hoistIn(unloadOther >= 1 ? 37.5 : 31, 4.6)
    }
    fbaDoor.emissiveIntensity = 1.3 * smooth(span(p, beat.fbaDrop[0] + 0.005, beat.fbaDrop[1] + 0.02))
    yoursDoor.emissiveIntensity = 1.3 * smooth(span(p, beat.yoursDrop[0] + 0.005, beat.yoursDrop[1] + 0.01))

    // Customs lets the order go: its lamp turns green and the barrier lifts. The seller's cartons hop out of customs
    // into FedEx's truck, and out of it again into the seller's warehouse.
    const released = ease(during(p, beat.release))
    signal.color.lerpColors(stop, go, released)
    signal.emissive.copy(signal.color)
    arm.rotation.x = 1.35 * released
    customsDoor.emissiveIntensity =
      1.3 *
      smooth(span(p, beat.customsDrop[0] + 0.01, beat.customsDrop[1])) *
      (1 - smooth(span(p, beat.pickup[1], beat.pickup[1] + 0.012)))
    const bed = new THREE.Vector3(-0.98, 1.3, 0).applyMatrix4(fedexTruck.matrixWorld)
    for (const [j, offset] of parcels.entries()) {
      const load = span(p, beat.pickup[0] + j * 0.005, beat.pickup[0] + j * 0.005 + 0.009)
      const unload = span(p, beat.yoursDrop[0] + j * 0.005, beat.yoursDrop[0] + j * 0.005 + 0.009)
      const k = unload > 0 ? unload : load
      if (k <= 0 || k >= 1) {
        setCarton(count + j)
        continue
      }
      const from =
        unload > 0 ? { x: bed.x, y: bed.y, z: bed.z } : { x: 40.5 + offset * 2, y: 0.06, z: customsFront + 0.2 }
      const to =
        unload > 0 ? { x: yoursDoorX + offset, y: 0.06, z: yoursFront - 0.1 } : { x: bed.x, y: bed.y, z: bed.z }
      const size = Math.max(0.0001, pop(span(k, 0, 0.2)) * (1 - smooth(span(k, 0.65, 1))))
      compose(
        matrix,
        lerp(from.x, to.x, k),
        lerp(from.y, to.y, k) + 1.2 * hop(k),
        lerp(from.z, to.z, k),
        (1 - k) * 0.6,
        size
      )
      setCarton(count + j, matrix)
    }
    cartons.instanceMatrix.needsUpdate = true
    tapes.instanceMatrix.needsUpdate = true
    cartonLabels.instanceMatrix.needsUpdate = true
    shippingLabels.instanceMatrix.needsUpdate = true

    // Idle life: the waves, the smoke and the clouds. The waves' normals follow them, so they shade softly.
    const positions = waterGeometry.attributes.position
    if (positions) {
      for (let i = 0; i < positions.count; i++) {
        const x = waterBase[i * 3] ?? 0
        const z = waterBase[i * 3 + 2] ?? 0
        positions.setY(
          i,
          Math.sin(x * 0.8 + time * 1.1) * 0.04 +
            Math.sin(z * 1.2 - time * 0.9 + x * 0.3) * 0.03 +
            Math.sin((x + z) * 2.1 + time * 1.6) * 0.012
        )
      }
      positions.needsUpdate = true
      waterGeometry.computeVertexNormals()
    }
    sea.tide.value = time
    sea.hull.value.set(ship.position.x + 0.2, ship.position.z)
    for (const [i, puff] of puffs.entries()) {
      const age = (time * 0.22 + i / puffs.length) % 1
      puff.position.set(-19.5 + 3.05 + age * 1.4, 5.4 + age * 2.4, -5.4 - 1.3 - age * 0.6)
      puff.scale.setScalar(Math.max(0.0001, Math.sin(Math.PI * age) * (0.7 + age * 0.8)))
    }
    for (const cloud of clouds) {
      cloud.group.position.x = cloud.x + ((time * cloud.speed) % 12) - 6
    }

    renderer.render(scene, camera)
  }

  const anchor = new THREE.Vector3()
  const places: Record<Place, () => THREE.Vector3> = {
    factory: () => anchor.set(-19.5, 4.8, -5.4),
    order: () => anchor.set(-13.6, 5.2, -4.6),
    stickers: () => anchor.set(stations.stickers, 1.9, line.z),
    fit: () => anchor.set(stations.fit, 1.9, line.z),
    labels: () => anchor.set(stations.labels, 1.9, line.z),
    packing: () => anchor.set(-12.6, 3.4, 0.5),
    china: () => anchor.set(-8, 3.8, -6.2),
    quay: () => anchor.set(-1.8, 6.9, 3),
    ship: () => anchor.set(ship.position.x - 1, 3.4, 3),
    customs: () => anchor.set(41.8, 3.4, -4),
    fba: () => anchor.set(50.5, 3.8, -1.2),
    yours: () => anchor.set(60, 3.6, -1.2)
  }

  return {
    resize: (width, height, focus) => {
      size.width = Math.max(1, width)
      size.height = Math.max(1, height)
      size.focus = focus
      renderer.setSize(size.width, size.height, false)
    },
    frame,
    locate: (place) => {
      const point = places[place]().project(camera)
      return { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height }
    },
    dispose: () => {
      for (const thing of disposables) {
        thing.dispose()
      }
      renderer.dispose()
    }
  }
}
