import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button
} from "@buildkitgg/shadcn"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { FlushCard } from "@/components/flush-card"
import type { ActionName } from "@/server/actions"

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
    <FlushCard className="divide-y border-destructive/30 ring-destructive/30">
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
    </FlushCard>
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
  action: ActionName
  label: string
  title: string
  description: string
  field: string
  fieldLabel: string
  expected: string
  blocked?: boolean
}) {
  const t = useTranslations("settings.delete")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const trigger = <AlertDialogTrigger render={<Button variant="destructive" />}>{label}</AlertDialogTrigger>

  if (blocked) {
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        {trigger}
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("close")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={title}
      description={description}
      confirmLabel={label}
      tone="destructive"
      action={action}
      data={{}}
      // A full load, so nothing from the deleted workspace or account stays on screen.
      navigation="document"
      confirmText={{ name: field, label: fieldLabel, expected }}
      // What blocks it may have changed elsewhere, such as a workspace that needs a new owner.
      onError={() => void router.invalidate()}
    />
  )
}
