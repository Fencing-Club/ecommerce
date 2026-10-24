import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions, failWith, redirectTo } from "@/stories/actions"
import { blankWizard, errors, invitation, invitationToken, savedProfile } from "@/stories/fixtures/auth"
import { chooseOption } from "@/stories/play"
import { OnboardingWizard } from "./onboarding-wizard"
import { SignedInAs } from "./signed-in-as"

type Canvas = ReturnType<typeof within>

const sent: ActionRequest[] = []
const supplierInvitation = invitation("supplier")

async function continueTo(canvas: Canvas, title: string) {
  await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
  const heading = await canvas.findByRole("heading", { level: 1, name: title })
  // The new step's title takes focus, so a screen reader announces it.
  await waitFor(() => expect(heading).toHaveFocus())
}

async function choose(canvas: Canvas, field: RegExp, option: string) {
  await chooseOption(canvas.getByRole("combobox", { name: field }), option)
}

async function fillAbout(canvas: Canvas) {
  await userEvent.type(canvas.getByLabelText(/First name/), "Alex")
  await userEvent.type(canvas.getByLabelText(/Last name/), "Rivera")
  await choose(canvas, /Position/, "Operations manager")
}

async function fillStreet(canvas: Canvas) {
  await userEvent.type(canvas.getByLabelText(/Street address/), "12 Harbor Way")
  await userEvent.type(canvas.getByLabelText(/City/), "Oakland")
  await choose(canvas, /State or province/, "California")
  await userEvent.type(canvas.getByLabelText(/Postal code/), "94607")
}

// Someone new to Copacker, with every step ahead.
const newAccount: React.ComponentProps<typeof OnboardingWizard> = {
  steps: ["about", "role", "company", "address"],
  finish: { type: "workspace", invitation: null },
  kind: null,
  initial: blankWizard(),
  invitedBy: null,
  account: <SignedInAs email="alex@example.com" />,
  accountEmail: "alex@example.com"
}

const meta = preview.meta({
  title: "Components/Onboarding/Onboarding wizard",
  component: OnboardingWizard,
  parameters: { layout: "fullscreen" },
  args: newAccount,
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, redirectTo("/overview")))
  }
})

// Someone new, every step: each checks its fields before moving on, Back keeps the answers, and the last step makes
// the workspace.
export const NewBuyer = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 4")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "About you" })).not.toHaveFocus()
    await expect(canvas.queryByRole("button", { name: "Back" })).toBeNull()
    await expect(canvas.getByText("alex@example.com")).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Enter your first name")).toBeVisible()
    await expect(canvas.getByText("Choose your position")).toBeVisible()
    await expect(canvas.getByLabelText(/First name/)).toHaveFocus()
    await fillAbout(canvas)
    await continueTo(canvas, "What does your company do?")
    await expect(canvas.getByText("Step 2 of 4")).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Choose one")).toBeVisible()
    await userEvent.click(canvas.getByText("Buyer"))
    await waitFor(() => expect(canvas.queryByText("Choose one")).toBeNull())
    await continueTo(canvas, "Your company")
    await expect(canvas.queryByLabelText(/Phone number/)).toBeNull()

    // Back to the role and forward again: the answers stay.
    await userEvent.click(canvas.getByRole("button", { name: "Back" }))
    await expect(await canvas.findByRole("radio", { name: /Buyer/ })).toBeChecked()
    await continueTo(canvas, "Your company")
    await userEvent.click(canvas.getByRole("button", { name: "Back" }))
    await userEvent.click(await canvas.findByRole("button", { name: "Back" }))
    await expect(await canvas.findByLabelText(/First name/)).toHaveValue("Alex")
    await continueTo(canvas, "What does your company do?")
    await continueTo(canvas, "Your company")

    await userEvent.type(canvas.getByLabelText(/Website/), "not a website")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Enter your company’s name")).toBeVisible()
    await expect(canvas.getByText("Enter a website, such as example.com")).toBeVisible()
    await userEvent.type(canvas.getByLabelText(/Company name/), "Harbor Goods")
    await userEvent.clear(canvas.getByLabelText(/Website/))
    await userEvent.type(canvas.getByLabelText(/Website/), "harborgoods.example.com")
    await continueTo(canvas, "Delivery address")
    await expect(canvas.getByText("Where purchase orders are delivered")).toBeVisible()
    await expect(canvas.getByText("Step 4 of 4")).toBeVisible()

    // The address starts from what's known.
    await expect(canvas.getByLabelText(/Address name/)).toHaveValue("Warehouse")
    await expect(canvas.getByLabelText(/Contact name/)).toHaveValue("Alex Rivera")
    await expect(canvas.getByLabelText(/^Email/)).toHaveValue("alex@example.com")
    await expect(canvas.getByRole("combobox", { name: /Country/ })).toHaveTextContent("United States")

    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }))
    // Street, city, state and postal code are still empty.
    await expect(await canvas.findAllByText("Fill in this field")).toHaveLength(4)
    await expect(canvas.getByLabelText(/Street address/)).toHaveFocus()
    await expect(sent).toHaveLength(0)
    await fillStreet(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/overview" }))
    // The new workspace's page loads fresh on the way there, so nothing is refreshed again.
    await expect(getStoryRouter().invalidate).not.toHaveBeenCalled()
    await expect(sent).toHaveLength(1)
    await expect(sent[0]).toMatchObject({
      action: "onboarding.workspace",
      data: {
        person: { firstName: "Alex", lastName: "Rivera", position: "Operations manager" },
        kind: "buyer",
        company: { name: "Harbor Goods", website: "https://harborgoods.example.com", phone: "" },
        address: {
          name: "Warehouse",
          address: {
            name: "Alex Rivera",
            addressLine1: "12 Harbor Way",
            city: "Oakland",
            stateOrRegion: "CA",
            postalCode: "94607",
            countryCode: "US"
          }
        },
        invitation: null
      }
    })
  }
})

