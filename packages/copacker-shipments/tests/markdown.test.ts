import { describe, expect, it } from "vitest"
import { markdownBlocks } from "../src/markdown"

describe("instruction Markdown", () => {
  it("retains nested list indentation, ordered starts and emphasis", () => {
    const blocks = markdownBlocks(
      "- **Seal** the bag.\n  - Keep *both* units together.\n\n3. Match labels.\n4. Keep at pickup."
    )
    expect(blocks.map(({ indent, marker }) => [indent, marker])).toEqual([
      [1, "•"],
      [2, "•"],
      [1, "3."],
      [1, "4."]
    ])
    expect(blocks[0]?.runs[0]).toEqual({ text: "Seal", bold: true })
    expect(blocks[1]?.runs).toContainEqual({ text: "both", italic: true })
  })

  it("keeps continuation paragraphs with their list item", () => {
    expect(
      markdownBlocks("- First paragraph.\n\n  More detail.\n\n- Next item.").map(({ marker, indent }) => [
        marker,
        indent
      ])
    ).toEqual([
      ["•", 1],
      [undefined, 1],
      ["•", 1]
    ])
  })

  it("ignores raw HTML and unsafe URLs, preserving image descriptions and safe references", () => {
    const text = markdownBlocks(
      "<script>bad()</script>\n\n[Unsafe](javascript:bad)\n\n![Example](https://example.com/image.png)\n\n[Contact][buyer]\n\n[buyer]: mailto:buyer@example.com"
    )
      .flatMap((block) => block.runs)
      .map((run) => run.text)
      .join("")
    expect(text).toBe("UnsafeExampleContact (mailto:buyer@example.com)")
  })
})
