"use client"

import { useState } from "react"
import { FormProvider } from "react-hook-form"
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
import { FormInput, FormNumber } from "./form-controls"

const schema = z.object({
  carrier: z.string().trim().min(1, "Enter the carrier").max(100),
  reference: z.string().trim().min(1, "Enter the tracking or booking number").max(100),
  amount: z.number({ error: "Enter the freight cost" }).int().min(0)
})

// The forwarder's leg: it ships the goods on and says what the freight cost and how to track it. The buyer does this
// for a forwarder that isn't on Copacker.
export function ForwardShipment({ shipmentId, currency }: { shipmentId: string; currency: string }) {
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
        Mark shipped
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <FormProvider {...form}>
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Mark shipped</DialogTitle>
                <DialogDescription>The freight cost is added to the PO’s landed costs.</DialogDescription>
              </DialogHeader>
              <FieldGroup className="gap-4">
                <FormNumber
                  name="amount"
                  required
                  label={`Freight cost (${currency})`}
                  scale={100}
                  step={0.01}
                  min={0}
                />
                <FormInput name="carrier" required label="Carrier" placeholder="Maersk" />
                <FormInput name="reference" required label="Tracking or booking number" />
              </FieldGroup>
              <FormError message={form.formState.errors.root?.server?.message} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <SubmitButton type="submit" pending={form.formState.isSubmitting}>
                  Mark shipped
                </SubmitButton>
              </DialogFooter>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>
    </>
  )
}
