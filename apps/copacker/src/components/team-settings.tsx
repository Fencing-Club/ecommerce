"use client"

import { Ellipsis, Mail, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { useController, useFormContext, useWatch } from "react-hook-form"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { useActionForm } from "@/hooks/useActionForm"
import { type Access, type Area, type Role, viewOnlyAreas } from "@/lib/access"
import { errorMessage, useActionMutation } from "@/lib/api"
import { areasFor } from "@/lib/navigation"
import { ActionForm, FormError } from "./actions"
import { FormInput, SelectControl } from "./form-controls"

type Member = { userId: string; email: string; name: string; role: Role; access: Access }
// `expires` is the day the link stops working, such as "Oct 4".
type Invitation = { email: string; role: "admin" | "member"; access: Access; expires: string; expired: boolean }

const roleNames: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" }

// The workspace's people and the invitations waiting on someone to join, each with their role. Admins invite from the
// card's header and change or remove someone from their row's menu; the owner's row and your own have none.
export function TeamSettings({
  members,
  invitations,
  admin,
  you,
  workspace,
  kind
}: {
  members: Member[]
  invitations: Invitation[]
  // Whether the signed-in person manages the team: the owner or an admin.
  admin: boolean
  // The signed-in person's user id.
  you: string
  workspace: string
  kind: string
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
        {admin && (
          <Dialog open={inviting} onOpenChange={setInviting}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <UserPlus data-icon="inline-start" />
              Invite
            </DialogTrigger>
            <DialogContent className={accessDialog}>
              <DialogHeader>
                <DialogTitle>Invite to {workspace}</DialogTitle>
              </DialogHeader>
              <InviteForm
                kind={kind}
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
            manageable={admin && member.role !== "owner" && member.userId !== you}
            workspace={workspace}
            kind={kind}
          />
        ))}
        {invitations.map((invitation) => (
          // Keyed by email: sending again replaces the invitation, and its row stays put.
          <InvitationRow
            key={invitation.email}
            invitation={invitation}
            admin={admin}
            kind={kind}
            sent={sent === invitation.email}
            onSent={setSent}
          />
        ))}
      </ul>
    </Card>
  )
}

// A dialog tall enough for every page's access, which scrolls on a short screen.
const accessDialog = "max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md"

