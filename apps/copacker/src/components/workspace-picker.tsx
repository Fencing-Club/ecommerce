import { Button, Spinner } from "@buildkitgg/shadcn-baseui-kit"
import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "use-intl"
import { BrandMark } from "@/components/auth/stage"
import { type Workspace, WorkspaceIdentity } from "@/components/workspace-menu"
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace"

export function WorkspacePicker({
  workspaces,
  unavailable = false
}: {
  workspaces: ReadonlyArray<Workspace>
  unavailable?: boolean
}) {
  const t = useTranslations("navigation.workspacePicker")
  const { switchTo, switching, error } = useSwitchWorkspace()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <Link to="/" className="focus-ring rounded-md">
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
                disabled={switching !== null}
                aria-busy={switching === workspace.id}
                onClick={() => void switchTo(workspace.id)}
              >
                <WorkspaceIdentity workspace={workspace} />
                {switching === workspace.id ? (
                  <Spinner aria-hidden />
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
