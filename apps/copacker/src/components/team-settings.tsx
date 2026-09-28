"use client"

import { Ellipsis, Mail, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { z } from "zod"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { useActionForm } from "@/hooks/useActionForm"
import { errorMessage, useActionMutation } from "@/lib/api"
import { ActionForm, FormError } from "./actions"
import { FormInput } from "./form-controls"

type Member = { userId: string; email: string; name: string; owner: boolean }
// `expires` is the day the link stops working, such as "Oct 4".
type Invitation = { email: string; expires: string; expired: boolean }

// The workspace's people and the invitations waiting on someone to join, with Invite in the card's header for owners
// and each row's actions in its menu.
export function TeamSettings({
  members,
  invitations,
  owner,
  you,
  workspace
}: {
  members: Member[]
  invitations: Invitation[]
  owner: boolean
  // The signed-in person's user id.
  you: string
  workspace: string
}) {
  const [inviting, setInviting] = useState(false)
  // The email an invitation just went to, so its row can say so.
  const [sent, setSent] = useState("")

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? "person" : "people"}
        </p>
        {owner && (
          <Dialog open={inviting} onOpenChange={setInviting}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <UserPlus data-icon="inline-start" />
              Invite
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite to {workspace}</DialogTitle>
              </DialogHeader>
              <InviteForm
                onSent={(email) => {
                  setSent(email)
                  setInviting(false)
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
      <ul className="divide-y border-t">
        {members.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            you={member.userId === you}
            removable={owner && !member.owner && member.userId !== you}
            workspace={workspace}
          />
        ))}
        {invitations.map((invitation) => (
          // Keyed by email: sending again replaces the invitation, and its row stays put.
          <InvitationRow
            key={invitation.email}
            invitation={invitation}
            owner={owner}
            sent={sent === invitation.email}
            onSent={setSent}
          />
        ))}
      </ul>
    </Card>
  )
}

const inviteSchema = z.object({ email: z.email("Enter an email address").max(254) })

function InviteForm({ onSent }: { onSent: (email: string) => void }) {
  const { form, submit } = useActionForm({
    schema: inviteSchema,
    action: "team.invite",
    defaultValues: { email: "" },
    onSuccess: (result) => onSent(typeof result.email === "string" ? result.email : "")
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Send invitation" dialog>
      <FormInput
        name="email"
        required
        label="Email"
        type="email"
        autoComplete="off"
        spellCheck={false}
        placeholder="colleague@company.com"
      />
    </ActionForm>
  )
}

// Runs a row's action and refreshes the page, keeping its error for the row to show.
function useRowAction() {
  const router = useRouter()
  const [run] = useActionMutation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  async function perform(action: string, data: Record<string, unknown>) {
    setPending(true)
    setError("")
    try {
      await run({ action, data }).unwrap()
      router.refresh()
      return true
    } catch (failure) {
      setError(errorMessage(failure))
      return false
    } finally {
      setPending(false)
    }
  }
  return { perform, pending, error }
}

function MemberRow({
  member,
  you,
  removable,
  workspace
}: {
  member: Member
  you: boolean
  removable: boolean
  workspace: string
}) {
  const { perform, pending, error } = useRowAction()
  const [confirming, setConfirming] = useState(false)
  const initials = member.name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar>
        <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="flex min-w-0 items-baseline gap-2 font-medium">
          <span className="truncate">{member.name}</span>
          {you && <span className="shrink-0 text-xs font-normal text-muted-foreground">You</span>}
        </p>
        <p className="truncate text-muted-foreground">{member.email}</p>
      </div>
      {member.owner && <Badge variant="secondary">Owner</Badge>}
      {removable && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${member.name}`} />}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
                <AlertDialogDescription>They lose access to {workspace} right away.</AlertDialogDescription>
              </AlertDialogHeader>
              <FormError message={error} />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={pending}
                  aria-busy={pending}
                  onClick={async () => {
                    if (await perform("team.remove", { userId: member.userId })) {
                      setConfirming(false)
                    }
                  }}
                >
                  {pending && <Spinner data-icon="inline-start" />}
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  )
}

function InvitationRow({
  invitation,
  owner,
  sent,
  onSent
}: {
  invitation: Invitation
  owner: boolean
  sent: boolean
  onSent: (email: string) => void
}) {
  const { perform, pending, error } = useRowAction()
  let status = invitation.expired ? "Invitation expired" : `Invited, expires ${invitation.expires}`
  if (sent) {
    status = `Invitation sent, expires ${invitation.expires}`
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar>
        <AvatarFallback>
          <Mail className="size-4" aria-hidden />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-medium">{invitation.email}</p>
        <output className={invitation.expired && !sent ? "text-destructive" : "text-muted-foreground"}>{status}</output>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {owner &&
        (pending ? (
          <Button variant="ghost" size="icon-sm" disabled aria-busy aria-label={`Updating ${invitation.email}`}>
            <Spinner />
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${invitation.email}`} />}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={async () => {
                  if (await perform("team.invite", { email: invitation.email })) {
                    onSent(invitation.email)
                  }
                }}
              >
                Send again
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void perform("team.cancel", { email: invitation.email })}
              >
                Cancel invitation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
    </li>
  )
}
