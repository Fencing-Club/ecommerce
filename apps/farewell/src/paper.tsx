import type { ReactNode } from "react"
import { AbsoluteFill } from "remotion"
import { copilot, gold, ink, velvet, wood } from "./theme"

export type Place = { x: number; y: number; scale?: number; rotate?: number; flip?: boolean }

// Where a cut-out stands: its feet at (x, y), turned and sized about them, mirrored when it faces the other way.
export const placed = ({ x, y, scale = 1, rotate = 0, flip = false }: Place) =>
  `translate(${x} ${y}) rotate(${rotate}) scale(${flip ? -scale : scale} ${scale})`

// The patterns, gradients and filters the cut-outs share. Every frame draws them once, at the root of its picture.
const Defs = () => (
  <defs>
    <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke={ink} strokeWidth="1.4" />
    </pattern>
    <pattern id="crosshatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke={ink} strokeWidth="1.2" />
      <line x1="0" y1="3.5" x2="7" y2="3.5" stroke={ink} strokeWidth="1.2" />
    </pattern>
    <pattern id="damask" width="80" height="110" patternUnits="userSpaceOnUse">
      <rect width="80" height="110" fill={velvet.deep} />
      <path
        d="M40,10 C55,30 62,45 40,55 C18,45 25,30 40,10 Z M40,55 C60,65 60,88 40,100 C20,88 20,65 40,55 Z"
        fill="#4a0a0e"
      />
      <circle cx="0" cy="55" r="6" fill="#4a0a0e" />
      <circle cx="80" cy="55" r="6" fill="#4a0a0e" />
    </pattern>
    <linearGradient id="velvetFolds" x1="0" x2="96" y1="0" y2="0" gradientUnits="userSpaceOnUse" spreadMethod="repeat">
      <stop offset="0" stopColor={velvet.dark} />
      <stop offset="0.3" stopColor={velvet.base} />
      <stop offset="0.52" stopColor={velvet.light} />
      <stop offset="0.72" stopColor={velvet.base} />
      <stop offset="1" stopColor={velvet.dark} />
    </linearGradient>
    <linearGradient id="velvetShade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#000" stopOpacity="0.45" />
      <stop offset="0.25" stopColor="#000" stopOpacity="0" />
      <stop offset="0.8" stopColor="#000" stopOpacity="0.05" />
      <stop offset="1" stopColor="#000" stopOpacity="0.4" />
    </linearGradient>
    <linearGradient id="goldMetal" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor={gold.light} />
      <stop offset="0.45" stopColor={gold.base} />
      <stop offset="0.7" stopColor={gold.dark} />
      <stop offset="1" stopColor={gold.base} />
    </linearGradient>
    <linearGradient id="goldSide" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor={gold.dark} />
      <stop offset="0.35" stopColor={gold.light} />
      <stop offset="0.6" stopColor={gold.base} />
      <stop offset="1" stopColor={gold.deep} />
    </linearGradient>
    <linearGradient id="floorBoards" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor={wood.deep} />
      <stop offset="0.55" stopColor={wood.dark} />
      <stop offset="1" stopColor={wood.base} />
    </linearGradient>
    <linearGradient id="silverWire" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stopColor="#f4f6f8" />
      <stop offset="0.5" stopColor="#b8bec7" />
      <stop offset="1" stopColor="#7d8591" />
    </linearGradient>
    <linearGradient id="copilotBody" x1="0" x2="1" y1="0" y2="1">
      {copilot.map((color, i) => (
        <stop key={color} offset={i / (copilot.length - 1)} stopColor={color} />
      ))}
    </linearGradient>
    <linearGradient id="loopInk" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stopColor="#7b61ff" />
      <stop offset="1" stopColor="#1fa3ff" />
    </linearGradient>
    <radialGradient id="footGlow">
      <stop offset="0" stopColor="#fff3c4" stopOpacity="0.9" />
      <stop offset="0.4" stopColor="#ffc867" stopOpacity="0.35" />
      <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="spotlight">
      <stop offset="0" stopColor="#fff6d8" stopOpacity="0.55" />
      <stop offset="0.6" stopColor="#ffe3a0" stopOpacity="0.18" />
      <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="boardSmear" cx="0.3" cy="0.4" r="0.8">
      <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
      <stop offset="1" stopColor="#fff" stopOpacity="0" />
    </radialGradient>
    {/* Scissor bites out of the silhouette only, so lettering and line work inside stay crisp. */}
    <filter id="cut" x="-15%" y="-15%" width="135%" height="135%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise" />
      <feComponentTransfer in="SourceAlpha" result="solid">
        <feFuncA type="linear" slope="20" />
      </feComponentTransfer>
      <feDisplacementMap
        in="solid"
        in2="noise"
        scale="3.5"
        xChannelSelector="R"
        yChannelSelector="G"
        result="shifted"
      />
      <feComposite in="solid" in2="shifted" operator="out" result="bites" />
      <feComposite in="SourceGraphic" in2="bites" operator="out" result="rough" />
      <feDropShadow in="rough" dx="5" dy="7" stdDeviation="1.4" floodColor="#1a0d05" floodOpacity="0.5" />
    </filter>
    <filter id="soft">
      <feGaussianBlur stdDeviation="8" />
    </filter>
    <filter id="chalky">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" result="grit" />
      <feColorMatrix in="grit" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.6 1.25" result="holes" />
      <feComposite in="SourceGraphic" in2="holes" operator="in" />
    </filter>
  </defs>
)

// Grain like old film over printed paper: one noise tile, drawn once and repeated.
const grain = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="300" height="300" filter="url(#n)" opacity="0.55"/></svg>'
)}")`

// A whole picture: the shared definitions, the drawing, then paper grain and a vignette over the top.
export const Canvas = ({ children, background = "#1b0b07" }: { children: ReactNode; background?: string }) => (
  <AbsoluteFill style={{ background }}>
    <svg viewBox="0 0 1920 1080" width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <Defs />
      {children}
    </svg>
    <AbsoluteFill style={{ backgroundImage: grain, mixBlendMode: "multiply", opacity: 0.35 }} />
    <AbsoluteFill
      style={{ background: "radial-gradient(ellipse 75% 70% at 50% 48%, transparent 55%, rgba(20, 8, 2, 0.55) 100%)" }}
    />
  </AbsoluteFill>
)

// The audience's view: `scale` about the point it looks at.
export const Camera = ({
  children,
  scale = 1,
  look = { x: 960, y: 540 }
}: {
  children: ReactNode
  scale?: number
  look?: { x: number; y: number }
}) => <g transform={`translate(960 540) scale(${scale}) translate(${-look.x} ${-look.y})`}>{children}</g>

// A cut-out's paper edge and the shadow it throws on the scenery behind it.
export const Cut = ({ children }: { children: ReactNode }) => <g filter="url(#cut)">{children}</g>
