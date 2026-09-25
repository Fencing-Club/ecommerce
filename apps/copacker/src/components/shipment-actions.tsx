"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { ActionForm } from "./actions"
import { TextField } from "./form-fields"

export function ApproveInvoice({ id, revision }: { id: string; revision: number }) {
  const [updateCost, setUpdateCost] = useState(false)
  return (
    <ActionForm
      action="shipment.approve"
      label="Approve changes and create shipment"
      transform={() => ({ id, revision, updateCost })}
    >
      <Field orientation="horizontal">
        <Checkbox id="updateCost" checked={updateCost} onCheckedChange={setUpdateCost} />
        <FieldContent>
          <FieldLabel htmlFor="updateCost">Also update Shopify unit costs</FieldLabel>
          <FieldDescription>Pack sizes are applied automatically. Currencies must match.</FieldDescription>
        </FieldContent>
      </Field>
    </ActionForm>
  )
}

export function ReleaseLabels({ id, revision }: { id: string; revision: number }) {
  return (
    <ActionForm
      action="shipment.release"
      label="Release labels to supplier"
      transform={(f) => ({ id, revision, bookingReference: f.get("bookingReference") })}
    >
      <TextField
        label="Amazon transport booking reference"
        name="bookingReference"
        required
        description="Every carton needs a shipping label, and every product needs a unit label before release."
      />
    </ActionForm>
  )
}

export function CorrectionForm({ id }: { id: string }) {
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
          <ActionForm
            action="shipment.correct"
            label="Request correction"
            transform={(f) => ({ id, reason: f.get("reason") })}
          >
            <Field>
              <FieldLabel htmlFor="reason">What needs to change?</FieldLabel>
              <Textarea id="reason" name="reason" required minLength={3} />
              <FieldDescription>
                Existing shipment documents will be marked outdated. Confirmed Amazon shipments need buyer resolution
                before a replacement can be created.
              </FieldDescription>
            </Field>
          </ActionForm>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ReconcileShipment({ id }: { id: string }) {
  return (
    <ActionForm
      action="shipment.reconcile"
      label="Verify and resume"
      transform={(f) => ({ id, amazonOrderId: f.get("amazonOrderId") })}
    >
      <TextField
        name="amazonOrderId"
        label="Existing Amazon AWD order ID"
        placeholder="STAR-"
        required
        description="Copacker verifies that the order belongs to this shipment before continuing."
      />
    </ActionForm>
  )
}
