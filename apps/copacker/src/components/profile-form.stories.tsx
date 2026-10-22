import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, failWith } from "@/stories/actions"
import { chooseOption } from "@/stories/play"
import { ProfileForm } from "./profile-form"

const sent: ActionRequest[] = []

const meta = preview.meta({
  title: "Components/Settings/Profile form",
  component: ProfileForm,
  args: {
    profile: { firstName: "Alex", lastName: "Rivera", position: "Owner", company: "Harbor Goods", website: "" }
  },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent))
  }
})

export const SavedWebsite = meta.story({
  args: {
    profile: {
      firstName: "Alex",
      lastName: "Rivera",
      position: "Owner",
      company: "Harbor Goods",
      website: "http://harbor.example.com"
    }
  },
  play: async ({ canvas }) => {
    const website = canvas.getByRole("textbox", { name: "Company website" })
    await expect(website).toHaveValue("harbor.example.com")
    await expect(canvas.getByText("http://", { exact: true })).toBeVisible()
    await userEvent.clear(website)
    await userEvent.click(website)
    await userEvent.paste("https://fencing.club")
    await userEvent.tab()
    await expect(website).toHaveValue("fencing.club")
    await expect(canvas.getByText("https://", { exact: true })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent.at(-1)?.data.website).toBe("https://fencing.club"))
    await userEvent.clear(website)
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(sent.at(-1)?.data.website).toBe(""))
  }
})

// A buyer's owner also keeps the website its purchase orders print, saved with its https://.
export const Owner = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Position" })).toHaveTextContent("Owner")
    await chooseOption(canvas.getByRole("combobox", { name: "Position" }), "Purchasing manager")
    const website = canvas.getByRole("textbox", { name: "Company website" })
    await userEvent.type(website, "harbor.example.com")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "profile.update",
          data: {
            firstName: "Alex",
            lastName: "Rivera",
            position: "Purchasing manager",
            company: "Harbor Goods",
            website: "https://harbor.example.com"
          }
        }
      ])
    )
    await expect(await canvas.findByRole("status")).toHaveTextContent("Saved")
    // Like onboarding, the scheme stays beside the editable domain after saving.
    await expect(canvas.getByText("https://", { exact: true })).toBeVisible()
    await expect(website).toHaveValue("harbor.example.com")
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

// Members don't see the workspace's website.
export const Member = meta.story({
  args: { profile: { firstName: "Sam", lastName: "Okafor", position: "Buyer", company: "Harbor Goods" } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("textbox", { name: "Company website" })).toBeNull()
    await userEvent.type(canvas.getByRole("textbox", { name: "Last name" }), "-Reyes")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        {
          action: "profile.update",
          data: { firstName: "Sam", lastName: "Okafor-Reyes", position: "Buyer", company: "Harbor Goods" }
        }
      ])
    )
  }
})

// A position typed before the list existed stays one of the choices, as it was saved.
export const EarlierPosition = meta.story({
  args: { profile: { firstName: "Alex", lastName: "Rivera", position: "Head of sourcing", company: "Harbor Goods" } },
  play: async ({ canvas }) => {
    const position = canvas.getByRole("combobox", { name: "Position" })
    await expect(position).toHaveTextContent("Head of sourcing")
    await userEvent.click(position)
    await expect(await screen.findByRole("option", { name: "Head of sourcing" })).toBeInTheDocument()
    await expect(screen.getByRole("option", { name: "Logistics coordinator" })).toBeInTheDocument()
  }
})

export const Validation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.clear(canvas.getByRole("textbox", { name: "First name" }))
    await userEvent.clear(canvas.getByRole("textbox", { name: "Company" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Company website" }), "harbor")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByText("Enter your first name")).toBeVisible()
    await expect(canvas.getByText("Enter your company")).toBeVisible()
    await expect(canvas.getByText("Enter a website, such as example.com")).toBeVisible()
    await expect(sent).toHaveLength(0)
  }
})

export const ServerError = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith("Your session ended. Sign in again.")))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Company" }), " Co.")
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(await canvas.findByText("Your session ended. Sign in again.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled()
  }
})
