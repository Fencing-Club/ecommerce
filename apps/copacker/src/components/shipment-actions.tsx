"use client"

import { ChevronDown } from "lucide-react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useActionForm } from "@/hooks/useActionForm"
import { ActionForm } from "./actions"
import { FormCheckbox, FormInput, FormTextarea } from "./form-controls"

const approveSchema = z.object({ updateCost: z.boolean() })

export function ApproveInvoice({ id, revision }: { id: string; revision: number }) {
  const { form, submit } = useActionForm({
    schema: approveSchema,
    action: "shipment.approve",
    defaultValues: { updateCost: false },
    toPayload: (values) => ({ id, revision, ...values })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Approve changes and create shipment">
      <FormCheckbox
        name="updateCost"
        label="Also update Shopify unit costs"
        description="Pack sizes are applied automatically. Currencies must match."
      />
    </ActionForm>
  )
}

const releaseSchema = z.object({ bookingReference: z.string().trim().min(1).max(100) })

export function ReleaseLabels({ id, revision }: { id: string; revision: number }) {
  const { form, submit } = useActionForm({
    schema: releaseSchema,
    action: "shipment.release",
    defaultValues: { bookingReference: "" },
    toPayload: (values) => ({ id, revision, ...values })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Release labels to supplier">
      <FormInput
        name="bookingReference"
        label="Amazon transport booking reference"
        description="Every carton needs a shipping label, and every product needs a unit label before release."
      />
    </ActionForm>
  )
}

const correctionSchema = z.object({ reason: z.string().trim().min(3).max(2000) })

export function CorrectionForm({ id }: { id: string }) {
  const { form, submit } = useActionForm({
    schema: correctionSchema,
    action: "shipment.correct",
    defaultValues: { reason: "" },
    toPayload: (values) => ({ id, ...values })
  })
  return (
    <Collapsible render={<Card />}>
      <CardHeader>
        <CollapsibleTrigger render={<Button variant="ghost" className="group/trigger -mx-2.5 w-fit" />}>
          Request a correction
          <ChevronDown
            data-icon="inline-end"
            className="transition-transform group-data-panel-open/trigger:rotate-180"
          />
        </CollapsibleTrigger>
      </CardHeader>
      <CollapsibleContent>
        <CardContent>
          <ActionForm form={form} onSubmit={submit} label="Request correction">
            <FormTextarea
              name="reason"
              label="What needs to change?"
              description="Existing shipment documents will be marked outdated. Confirmed Amazon shipments need buyer resolution before a replacement can be created."
            />
          </ActionForm>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  )
}

const reconcileSchema = z.object({
  amazonOrderId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^STAR-[A-Z0-9]+$/, "Enter the Amazon order ID, which starts with STAR-")
})

export function ReconcileShipment({ id }: { id: string }) {
  const { form, submit } = useActionForm({
    schema: reconcileSchema,
    action: "shipment.reconcile",
    defaultValues: { amazonOrderId: "" },
    toPayload: (values) => ({ id, ...values })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Verify and resume">
      <FormInput
        name="amazonOrderId"
        label="Existing Amazon AWD order ID"
        placeholder="STAR-"
        description="Copacker verifies that the order belongs to this shipment before continuing."
      />
    </ActionForm>
  )
}
