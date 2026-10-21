import { http, HttpResponse } from "msw/http"
import type { WizardValues } from "@/components/onboarding/onboarding-wizard"
import type { profiles } from "@/db/schema"
import { blankPlace } from "@/lib/onboarding"
import type { Invitation } from "@/server/invitations"
import type { InvitationKind } from "@/server/invitations"

// Sign-in, invitations and getting started, for stories.

// Ends every entrance animation at once, so a story sees pages that fade in as they end up. For a story's
// beforeEach; it returns the cleanup.
export function skipAnimations() {
  const style = document.createElement("style")
  style.textContent = "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; }"
  document.head.appendChild(style)
  return () => style.remove()
}

type ActionBody = { action: string; data: Record<string, unknown> }
type Reply = (body: ActionBody) => Response

function isActionBody(value: unknown): value is ActionBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "action" in value &&
    typeof value.action === "string" &&
    "data" in value &&
    typeof value.data === "object"
  )
}

// The /api/action requests a story sends, oldest first. `handler` answers them with `reply` for one story and
// forgets the last story's requests.
export function actionRecorder() {
  const sent: ActionBody[] = []
  return {
    sent,
    handler(reply: Reply = () => HttpResponse.json({ ok: true })) {
      sent.length = 0
      return http.post("/api/action", async ({ request }) => {
        const body: unknown = await request.json()
        if (!isActionBody(body)) {
          return HttpResponse.json({ error: "Bad request" }, { status: 400 })
        }
        sent.push(body)
        return reply(body)
      })
    }
  }
}

// A change that succeeds and moves on to `path`.
export const redirectTo = (path: string) => () => HttpResponse.json({ ok: true, redirect: path })

// A change the server turns down with `message`, already in the person's language.
export const failWith = (message: string) => () => HttpResponse.json({ error: message }, { status: 400 })

// The English messages of the server errors the sign-in pages meet (messages/en/errors.json).
export const errors = {
  incorrectCredentials: "Incorrect email or password.",
  wrongCode: "That code isn’t right. Check the email and try again.",
  codeExpired: "This code expired. Sign in again to get a new one.",
  linkExpired: "This link expired. Request a new one.",
  invitationInvalid: "Invitation expired or belongs to a different email address",
  generic: "Something went wrong. Try again."
}

// An invitation link's token: long enough for the invitation page to look it up.
export const invitationToken = "inv_7Hq2kR9sLm4Xw8Zp3Tn6Vb"

// The link to an invitation, as server/invitations.ts writes it (that module hashes with node:crypto, which the
// browser lacks).
export function invitationPath(kind: InvitationKind, token: string) {
  return `/invite?token=${encodeURIComponent(token)}&kind=${kind === "supplier" ? "invite" : kind}`
}

// Workspaces a supplier already runs, which it can bring to a buyer's invitation.
export const ownedWorkspaces = [
  { id: "3f6c2b1a-9d4e-4c7b-8a1f-2e5d7c9b0a11", name: "Lotus Manufacturing" },
  { id: "3f6c2b1a-9d4e-4c7b-8a1f-2e5d7c9b0a12", name: "Lotus Packaging Co" }
]

const invitedAddress = {
  name: "Factory",
  address: {
    name: "Mei Chen",
    phoneNumber: "+86 188 6161 3263",
    email: "mei@lotus.example.com",
    addressLine1: "88 Industrial Road",
    addressLine2: "",
    city: "Ningbo",
    stateOrRegion: "Zhejiang",
    postalCode: "315000",
    countryCode: "CN"
  }
}

// An invitation from Harbor Goods, as findInvitation returns it.
export function invitation(kind: InvitationKind, overrides: Partial<Invitation> = {}): Invitation {
  if (kind === "team") {
    return {
      kind,
      email: "jordan@example.com",
      from: "Harbor Goods",
      company: "Harbor Goods",
      expired: false,
      website: "",
      phone: "",
      addresses: [],
      ...overrides
    }
  }
  return {
    kind,
    email: kind === "supplier" ? "mei@lotus.example.com" : "ops@bayline.example.com",
    from: "Harbor Goods",
    company: kind === "supplier" ? "Lotus Manufacturing" : "Bayline Freight",
    expired: false,
    website: kind === "supplier" ? "https://lotus.example.com" : "",
    phone: kind === "supplier" ? "+86 188 6161 3263" : "",
    addresses: kind === "forwarder" ? [] : [invitedAddress],
    ...overrides
  }
}

// A saved profile, as the profiles table keeps it.
export const savedProfile: typeof profiles.$inferSelect = {
  userId: "user_story",
  firstName: "Alex",
  lastName: "Rivera",
  position: "Operations manager",
  company: "Harbor Goods",
  locale: null,
  updatedAt: new Date("2026-01-15T12:00:00Z")
}

// What getting started starts from before anything is typed.
export function blankWizard(person: Partial<WizardValues["person"]> = {}): WizardValues {
  return {
    person: { firstName: "", lastName: "", position: "", ...person },
    kind: "",
    company: { name: "", website: "", phone: "" },
    address: blankPlace
  }
}

// Getting started with every step filled in, for a buyer in Oakland.
export const filledWizard: WizardValues = {
  person: { firstName: "Alex", lastName: "Rivera", position: "Operations manager" },
  kind: "buyer",
  company: { name: "Harbor Goods", website: "harborgoods.example.com", phone: "" },
  address: {
    name: "Warehouse",
    address: {
      name: "Alex Rivera",
      phoneNumber: "",
      email: "",
      addressLine1: "12 Harbor Way",
      addressLine2: "",
      city: "Oakland",
      stateOrRegion: "CA",
      postalCode: "94607",
      countryCode: "US"
    }
  }
}