// The address can wait: skipping saves the rest without one.
export const SkipAddress = meta.story({
  args: {
    steps: ["role", "company", "address"],
    initial: blankWizard({ firstName: "Alex", lastName: "Rivera", position: "Owner" })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 3")).toBeVisible()
    await userEvent.click(canvas.getByText("Freight forwarder"))
    await continueTo(canvas, "Your company")
    await userEvent.type(canvas.getByLabelText(/Company name/), "Bayline Freight")
    await continueTo(canvas, "Warehouse address")
    await userEvent.click(canvas.getByRole("button", { name: "Skip for now" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/overview" }))
    await expect(sent[0]).toMatchObject({
      action: "onboarding.workspace",
      data: { kind: "forwarder", company: { name: "Bayline Freight" }, address: null, invitation: null }
    })
  }
})

// A supplier gives a phone number, which the pickup address then needs.
export const Supplier = meta.story({
  args: {
    steps: ["role", "company", "address"],
    initial: blankWizard({ firstName: "Mei", lastName: "Chen", position: "Sales manager" })
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Supplier"))
    await continueTo(canvas, "Your company")
    await userEvent.type(canvas.getByLabelText(/Company name/), "Lotus Manufacturing")
    await userEvent.type(canvas.getByLabelText(/Phone number/), "+86 188 6161 3263")
    await continueTo(canvas, "Pickup address")
    await expect(canvas.getByLabelText(/Address name/)).toHaveValue("Factory")
    await expect(canvas.getByLabelText(/Phone number/)).toHaveValue("+86 188 6161 3263")
    await userEvent.clear(canvas.getByLabelText(/Phone number/))
    await fillStreet(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }))
    await expect(
      await canvas.findByText("Add a pickup phone number. Amazon needs it to schedule pickup.")
    ).toBeVisible()
    await expect(canvas.getByLabelText(/Phone number/)).toHaveFocus()
    await expect(sent).toHaveLength(0)
    await userEvent.type(canvas.getByLabelText(/Phone number/), "+1 425 260 2501")
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]?.data).toMatchObject({
      kind: "supplier",
      company: { name: "Lotus Manufacturing", phone: "+86 188 6161 3263" },
      address: { name: "Factory", address: { phoneNumber: "+1 (425) 260-2501" } }
    })
  }
})

