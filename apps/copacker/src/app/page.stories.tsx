import { getURLFromRedirectError } from "next/dist/client/components/redirect"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { redirect } from "next/navigation"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Landing } from "@/components/marketing/landing"
import type { Permissions } from "@/lib/access"
import { homeFor } from "@/lib/navigation"
import { serverStory } from "@/stories/server"
import { member, owner, type WorkspaceKind, workspaces } from "@/stories/workspace"

// Who opens the home page: no one signed in, or a person in a workspace of some kind.
type Visitor = { kind: WorkspaceKind; permissions: Permissions } | null

// The home page (page.tsx): the marketing page for anyone signed out, and otherwise a redirect to the person's home.
async function Home({ visitor }: { visitor: Visitor }) {
  if (!visitor) {
    return <Landing />
  }
  redirect(homeFor(workspaces[visitor.kind].kind, visitor.permissions))
}

// A redirect renders nothing, so the story says where it went.
async function HomePage(args: { visitor: Visitor }) {
  try {
    return await Home(args)
  } catch (error) {
    if (isRedirectError(error)) {
      return <p>Redirects to {getURLFromRedirectError(error)}</p>
    }
    throw error
  }
}

const meta = preview.meta({
  title: "Pages/Marketing/Home",
  ...serverStory(HomePage),
  args: { visitor: null },
  parameters: { layout: "fullscreen" }
})

export const SignedOut = meta.story({
  play: async ({ canvas }) => {
    const main = canvas.getByRole("main")
    await expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent("Restocking, handled.")
    await expect(within(main).getByRole("heading", { level: 2, name: "Get early access." })).toBeInTheDocument()
  }
})

// A buyer lands on the Overview.
export const SignedInBuyer = meta.story({
  args: { visitor: { kind: "buyer", permissions: owner } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Redirects to /overview")).toBeVisible()
  }
})

// Suppliers and forwarders land on their purchase orders.
export const SignedInSupplier = meta.story({
  args: { visitor: { kind: "supplier", permissions: owner } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Redirects to /orders")).toBeVisible()
  }
})

export const SignedInForwarder = meta.story({
  args: { visitor: { kind: "forwarder", permissions: owner } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Redirects to /orders")).toBeVisible()
  }
})

// A member who can't open the Overview lands on the first page they can.
export const MemberWithoutOverview = meta.story({
  args: { visitor: { kind: "buyer", permissions: member } },
  play: async ({ canvas }) => {
    const target = homeFor("buyer", member)
    await expect(target).not.toBe("/overview")
    await expect(canvas.getByText(`Redirects to ${target}`)).toBeVisible()
  }
})
