import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { english } from "@/i18n/messages"
import { PortalForbidden } from "./portal-forbidden"

const meta = preview.meta({ component: PortalForbidden })
export const Denied = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: english.common.pages.forbidden.title })).toBeVisible()
    await expect(canvas.getByText(english.common.pages.forbidden.askAdmin)).toBeVisible()
  }
})
