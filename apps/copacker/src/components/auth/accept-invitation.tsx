import { useRouter } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useAction } from "@/hooks/use-action"
import { initials } from "@/lib/initials"

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
  const t = useTranslations("auth.invite")
  const router = useRouter()
  const join = useAction("onboarding.join")
  const [choice, setChoice] = useState(workspaces[0]?.id ?? "")
  const [settingUp, setSettingUp] = useState(false)
  const pending = settingUp || join.pending
  const error = join.error
  function accept() {
    if (setUp && choice === "new") {
      setSettingUp(true)
      void router.navigate({ href: setUp })
      return
    }
    void join.run({ kind, token, ...(kind !== "team" && { orgId: choice }) })
  }
  return (
    <div className="flex flex-col gap-6">
      {workspaces.length > 0 && (
        <RadioGroup value={choice} onValueChange={setChoice} aria-label={t("workspace")} className="gap-2">
          {[...workspaces, ...(setUp ? [{ id: "new", name: t("newWorkspace") }] : [])].map((workspace) => (
            <FieldLabel
              key={workspace.id}
              htmlFor={`workspace-${workspace.id}`}
              className="w-full cursor-pointer items-center gap-3 rounded-xl border p-3 has-data-checked:border-primary-border has-data-checked:bg-primary-tint has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
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
      <SubmitButton className="h-10 w-full" pending={pending} disabled={!choice && kind !== "team"} onClick={accept}>
        {choice === "new" ? t("continue") : label}
      </SubmitButton>
    </div>
  )
}
