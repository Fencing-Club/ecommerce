"use client"

import { ChevronDown } from "lucide-react"
import { FormProvider } from "react-hook-form"
import { useTranslations } from "use-intl"
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
  const t = useTranslations("shipments.actions.approve")
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
          <FormCheckbox name="updateCost" label={t("updateCost")} description={t("updateCostDescription")} />
          <FormError message={form.formState.errors.root?.server?.message} />
          <div>
            <SubmitButton type="submit" pending={form.formState.isSubmitting}>
              {t("submit")}
            </SubmitButton>
          </div>
        </FieldGroup>
      </form>
    </FormProvider>
  )
}

const releaseSchema = z.object({ bookingReference: z.string().trim().min(1).max(100) })

export function ReleaseLabels({ id, revision }: { id: string; revision: number }) {
  const t = useTranslations("shipments.actions.release")
  const { form, submit } = useActionForm({
    schema: releaseSchema,
    action: "shipment.release",
    defaultValues: { bookingReference: "" },
    toPayload: (values) => ({ id, revision, ...values })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={t("submit")}>
      <FormInput name="bookingReference" required label={t("bookingReference")} />
    </ActionForm>
  )
}

const correctionSchema = z.object({ reason: z.string().trim().min(3).max(2000) })

export function CorrectionForm({ id }: { id: string }) {
  const t = useTranslations("shipments.actions.correction")
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
          {t("trigger")}
          <ChevronDown data-icon="inline-end" className={styles.chevron} />
        </CollapsibleTrigger>
      </CardHeader>
      <CollapsibleContent>
        <CardContent>
          <ActionForm form={form} onSubmit={submit} label={t("submit")}>
            <FormTextarea name="reason" required label={t("reason")} description={t("reasonDescription")} />
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
    .regex(/^STAR-[A-Z0-9]+$/, "shipments.actions.reconcile.awdInvalid")
})
const fbaReconcileSchema = z.object({
  amazonOrderId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^wf[0-9a-f-]{36}$/, "shipments.actions.reconcile.fbaInvalid")
})

// Links a shipment to the AWD order or FBA inbound plan Amazon made when Copacker lost its reply.
export function ReconcileShipment({ id, fba }: { id: string; fba: boolean }) {
  const t = useTranslations("shipments.actions.reconcile")
  const { form, submit } = useActionForm({
    schema: fba ? fbaReconcileSchema : awdReconcileSchema,
    action: "shipment.reconcile",
    defaultValues: { amazonOrderId: "" },
    toPayload: (values) => ({ id, ...values })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={t("submit")}>
      <FormInput
        name="amazonOrderId"
        required
        label={fba ? t("fbaLabel") : t("awdLabel")}
        placeholder={fba ? "wf" : "STAR-"}
      />
    </ActionForm>
  )
}
