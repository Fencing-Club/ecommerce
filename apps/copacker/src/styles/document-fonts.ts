import type { CSSProperties } from "react"
import type { Locale } from "@/i18n/locales"
import geistCyrillicExt from "./fonts/geist-cyrillic-ext.woff2"
import geistCyrillic from "./fonts/geist-cyrillic.woff2"
import geistLatinExt from "./fonts/geist-latin-ext.woff2"
import geistLatin from "./fonts/geist-latin.woff2"
import geistMonoCyrillicExt from "./fonts/geist-mono-cyrillic-ext.woff2"
import geistMonoCyrillic from "./fonts/geist-mono-cyrillic.woff2"
import geistMonoLatinExt from "./fonts/geist-mono-latin-ext.woff2"
import geistMonoLatin from "./fonts/geist-mono-latin.woff2"
import geistMonoSymbols from "./fonts/geist-mono-symbols.woff2"
import geistMonoVietnamese from "./fonts/geist-mono-vietnamese.woff2"
import geistVietnamese from "./fonts/geist-vietnamese.woff2"
import nastaliq from "./fonts/noto-nastaliq-urdu.woff2"
import devanagari from "./fonts/noto-sans-devanagari.woff2"

// The Google Fonts subsets and fallback metrics previously emitted by next/font, now served by either build.
// Source and license: https://github.com/google/fonts/tree/main/ofl/geist and ofl/geistmono.
const baseCss = [
  `@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistCyrillicExt});unicode-range:U+460-52F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}`,
  `@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistCyrillic});unicode-range:U+301,U+400-45F,U+490-491,U+4B0-4B1,U+2116}`,
  `@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistVietnamese});unicode-range:U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB}`,
  `@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistLatinExt});unicode-range:U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}`,
  `@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistLatin});unicode-range:U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`,
  `@font-face{font-family:Geist Fallback;src:local(Arial);ascent-override:95.94%;descent-override:28.16%;line-gap-override:0.0%;size-adjust:104.76%}`,
  `@font-face{font-family:Geist Mono;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistMonoCyrillicExt});unicode-range:U+460-52F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}`,
  `@font-face{font-family:Geist Mono;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistMonoCyrillic});unicode-range:U+301,U+400-45F,U+490-491,U+4B0-4B1,U+2116}`,
  `@font-face{font-family:Geist Mono;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistMonoSymbols});unicode-range:U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F}`,
  `@font-face{font-family:Geist Mono;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistMonoVietnamese});unicode-range:U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB}`,
  `@font-face{font-family:Geist Mono;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistMonoLatinExt});unicode-range:U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}`,
  `@font-face{font-family:Geist Mono;font-style:normal;font-weight:100 900;font-display:swap;src:url(${geistMonoLatin});unicode-range:U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`,
  `@font-face{font-family:Geist Mono Fallback;src:local(Arial);ascent-override:74.67%;descent-override:21.92%;line-gap-override:0.0%;size-adjust:134.59%}`
].join("")

type Face = { family: string; file: string; weight: string; unicodeRange: string }
const localeFaces: Partial<Record<Locale, Face>> = {
  uk: {
    family: "Geist Cyrillic",
    file: geistCyrillic,
    weight: "100 900",
    unicodeRange: "U+301, U+400-45F, U+490-491, U+4B0-4B1, U+2116"
  },
  hi: {
    family: "Noto Sans Devanagari",
    file: devanagari,
    weight: "100 900",
    unicodeRange: "U+900-97F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF"
  },
  ur: {
    family: "Noto Nastaliq Urdu",
    file: nastaliq,
    weight: "400 700",
    unicodeRange: "U+600-6FF, U+750-77F, U+870-8FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FEFC"
  }
}

type FontStyle = CSSProperties & { "--font-geist-sans": string; "--font-geist-mono": string }

export function documentFonts(locale: Locale) {
  const face = localeFaces[locale]
  const extra = face
    ? `@font-face{font-family:${face.family};font-weight:${face.weight};font-display:swap;src:url(${face.file});unicode-range:${face.unicodeRange}}`
    : ""
  const style: FontStyle = {
    "--font-geist-sans": `${face ? face.family + ", " : ""}Geist, Geist Fallback`,
    "--font-geist-mono": "Geist Mono, Geist Mono Fallback"
  }
  return { css: baseCss + extra, style, preload: face ? [face.file, geistLatin] : [geistLatin] }
}
