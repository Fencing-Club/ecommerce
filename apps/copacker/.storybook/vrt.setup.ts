import { afterEach, beforeAll, expect } from "vitest"
import { page } from "vitest/browser"

// Visual regression for the stories tagged "vrt" (pnpm test:vrt; see docs/visual-regression.md). Once a story's play
// function is done, the open dialog, or the page when there's none, is compared with the story's reference screenshot.

// Nothing moves while it's captured: animations and transitions are off, so spinners hold still, and the text caret
// doesn't blink.
beforeAll(() => {
  const still = document.createElement("style")
  still.textContent =
    "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }"
  document.head.append(still)
})

afterEach(async ({ task }) => {
  // A story that failed shows nothing worth comparing.
  if (task.result?.state === "fail") {
    return
  }
  await document.fonts.ready
  const dialog = document.querySelector("[role=dialog], [role=alertdialog]")
  // The screenshot is the end of each story's test, so a mismatch fails that story.
  // oxlint-disable-next-line vitest/no-standalone-expect
  await expect.element(page.elementLocator(dialog ?? document.body)).toMatchScreenshot(task.name)
})
