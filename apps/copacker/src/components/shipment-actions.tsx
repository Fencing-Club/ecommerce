"use client"

import { ChevronDown } from "lucide-react"
import { FormProvider } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FieldGroup } from "@/components/ui/field"
import { useActionForm } from "@/hooks/useActionForm"
import { ActionForm, FormError, SubmitButton } from "./actions"
import { FormCheckbox, FormInput, FormTextarea } from "./form-controls"
import * as styles from "./shipment-actions.css"

const approveSchema = z.object({ updateCost: z.boolean() })

export function ApproveInvoice({ id, revision }: { id: string; revision: number }) {
  const { form, submit } = useActionForm({
    schema: approveSchema,
    action: "shipment.approve",
    defaultValues: { updateCost: false },
    toPayload: (values) => ({ id, revision, ...values })
  })
  // Laid out like ActionForm, whose button waits for a change: approving needs none.
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <FormCheckbox
            name="updateCost"
            label="Also update Shopify unit costs"
            description="Shopify costs must be in the purchase order’s currency"
          />
          <FormError message={form.formState.errors.root?.server?.message} />
          <div>
            <SubmitButton type="submit" pending={form.formState.isSubmitting}>
              Approve changes
            </SubmitButton>
          </div>
        </FieldGroup>
      </form>
    </FormProvider>
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
      <FormInput name="bookingReference" required label="Amazon transport booking reference" />
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
        <CollapsibleTrigger render={<Button variant="ghost" className={styles.trigger} />}>
          Request a correction
          <ChevronDown data-icon="inline-end" className={styles.chevron} />
        </CollapsibleTrigger>
      </CardHeader>
      <CollapsibleContent>
        <CardContent>
          <ActionForm form={form} onSubmit={submit} label="Request correction">
            <FormTextarea
              name="reason"
              required
              label="What needs to change?"
              description="This shipment’s documents become outdated"
            />
          </ActionForm>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  )
}

const awdReconcileSchema = z.object({
  amazonOrderId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^STAR-[A-Z0-9]+$/, "Enter the Amazon order ID, which starts with STAR-")
})
const fbaReconcileSchema = z.object({
  amazonOrderId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^wf[0-9a-f-]{36}$/, "Enter the inbound plan ID, which starts with wf")
})

// Links a shipment to the AWD order or FBA inbound plan Amazon made when Copacker lost its reply.
export function ReconcileShipment({ id, fba }: { id: string; fba: boolean }) {
  const { form, submit } = useActionForm({
    schema: fba ? fbaReconcileSchema : awdReconcileSchema,
    action: "shipment.reconcile",
    defaultValues: { amazonOrderId: "" },
    toPayload: (values) => ({ id, ...values })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Verify and resume">
      <FormInput
        name="amazonOrderId"
        required
        label={fba ? "Existing FBA inbound plan ID" : "Existing Amazon AWD order ID"}
        placeholder={fba ? "wf" : "STAR-"}
      />
    </ActionForm>
  )
}
