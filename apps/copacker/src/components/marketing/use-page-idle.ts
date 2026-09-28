"use client"

import { useEffect, useEffectEvent, useState } from "react"

// Runs `callback` once the page has loaded and the browser has a moment to spare, for work the first view doesn't need,
// so it stays out of the way of the page's first paint and of hydration. Returns a function that cancels it.
export function whenPageIdle(callback: () => void) {
  let idle: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    // Safari has no requestIdleCallback, so there it waits a moment instead.
    if (typeof window.requestIdleCallback === "function") {
      idle = requestIdleCallback(callback, { timeout: 2000 })
    } else {
      timer = setTimeout(callback, 200)
    }
  }
  if (document.readyState === "complete") {
    schedule()
  } else {
    addEventListener("load", schedule, { once: true })
  }
  return () => {
    removeEventListener("load", schedule)
    clearTimeout(timer)
    if (idle !== undefined) {
      cancelIdleCallback(idle)
    }
  }
}

// Whether a @font-face's unicode-range, such as "U+0-FF, U+131", covers any of `codes`. No range covers everything.
function covers(range: string, codes: number[]) {
  return (
    !range ||
    range.split(",").some((part) => {
      const [from = "", to = from] = part.trim().slice(2).split("-")
      const low = Number.parseInt(from.replaceAll("?", "0"), 16)
      const high = Number.parseInt(to.replaceAll("?", "F"), 16)
      return codes.some((code) => code >= low && code <= high)
    })
  )
}

// Loads the faces of `family` (a CSS font-family list, of which the first is used) that draw `text`, and adds them to
// the page's fonts, where they're used ahead of the stylesheet's own faces for the same letters. next/font names a
// family but not its files, so they're found in the page's stylesheets. They're fetched at low priority: a font the
// stylesheet fetches is a request at the highest priority, part of the page's critical path however late it comes.
async function loadFaces(family: string, text: string) {
  const name = family.split(",")[0]?.trim().replaceAll(/["']/g, "") ?? family
  const codes = Array.from(new Set(Array.from(text, (char) => char.codePointAt(0) ?? 0)))
  const loads: Promise<unknown>[] = []
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      // Another site's stylesheet can't be read, and has none of the page's fonts.
      continue
    }
    for (const rule of rules) {
      if (
        !(rule instanceof CSSFontFaceRule) ||
        rule.style.getPropertyValue("font-family").replaceAll(/["']/g, "") !== name
      ) {
        continue
      }
      const { style } = rule
      const range = style.getPropertyValue("unicode-range")
      const file = /url\("?([^")]+)"?\)/.exec(style.getPropertyValue("src"))?.[1]
      if (file && covers(range, codes)) {
        const load = async () => {
          const response = await fetch(new URL(file, sheet.href ?? location.href), { priority: "low" })
          const face = new FontFace(name, await response.arrayBuffer(), {
            style: style.getPropertyValue("font-style"),
            weight: style.getPropertyValue("font-weight"),
            ...(range && { unicodeRange: range })
          })
          document.fonts.add(face)
          await face.load()
        }
        loads.push(load())
      }
    }
  }
  await Promise.allSettled(loads)
}

// False until the page has loaded and the browser is idle, then true. A section that takes on a font then names it
// with the text it draws, and turns true once the faces for that text have loaded, or failed to.
export function usePageIdle(font?: { family: string; text: string }) {
  const [idle, setIdle] = useState(false)
  const settle = useEffectEvent(() => {
    if (font) {
      void loadFaces(font.family, font.text).finally(() => setIdle(true))
    } else {
      setIdle(true)
    }
  })
  useEffect(() => whenPageIdle(() => settle()), [])
  return idle
}