const levelChoices = ["none", "view", "edit"] as const
const levelOptions = [
  { value: "none", label: "No access" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" }
]
// What someone can do, as the access fields hold it: every page's level, "none" for a page they can't open.
const accessSchema = z
  .object({
    role: z.enum(["admin", "member"]),
    access: z.record(z.string(), z.enum(levelChoices))
  })
  .refine((values) => values.role === "admin" || Object.values(values.access).some((level) => level !== "none"), {
    message: "Choose at least one page",
    path: ["access"]
  })

// The fields' starting values: an admin, or a member's pages for this kind of workspace, with none chosen for someone
// new.
function accessValues(kind: string, role: Role, access: Access) {
  const levels: Record<string, (typeof levelChoices)[number]> = {}
  for (const { area } of areasFor(kind)) {
    levels[area] = access[area] ?? "none"
  }
  return { role: role === "admin" ? ("admin" as const) : ("member" as const), access: levels }
}

// The access to send: the role, and a member's pages with the ones they can't open left out.
function grant(values: z.output<typeof accessSchema>) {
  return {
    role: values.role,
    access: Object.fromEntries(Object.entries(values.access).filter(([, level]) => level !== "none"))
  }
}

const inviteSchema = z.intersection(z.object({ email: z.email("Enter an email address").max(254) }), accessSchema)

function InviteForm({ kind, onSent }: { kind: string; onSent: (email: string) => void }) {
  const { form, submit } = useActionForm({
    schema: inviteSchema,
    action: "team.invite",
    defaultValues: { email: "", ...accessValues(kind, "member", {}) },
    toPayload: (values) => ({ email: values.email, ...grant(values) }),
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
      <AccessFields kind={kind} />
    </ActionForm>
  )
}

const roleChoices = [
  { value: "admin", label: "Admin", description: "Everything, including the team and settings" },
  { value: "member", label: "Member", description: "Only the pages you choose" }
]

// The role, and for a member, each page they can open and whether they can change what's on it.
function AccessFields({ kind }: { kind: string }) {
  const id = useId()
  const { field: role } = useController({ name: "role" })
  const member = useWatch({ name: "role" }) === "member"
  const {
    trigger,
    formState: { errors }
  } = useFormContext()
  // "Choose at least one page", when a member has none, until they choose one.
  const pagesError = errors.access?.message
  return (
    <>
      <FieldSet>
        <FieldLegend id={`${id}-role`} variant="label">
          Role
        </FieldLegend>
        <RadioGroup value={role.value} onValueChange={role.onChange} aria-labelledby={`${id}-role`} className="gap-2">
          {roleChoices.map((choice) => (
            <FieldLabel
              key={choice.value}
              htmlFor={`${id}-${choice.value}`}
              className="w-full cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary/40 has-data-checked:bg-primary/5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              {/* Base UI's radio isn't a labelable element, so it's named by its text. */}
              <RadioGroupItem
                value={choice.value}
                id={`${id}-${choice.value}`}
                aria-labelledby={`${id}-${choice.value}-label`}
                aria-describedby={`${id}-${choice.value}-description`}
                className="mt-0.5"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span id={`${id}-${choice.value}-label`} className="font-medium">
                  {choice.label}
                </span>
                <span id={`${id}-${choice.value}-description`} className="font-normal text-muted-foreground">
                  {choice.description}
                </span>
              </span>
            </FieldLabel>
          ))}
        </RadioGroup>
      </FieldSet>
      {member && (
        <FieldSet data-invalid={typeof pagesError === "string"} className="gap-0">
          <FieldLegend variant="label">Pages</FieldLegend>
          <div className="divide-y rounded-lg border">
            {areasFor(kind).map(({ area, label }) => (
              <PageAccess
                key={area}
                area={area}
                label={label}
                onChosen={() => typeof pagesError === "string" && void trigger("access")}
              />
            ))}
          </div>
          <FieldError className="mt-2">{typeof pagesError === "string" ? pagesError : null}</FieldError>
        </FieldSet>
      )}
    </>
  )
}

function PageAccess({ area, label, onChosen }: { area: Area; label: string; onChosen: () => void }) {
  const id = useId()
  const {
    field: { ref, value, onChange, onBlur }
  } = useController({ name: `access.${area}` })
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 pr-1.5 pl-3">
      <label htmlFor={id} className="min-w-0 truncate">
        {label}
      </label>
      <div className="w-32 shrink-0">
        <SelectControl
          id={id}
          ref={ref}
          required
          // A page with nothing to change can only be viewed.
          options={viewOnlyAreas.has(area) ? levelOptions.slice(0, 2) : levelOptions}
          value={typeof value === "string" ? value : "none"}
          onValueChange={(next) => {
            onChange(next ?? "none")
            onChosen()
          }}
          onBlur={onBlur}
        />
      </div>
    </div>
  )
}

// Changes what a colleague can do, or what an invitation gives them when they join.
function ChangeAccess({
  who,
  target,
  role,
  access,
  kind,
  open,
  onOpenChange
}: {
  // Their name, or an invitation's email.
  who: string
  target: { userId: string } | { email: string }
  role: Role
  access: Access
  kind: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={accessDialog}>
        <DialogHeader>
          {/* An invitation's email can be long, so it wraps clear of the close button. */}
          <DialogTitle className="pr-6 leading-snug [overflow-wrap:anywhere]">Change access for {who}</DialogTitle>
        </DialogHeader>
        <ChangeAccessForm target={target} role={role} access={access} kind={kind} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ChangeAccessForm({
  target,
  role,
  access,
  kind,
  onSaved
}: {
  target: { userId: string } | { email: string }
  role: Role
  access: Access
  kind: string
  onSaved: () => void
}) {
  const { form, submit } = useActionForm({
    schema: accessSchema,
    action: "team.access",
    defaultValues: accessValues(kind, role, access),
    toPayload: (values) => ({ ...target, ...grant(values) }),
    onSuccess: onSaved
  })
  return (
    <ActionForm form={form} onSubmit={submit} label="Save" dialog>
      <AccessFields kind={kind} />
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
  manageable,
  workspace,
  kind
}: {
  member: Member
  you: boolean
  manageable: boolean
  workspace: string
  kind: string
}) {
  const { perform, pending, error } = useRowAction()
  const [open, setOpen] = useState<"access" | "remove" | null>(null)
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
      <Badge variant={member.role === "member" ? "outline" : "secondary"}>{roleNames[member.role]}</Badge>
      {manageable && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${member.name}`} />}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setOpen("access")}>Change access</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setOpen("remove")}>
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ChangeAccess
            who={member.name}
            target={{ userId: member.userId }}
            role={member.role}
            access={member.access}
            kind={kind}
            open={open === "access"}
            onOpenChange={(next) => setOpen(next ? "access" : null)}
          />
          <AlertDialog open={open === "remove"} onOpenChange={(next) => setOpen(next ? "remove" : null)}>
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
                      setOpen(null)
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
  admin,
  kind,
  sent,
  onSent
}: {
  invitation: Invitation
  admin: boolean
  kind: string
  sent: boolean
  onSent: (email: string) => void
}) {
  const { perform, pending, error } = useRowAction()
  const [changing, setChanging] = useState(false)
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
      <Badge variant={invitation.role === "member" ? "outline" : "secondary"}>{roleNames[invitation.role]}</Badge>
      {admin &&
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
              <DropdownMenuItem onClick={() => setChanging(true)}>Change access</DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  if (await perform("team.resend", { email: invitation.email })) {
                    onSent(invitation.email)
                  }
                }}
              >
                Send again
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void perform("team.cancel", { email: invitation.email })}
              >
                Cancel invitation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      {admin && (
        <ChangeAccess
          who={invitation.email}
          target={{ email: invitation.email }}
          role={invitation.role}
          access={invitation.access}
          kind={kind}
          open={changing}
          onOpenChange={setChanging}
        />
      )}
    </li>
  )
}
