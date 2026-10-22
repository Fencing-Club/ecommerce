import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { timeZoneLabel } from "@/lib/time-zone"
import { type ActionRequest, recordActions, serverError } from "@/stories/fixtures/logistics"
import { LanguageForm, RestockSettingsForm, SupplierProfileForm, TimeZoneForm } from "./settings-forms"

const sent: ActionRequest[] = []

const zones = ["UTC", "America/Los_Angeles", "America/New_York", "America/Argentina/Buenos_Aires", "Asia/Shanghai"].map(
  (zone) => ({ value: zone, label: timeZoneLabel(zone) })
)

const meta = preview.meta({
  title: "Components/Settings/Settings forms",
  component: RestockSettingsForm,
  args: { salesDays: 60, leadTimeDays: 45 },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

// Save waits for a change, then says it saved and waits again.
export const Restock = meta.story({
  play: async ({ canvas }) => {
    const save = canvas.getByRole("button", { name: "Save" })
    await expect(save).toBeDisabled()
    await expect(canvas.getByText("For suppliers without their own")).toBeVisible()
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Sales period (days)" }), "90", {
      initialSelectionStart: 0,
      initialSelectionEnd: 2
    })
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() =>
      expect(sent).toEqual([{ action: "workspace.restock", data: { salesDays: 90, leadTimeDays: 45 } }])
    )
    await expect(await canvas.findByRole("status")).toHaveTextContent("Saved")
    await expect(canvas.getByRole("spinbutton", { name: "Sales period (days)" })).toHaveValue(90)
    await expect(save).toBeDisabled()
  }
})

export const RestockValidation = meta.story({
  play: async ({ canvas }) => {
    const leadTime = canvas.getByRole("spinbutton", { name: "Lead time (days)" })
    await userEvent.type(leadTime, "0", { initialSelectionStart: 0, initialSelectionEnd: 2 })
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Sales period (days)" }), "1000", {
      initialSelectionStart: 0,
      initialSelectionEnd: 2
    })
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    // Days outside 1 to 730 say which end they passed.
    await expect(await canvas.findByText("Enter 1 or more")).toBeVisible()
    await expect(canvas.getByText("Enter 730 or less")).toBeVisible()
    // The lead time's hint and its error both describe it.
    await expect(leadTime).toHaveAccessibleDescription("For suppliers without their own Enter 1 or more")
    // Emptied, a field stays empty and asks for the days.
    await userEvent.clear(leadTime)
    await expect(leadTime).toHaveValue(null)
    await expect(await canvas.findByText("Enter the days")).toBeVisible()
    await expect(sent).toHaveLength(0)
  }
})

export const RestockFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Only owners and admins change Restock's settings.")))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Lead time (days)" }), "30", {
      initialSelectionStart: 0,
      initialSelectionEnd: 2
    })
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByText("Only owners and admins change Restock's settings.")).toBeVisible()
    await expect(canvas.queryByText("Saved")).toBeNull()
  }
})

// A website is saved with its https://.
export const SupplierProfile = meta.story({
  render: () => (
    <SupplierProfileForm contactName="Mei Chen" contactEmail="mei@lotus.example.com" phoneNumber="" website="" />
  ),
  play: async ({ canvas }) => {
    const website = canvas.getByRole("textbox", { name: "Website" })
    await userEvent.type(website, "lotus.example.com")
    await userEvent.type(canvas.getByRole("textbox", { name: "Phone" }), "+86 188 6161 3263")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "supplier.profile",
          data: {
            contactName: "Mei Chen",
            contactEmail: "mei@lotus.example.com",
            phoneNumber: "+86 188 6161 3263",
            website: "https://lotus.example.com"
          }
        }
      ])
    )
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
    // The field shows the website as saved.
    await expect(website).toHaveValue("https://lotus.example.com")
  }
})

export const SupplierProfileValidation = meta.story({
  render: () => <SupplierProfileForm contactName="" contactEmail="" phoneNumber="" website="" />,
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Contact email" }), "mei@")
    await userEvent.type(canvas.getByRole("textbox", { name: "Phone" }), "12")
    await userEvent.type(canvas.getByRole("textbox", { name: "Website" }), "lotus")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByText("Enter an email address")).toBeVisible()
    await expect(canvas.getByText("Enter a phone number")).toBeVisible()
    await expect(canvas.getByText("Enter a website, such as example.com")).toBeVisible()
    await expect(sent).toHaveLength(0)
  }
})

export const Language = meta.story({
  render: () => <LanguageForm locale={null} systemLocale="en" />,
  play: async ({ canvas }) => {
    const language = canvas.getByRole("combobox", { name: "Language" })
    await expect(language).toHaveTextContent("System (English)")
    await userEvent.click(language)
    await userEvent.click(await screen.findByRole("option", { name: "Deutsch" }))
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent).toEqual([{ action: "profile.locale", data: { locale: "de" } }]))
  }
})

// Going back to the computer's language saves an empty choice.
export const LanguageBackToSystem = meta.story({
  render: () => <LanguageForm locale="fr" systemLocale="de" />,
  play: async ({ canvas }) => {
    const language = canvas.getByRole("combobox", { name: "Language" })
    await expect(language).toHaveTextContent("Français")
    await userEvent.click(language)
    await userEvent.click(await screen.findByRole("option", { name: "System (Deutsch)" }))
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent).toEqual([{ action: "profile.locale", data: { locale: "" } }]))
  }
})

export const TimeZone = meta.story({
  render: () => <TimeZoneForm timeZone={null} computerZone="America/Los_Angeles" zones={zones} />,
  play: async ({ canvas }) => {
    const zone = canvas.getByRole("combobox", { name: "Store time zone" })
    // Automatic follows each viewer's computer, named after it.
    await expect(zone).toHaveTextContent(/^Automatic, /)
    await userEvent.click(zone)
    const listbox = await screen.findByRole("listbox")
    // Zones are grouped by region, each city named first, with loose zones such as UTC at the top.
    await expect(within(listbox).getByText("America")).toBeInTheDocument()
    await expect(within(listbox).getByRole("option", { name: /^Buenos Aires, Argentina/ })).toBeInTheDocument()
    await userEvent.click(within(listbox).getByRole("option", { name: /^Shanghai/ }))
    await expect(zone).toHaveTextContent(timeZoneLabel("Asia/Shanghai"))
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent).toEqual([{ action: "workspace.timeZone", data: { timeZone: "Asia/Shanghai" } }]))
  }
})

// A zone saved under a name the list doesn't have stays one of the choices; Automatic saves an empty zone.
export const TimeZoneSavedAlias = meta.story({
  render: () => <TimeZoneForm timeZone="Asia/Calcutta" computerZone="UTC" zones={zones} />,
  play: async ({ canvas }) => {
    const zone = canvas.getByRole("combobox", { name: "Store time zone" })
    await expect(zone).toHaveTextContent(timeZoneLabel("Asia/Calcutta"))
    await userEvent.click(zone)
    await userEvent.click(await screen.findByRole("option", { name: /^Automatic/ }))
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent).toEqual([{ action: "workspace.timeZone", data: { timeZone: "" } }]))
  }
})
