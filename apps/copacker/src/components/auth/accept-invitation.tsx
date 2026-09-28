"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { FormError, SubmitButton } from "@/components/actions"
import { FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { errorMessage, useActionMutation } from "@/lib/api"

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// Accepting for someone who's signed in with the invited email and has nothing left to give. A colleague joins. A
// supplier or forwarder that already owns a workspace of that kind picks one, or goes on to make a new one.
export function AcceptInvitation({
  kind,
  token,
  label,
  workspaces = [],
  setUp
}: {
  kind: "team" | "supplier" | "forwarder"
  token: string
  label: string
  workspaces?: Array<{ id: string; name: string }>
  // Where making a new workspace for the invitation starts.
  setUp?: string
}) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [choice, setChoice] = useState(workspaces[0]?.id ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  async function accept() {
    if (setUp && choice === "new") {
      setPending(true)
      router.push(setUp)
      return
    }
    setPending(true)
    setError("")
    try {
      const result = await run({
        action: "onboarding.join",
        data: { kind, token, ...(kind !== "team" && { orgId: choice }) }
      }).unwrap()
      router.push(result.redirect ?? "/")
      router.refresh()
    } catch (failure) {
      setError(errorMessage(failure))
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-6">
      {workspaces.length > 0 && (
        <RadioGroup value={choice} onValueChange={setChoice} aria-label="Workspace" className="gap-2">
          {[...workspaces, ...(setUp ? [{ id: "new", name: "New workspace" }] : [])].map((workspace) => (
            <FieldLabel
              key={workspace.id}
              htmlFor={`workspace-${workspace.id}`}
              className="w-full cursor-pointer items-center gap-3 rounded-xl border p-3 has-data-checked:border-primary/40 has-data-checked:bg-primary/5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-xs font-medium">
                {workspace.id === "new" ? <Plus className="size-4" aria-hidden /> : initials(workspace.name)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{workspace.name}</span>
              <RadioGroupItem value={workspace.id} id={`workspace-${workspace.id}`} />
            </FieldLabel>
          ))}
        </RadioGroup>
      )}
      <FormError message={error} />
      <SubmitButton
        className="h-10 w-full"
        pending={pending}
        disabled={!choice && kind !== "team"}
        onClick={() => void accept()}
      >
        {choice === "new" ? "Continue" : label}
      </SubmitButton>
    </div>
  )
}
