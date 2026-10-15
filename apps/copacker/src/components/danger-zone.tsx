"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { FormError } from "@/components/form-feedback"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"

// The kinds of workspace, each of which says what deleting it takes with it. The purchase orders are the buyer's, so a
// supplier's or forwarder's buyers keep theirs.
type WorkspaceKind = "buyer" | "supplier" | "forwarder"

// Deleting for good, at the bottom of Settings: the workspace, for its owner, and the person's own account. Each opens a
// confirmation that asks them to type what's being deleted.
export function DangerZone({
  workspace,
  kind,
  owner,
  email,
  handOver,
  closing
}: {
  workspace: string
  kind: WorkspaceKind
  // Whether the signed-in person owns the workspace, and so can delete it.
  owner: boolean
  email: string
  // Workspaces the person owns that others use, which need a new owner before the account can go.
  handOver: string[]
  // Workspaces only the person uses, which close with the account.
  closing: string[]
}) {
  const t = useTranslations("settings.delete")
  const format = useFormatter()
  let accountDescription = t("account.removed")
  if (handOver.length) {
    accountDescription = t("account.handOver", { workspaces: format.list(handOver) })
  } else if (closing.length) {
    accountDescription = t("account.closing", { count: closing.length, workspaces: format.list(closing) })
  }
  return (
    <Card className="gap-0 divide-y border-destructive/40 py-0 ring-destructive/40">
      {owner && (
        <Row title={t("workspace.title")} detail={t("workspace.detail", { workspace })}>
          <Confirm
            action="workspace.delete"
            label={t("workspace.title")}
            title={t("workspace.confirm", { workspace })}
            description={t(`workspace.${kind}`)}
            field="name"
            fieldLabel={t("workspace.field")}
            expected={workspace}
          />
        </Row>
      )}
      <Row title={t("account.title")} detail={t("account.detail")}>
        <Confirm
          action="account.delete"
          label={t("account.title")}
          title={t("account.confirm")}
          description={accountDescription}
          field="email"
          fieldLabel={t("account.field")}
          expected={email}
          blocked={handOver.length > 0}
        />
      </Row>
    </Card>
  )
}

function Row({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      {children}
    </div>
  )
}

// A destructive button and its confirmation, which deletes once what's typed matches. `blocked` explains why it can't
// yet, without a field or a delete button.
function Confirm({
  action,
  label,
  title,
  description,
  field,
  fieldLabel,
  expected,
  blocked = false
}: {
  action: string
  label: string
  title: string
  description: string
  field: string
  fieldLabel: string
  expected: string
  blocked?: boolean
}) {
  const t = useTranslations("settings.delete")
  const errorMessage = useErrorMessage()
  const id = useId()
  const router = useRouter()
  const [run] = useActionMutation()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const matches = typed.trim().toLowerCase() === expected.trim().toLowerCase()

  async function remove(event: React.FormEvent) {
    event.preventDefault()
    if (!matches || pending) {
      return
    }
    setPending(true)
    setError("")
    try {
      const result = await run({ action, data: { [field]: typed.trim() } }).unwrap()
      // A full load, so nothing from the deleted workspace or account stays on screen.
      window.location.assign(result.redirect ?? "/")
    } catch (failure) {
      setError(errorMessage(failure))
      setPending(false)
      router.refresh()
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setTyped("")
        setError("")
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" />}>{label}</AlertDialogTrigger>
      <AlertDialogContent>
        <form onSubmit={remove} className="contents">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {!blocked && (
            <Field>
              <FieldLabel htmlFor={id}>{fieldLabel}</FieldLabel>
              <Input
                id={id}
                value={typed}
                autoComplete="off"
                spellCheck={false}
                placeholder={expected}
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>
          )}
          <FormError message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              {blocked ? t("close") : t("cancel")}
            </AlertDialogCancel>
            {!blocked && (
              <Button type="submit" variant="destructive" disabled={!matches || pending} aria-busy={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {label}
              </Button>
            )}
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
