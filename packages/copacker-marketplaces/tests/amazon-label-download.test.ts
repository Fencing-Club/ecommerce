import { afterEach, expect, it, vi } from "vitest"
import { downloadAmazonLabels } from "../src/amazon"

afterEach(() => vi.unstubAllGlobals())

it("downloads original label bytes using a Workers-supported redirect mode", async () => {
  const bytes = Buffer.from("%PDF-1.7 original label")
  const fetcher = vi.fn<typeof fetch>(async () => new Response(bytes))
  vi.stubGlobal("fetch", fetcher)
  expect(await downloadAmazonLabels("https://labels.s3.amazonaws.com/labels.pdf")).toEqual(bytes)
  expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }))
})

it("rejects redirects instead of following them to another host", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 302, headers: { location: "https://example.com/private" } })
  )
  vi.stubGlobal("fetch", fetcher)
  await expect(downloadAmazonLabels("https://labels.s3.amazonaws.com/labels.pdf")).rejects.toThrow(
    "Amazon label download failed"
  )
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it("rejects untrusted label hosts before requesting them", async () => {
  const fetcher = vi.fn<typeof fetch>()
  vi.stubGlobal("fetch", fetcher)
  await expect(downloadAmazonLabels("https://amazonaws.com.example.com/labels.pdf")).rejects.toThrow(
    "unsupported label download host"
  )
  expect(fetcher).not.toHaveBeenCalled()
})
