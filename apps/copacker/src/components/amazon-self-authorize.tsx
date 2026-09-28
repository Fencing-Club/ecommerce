"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { useActionForm } from "@/hooks/useActionForm"
import { selfAuthorizationSchema } from "@/lib/amazon"
import { ActionForm } from "./actions"
import { FormInput } from "./form-controls"

// While Copacker's Amazon app is a draft, Amazon's consent page won't offer it, so the seller authorizes the app in
// the Solution Provider Portal and pastes the refresh token here. Copacker checks it with Amazon and stores it
// encrypted.
export function AmazonSelfAuthorize() {
  const [open, setOpen] = useState(false)
  const { form, submit } = useActionForm({
    schema: selfAuthorizationSchema,
    action: "connection.amazonSelfAuthorized",
    defaultValues: { sellerId: "", refreshToken: "" },
    onSuccess: () => setOpen(false)
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Connect Amazon</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Amazon</DialogTitle>
          <DialogDescription>
            In Amazon&apos;s Solution Provider Portal, open the menu next to Copacker&apos;s app, choose Authorize and
            copy the refresh token. Your merchant token is in Seller Central under Settings, Account Info.
          </DialogDescription>
        </DialogHeader>
        <ActionForm form={form} onSubmit={submit} label="Connect" dialog>
          <FormInput name="sellerId" required label="Merchant token" placeholder="A2CIYIV0E1FHU3" autoComplete="off" />
          <FormInput
            name="refreshToken"
            required
            label="Refresh token"
            type="password"
            placeholder="Atzr|…"
            autoComplete="off"
          />
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
