import { addressSchema } from "@repo/copacker-orders"
import { objectKeys } from "ts-extras"
import { z } from "zod"
import { phoneSchema } from "./phone"

// What getting started asks, shared by the steps in the browser and the server that saves them.

export const workspaceKinds = ["buyer", "supplier", "forwarder"] as const
export type WorkspaceKind = (typeof workspaceKinds)[number]

// Roles at buyers, suppliers and freight forwarders: the English name a profile saves, and its label's key under
// onboarding.positions.
export const positionKeys = {
  Owner: "owner",
  "General manager": "generalManager",
  "Operations manager": "operationsManager",
  "Purchasing manager": "purchasingManager",
  Buyer: "buyer",
  "Sales manager": "salesManager",
  "Account manager": "accountManager",
  "Production manager": "productionManager",
  "Quality control": "qualityControl",
  "Logistics coordinator": "logisticsCoordinator",
  "Warehouse manager": "warehouseManager",
  "Customer service": "customerService",
  Finance: "finance",
  Other: "other"
} as const
export type Position = keyof typeof positionKeys
export const positions: string[] = objectKeys(positionKeys)

export function isPosition(value: string): value is Position {
  return Object.hasOwn(positionKeys, value)
}

const websiteError = "onboarding.company.enterWebsite"

// A website as typed, or nothing: "example.com" is read as https://example.com. Its host has to be a domain name, so a
// word such as "fencing" isn't taken for a website, and neither is an email address typed here.
export const websiteSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value && !/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? `https://${value}` : value))
  .pipe(
    z.union([
      z.literal(""),
      z.httpUrl({ error: websiteError }).refine((url) => !/^https?:\/\/[^/?#]*@/i.test(url), websiteError)
    ])
  )

export const personSchema = z.object({
  firstName: z.string().trim().min(1, "onboarding.person.enterFirstName").max(60),
  lastName: z.string().trim().min(1, "onboarding.person.enterLastName").max(60),
  position: z.string().trim().min(1, "onboarding.person.choosePosition").max(100)
})

export const companySchema = z.object({
  name: z.string().trim().min(2, "onboarding.company.enterName").max(120),
  website: websiteSchema,
  phone: phoneSchema
})

// An address with nothing filled in yet, for the address step to start from.
export const blankPlace = {
  name: "",
  address: {
    name: "",
    phoneNumber: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateOrRegion: "",
    postalCode: "",
    countryCode: ""
  }
}

// A saved address: its name in Copacker's lists, and the address itself.
export const placeSchema = z.object({
  name: z.string().trim().min(1, "onboarding.place.enterName").max(100),
  address: addressSchema
})

// A new workspace, with the person's profile and, when a buyer invited them, the invitation it accepts.
export const workspaceSetupSchema = z.object({
  person: personSchema,
  kind: z.enum(workspaceKinds),
  company: companySchema,
  address: placeSchema.nullable(),
  invitation: z.object({ kind: z.enum(["supplier", "forwarder"]), token: z.string().min(20).max(200) }).nullable()
})

// Accepting an invitation without making a workspace: a colleague joins, or a supplier or forwarder brings one it
// already owns. A colleague gives their profile here when they haven't yet.
export const joinSchema = z.object({
  kind: z.enum(["team", "supplier", "forwarder"]),
  token: z.string().min(20).max(200),
  orgId: z.uuid().optional(),
  person: personSchema.optional()
})
