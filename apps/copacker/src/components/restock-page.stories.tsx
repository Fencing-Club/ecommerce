import { http, HttpResponse } from "msw"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { restockChannels, restockReport, suppliers } from "@/stories/fixtures/catalog"
import { RestockPageView } from "./restock-page"

const meta = preview.meta({
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/restock/channels", () => HttpResponse.json(restockChannels)),
      http.get("/api/restock/suppliers", () => HttpResponse.json(suppliers)),
      http.post("/api/restock/plan", () => HttpResponse.json(restockReport()))
    )
})

export const Restock = meta.story({
  render: () => <RestockPageView settings={{ days: 60, leadTimeDays: 30 }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Restock", level: 1 })).toBeVisible()
  }
})
