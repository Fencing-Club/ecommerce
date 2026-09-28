import { expect, userEvent, waitFor } from "storybook/test"

// Helpers for the marketing site's stories. The stubs each return a cleanup, for the story's beforeEach.

// Makes the browser report reduced motion.
export function reduceMotion() {
  const original = window.matchMedia
  window.matchMedia = (query) => {
    if (!query.includes("prefers-reduced-motion")) {
      return original.call(window, query)
    }
    const list: MediaQueryList = {
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    }
    return list
  }
  return () => {
    window.matchMedia = original
  }
}

// Makes canvases refuse WebGL, as a browser without it does, while they still draw in 2D.
export function withoutWebGL() {
  const original = HTMLCanvasElement.prototype.getContext
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    writable: true,
    value(this: HTMLCanvasElement, type: string, options?: unknown) {
      return type.startsWith("webgl") || type === "experimental-webgl" ? null : original.call(this, type, options)
    }
  })
  return () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      writable: true,
      value: original
    })
  }
}

// Puts `writeText` in the clipboard's place, since a headless browser keeps the real one to itself.
export function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  return () => {
    Reflect.deleteProperty(navigator, "clipboard")
  }
}

// Closes a dialog with Escape once it has taken focus, as someone at the keyboard would.
export async function pressEscapeIn(dialog: HTMLElement) {
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  await userEvent.keyboard("{Escape}")
}
