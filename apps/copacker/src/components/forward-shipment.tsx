"use client"

import { useState } from "react"
import { FormProvider } from "react-hook-form"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { useActionForm } from "@/hooks/useActionForm"
import { FormError, SubmitButton } from "./actions"
import { FormInput, FormMoney } from "./form-controls"

const schema = z.object({
  carrier: z.string().trim().min(1, "shipments.forward.enterCarrier").max(100),
  reference: z.string().trim().min(1, "shipments.forward.enterReference").max(100),
  // An empty cost asks for one; the range checks keep their own messages, which a plain `error` would replace.
  amount: z
    .number({ error: (issue) => (issue.code === "invalid_type" ? "shipments.forward.enterFreightCost" : undefined) })
    .int()
    .min(0)
    .max(100000000)
})

// The forwarder's leg: it ships the goods on and says what the freight cost and how to track it. The buyer does this
// for a forwarder that isn't on Copacker.
export function ForwardShipment({ shipmentId, currency }: { shipmentId: string; currency: string }) {
  const t = useTranslations("shipments.forward")
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema,
    action: "shipment.forward",
    defaultValues: { carrier: "", reference: "" },
    toPayload: (values) => ({
      id: shipmentId,
      carrier: values.carrier,
      reference: values.reference,
      freight: { amountMinor: values.amount, currency }
    }),
    onSuccess: () => setOpen(false)
  })
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {t("markShipped")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <FormProvider {...form}>
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{t("title")}</DialogTitle>
                <DialogDescription>{t("description")}</DialogDescription>
              </DialogHeader>
              <FieldGroup className="gap-4">
                <FormMoney name="amount" required label={t("freightCost")} currency={currency} />
                <FormInput name="carrier" required label={t("carrier")} placeholder="Maersk" />
                <FormInput name="reference" required label={t("reference")} />
              </FieldGroup>
              <FormError message={form.formState.errors.root?.server?.message} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("cancel")}
                </Button>
                <SubmitButton type="submit" pending={form.formState.isSubmitting}>
                  {t("markShipped")}
                </SubmitButton>
              </DialogFooter>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>
    </>
  )
}
