import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { themeInitScript } from "../src/lib/theme"

// Runs the root layout's theme script as the browser does before the first paint: against what this browser has
// saved, on a computer set to light or dark. Returns what's saved after it, and the theme the page shows.
function firstPaint(saved: string | null, computer: "light" | "dark") {
  const items = new Map<string, string>(saved === null ? [] : [["theme", saved]])
  const localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    }
  }
  const classes = new Set<string>()
  const root = {
    classList: {
      toggle: (name: string, isOn: boolean) => {
        if (isOn) {
          classes.add(name)
        } else {
          classes.delete(name)
        }
      }
    },
    style: { colorScheme: "" }
  }
  const matchMedia = (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" && computer === "dark" })
  runInNewContext(themeInitScript, {
    window: { localStorage },
    localStorage,
    matchMedia,
    document: { documentElement: root }
  })
  return { saved: items.get("theme") ?? null, dark: classes.has("dark"), colorScheme: root.style.colorScheme }
}

describe("the theme script", () => {
  it("keeps a choice saved before the theme store, rewritten in the store's format", () => {
    expect(firstPaint("dark", "light")).toEqual({
      saved: JSON.stringify({ theme: "dark" }),
      dark: true,
      colorScheme: "dark"
    })
    expect(firstPaint("light", "dark")).toEqual({
      saved: JSON.stringify({ theme: "light" }),
      dark: false,
      colorScheme: "light"
    })
  })

  it("shows the choice the theme store saved", () => {
    expect(firstPaint(JSON.stringify({ theme: "dark" }), "light")).toEqual({
      saved: JSON.stringify({ theme: "dark" }),
      dark: true,
      colorScheme: "dark"
    })
  })

  it("follows the computer without a choice", () => {
    expect(firstPaint(null, "dark")).toEqual({ saved: null, dark: true, colorScheme: "dark" })
    expect(firstPaint(null, "light")).toEqual({ saved: null, dark: false, colorScheme: "light" })
  })
})
