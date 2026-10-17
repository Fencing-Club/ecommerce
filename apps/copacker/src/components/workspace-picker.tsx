import { Link } from "@tanstack/react-router"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { BrandMark } from "@/components/auth/stage"
import { Button } from "@/components/ui/button"
import { type Workspace, WorkspaceIdentity } from "@/components/workspace-menu"
import { announceWorkspace } from "@/components/workspace-watch"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"

export function WorkspacePicker({
  workspaces,
  unavailable = false
}: {
  workspaces: ReadonlyArray<Workspace>
  unavailable?: boolean
}) {
  const t = useTranslations("navigation.workspacePicker")
  const errorMessage = useErrorMessage()
  const [run] = useActionMutation()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(id: string) {
    setPending(id)
    setError(null)
    try {
      await run({ action: "workspace.switch", data: { id } }).unwrap()
      announceWorkspace(id)
      window.location.assign("/")
    } catch (reason) {
      setError(errorMessage(reason))
      setPending(null)
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <Link to="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark flat />
        </Link>
      </header>
      <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          {unavailable && <p className="text-sm text-muted-foreground">{t("unavailable")}</p>}
        </div>
        <ul className="space-y-2" aria-label={t("title")}>
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Button
                variant="outline"
                className="h-auto min-h-16 w-full justify-start gap-3 px-3 py-3"
                disabled={pending !== null}
                aria-busy={pending === workspace.id}
                onClick={() => void choose(workspace.id)}
              >
                <WorkspaceIdentity workspace={workspace} />
                {pending === workspace.id ? (
                  <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
                ) : (
                  <ArrowRight aria-hidden className="size-4 shrink-0 rtl:rotate-180" />
                )}
              </Button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </main>
    </div>
  )
}