// A buyer's invitation settles the kind and brings what the buyer knows about the supplier.
export const InvitedSupplier = meta.story({
  args: {
    steps: ["company", "address"],
    finish: { type: "workspace", invitation: { kind: "supplier", token: invitationToken } },
    kind: "supplier",
    initial: {
      ...blankWizard({ firstName: "Mei", lastName: "Chen", position: "Sales manager" }),
      kind: "supplier",
      company: {
        name: supplierInvitation.company,
        website: supplierInvitation.website,
        phone: supplierInvitation.phone
      },
      address: supplierInvitation.addresses[0] ?? blankWizard().address
    },
    invitedBy: "Harbor Goods"
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Invited by Harbor Goods")).toBeVisible()
    await expect(canvas.getByLabelText(/Company name/)).toHaveValue("Lotus Manufacturing")
    await expect(canvas.getByLabelText(/Phone number/)).toHaveValue("+86 188 6161 3263")
    await continueTo(canvas, "Pickup address")
    await expect(canvas.getByText("Invited by Harbor Goods")).toBeVisible()
    // The buyer's saved address stays as it was, not replaced by guesses.
    await expect(canvas.getByLabelText(/Address name/)).toHaveValue("Factory")
    await expect(canvas.getByLabelText(/Street address/)).toHaveValue("88 Industrial Road")
    await expect(canvas.getByRole("combobox", { name: /Country/ })).toHaveTextContent("China")
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    await expect(sent[0]).toMatchObject({
      action: "onboarding.workspace",
      data: {
        kind: "supplier",
        company: { name: "Lotus Manufacturing" },
        address: { address: { city: "Ningbo", countryCode: "CN" } },
        invitation: { kind: "supplier", token: invitationToken }
      }
    })
  }
})

// A colleague's invitation needs only who they are.
export const JoinTeam = meta.story({
  args: {
    steps: ["about"],
    finish: { type: "join", token: invitationToken, workspace: "Harbor Goods" },
    initial: blankWizard({ firstName: "Jordan" }),
    invitedBy: "Harbor Goods",
    account: <SignedInAs email="jordan@example.com" />
  },
  play: async ({ canvas }) => {
    // One step needs no progress bar.
    await expect(canvas.queryByText(/Step 1 of/)).toBeNull()
    await expect(canvas.getByLabelText(/First name/)).toHaveValue("Jordan")
    await userEvent.click(canvas.getByRole("button", { name: "Join Harbor Goods" }))
    await expect(await canvas.findByText("Enter your last name")).toBeVisible()
    await userEvent.type(canvas.getByLabelText(/Last name/), "Lee")
    await choose(canvas, /Position/, "Buyer")
    await userEvent.click(canvas.getByRole("button", { name: "Join Harbor Goods" }))
    await waitFor(() => expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/overview" }))
    await expect(sent).toEqual([
      {
        action: "onboarding.join",
        data: {
          kind: "team",
          token: invitationToken,
          person: { firstName: "Jordan", lastName: "Lee", position: "Buyer" }
        }
      }
    ])
  }
})

// Someone in a workspace already, without a full profile, gives just that and goes back where they were: with the
// profile complete, the page's refresh sends them on to `next`.
export const ProfileOnly = meta.story({
  args: {
    steps: ["about"],
    finish: { type: "profile", company: savedProfile.company, next: "/orders" }
  },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent))
  },
  play: async ({ canvas }) => {
    await fillAbout(canvas)
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalledWith({ sync: true }))
    await expect(sent).toEqual([
      {
        action: "profile.update",
        data: { firstName: "Alex", lastName: "Rivera", position: "Operations manager", company: "Harbor Goods" }
      }
    ])
  }
})

export const Fails = meta.story({
  args: {
    steps: ["about"],
    finish: { type: "join", token: invitationToken, workspace: "Harbor Goods" },
    initial: blankWizard({ firstName: "Jordan", lastName: "Lee", position: "Buyer" })
  },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, failWith(errors.invitationInvalid)))
  },
  play: async ({ canvas }) => {
    const join = canvas.getByRole("button", { name: "Join Harbor Goods" })
    await userEvent.click(join)
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.invitationInvalid)
    await expect(join).toBeEnabled()
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
  }
})
