import { z } from "zod"
import {
  createForwarder,
  forwarderAddressSchema,
  forwarderInputSchema,
  inviteForwarder,
  removeForwarder,
  renameForwarder,
  saveForwarderAddress
} from "@/server/forwarders"
import { optionalEmail } from "@/server/invitations"
import { removeSupplierAddress, saveSupplierAddress } from "@/server/supplier-addresses"
import { createSupplier, inviteSupplier, newSupplierSchema, removeSupplier, updateSupplier } from "@/server/suppliers"
import { defineAction, fields, type Guard } from "./define"

// A buyer's suppliers and forwarders, and the addresses it keeps for the ones that haven't joined. See partners.md.
const partners: Guard = { kind: "buyer", area: "partners", level: "edit" }
const record = z.object({ id: z.uuid() })
const invite = z.object({ id: z.uuid(), email: optionalEmail })
// Supplier names and lead times show in the order and restock pickers, and which products have one on Products.
const supplierCaches = ["Supplier", "ProductSupplier"] as const

export const partnerActions = {
  "supplier.create": defineAction({
    guard: partners,
    input: newSupplierSchema,
    invalidates: supplierCaches,
    run: (input, s) => createSupplier(s.org, input)
  }),
  // Invites a supplier that hasn't joined, or sends its invitation again.
  "supplier.invite": defineAction({
    guard: partners,
    input: invite,
    run: async ({ id, email }, s) => {
      await inviteSupplier(s.org, id, email)
      return { ok: true }
    }
  }),
  "supplier.resend": defineAction({
    guard: partners,
    input: invite,
    run: async ({ id, email }, s) => {
      await inviteSupplier(s.org, id, email)
      return { ok: true }
    }
  }),
  "supplier.update": defineAction({
    guard: partners,
    input: fields,
    invalidates: supplierCaches,
    run: async (data, s) => {
      await updateSupplier(s.org.id, data)
      return { ok: true }
    }
  }),
  "supplier.remove": defineAction({
    guard: partners,
    input: record,
    invalidates: supplierCaches,
    run: async ({ id }, s) => {
      await removeSupplier(s.org.id, id)
      return { ok: true }
    }
  }),
  // Adds or edits a pickup address for a supplier that hasn't joined, or with `remove`, deletes it.
  "supplier.address": defineAction({
    guard: partners,
    input: fields,
    run: (data, s) => (data.remove === true ? removeSupplierAddress : saveSupplierAddress)(s.org.id, data)
  }),
  "forwarder.create": defineAction({
    guard: partners,
    input: forwarderInputSchema,
    run: async (input, s) => ({ id: (await createForwarder(s.org, input)).id })
  }),
  "forwarder.rename": defineAction({
    guard: partners,
    input: record.extend({ name: forwarderInputSchema.shape.name }),
    run: async ({ id, name }, s) => {
      await renameForwarder(s.org.id, id, name)
      return { ok: true }
    }
  }),
  "forwarder.invite": defineAction({
    guard: partners,
    input: invite,
    run: async ({ id, email }, s) => {
      await inviteForwarder(s.org, id, email)
      return { ok: true }
    }
  }),
  "forwarder.address": defineAction({
    guard: partners,
    input: forwarderAddressSchema,
    run: async (input, s) => {
      await saveForwarderAddress(s.org.id, input)
      return { ok: true }
    }
  }),
  "forwarder.remove": defineAction({
    guard: partners,
    input: record,
    run: async ({ id }, s) => {
      await removeForwarder(s.org.id, id)
      return { ok: true }
    }
  })
}
