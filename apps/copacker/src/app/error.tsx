import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Link } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { useTranslations } from "use-intl"
import { BrandMark } from "@/components/auth/stage"
import { EmptyState } from "@/components/common"
import { useWorkspaceWatch } from "@/hooks/use-workspace-watch"
// Outside the app's layouts, so it brings the app's stylesheet itself: Tailwind with the kit's stylesheet, then the
// theme's colors, which override the kit's defaults.
import "./globals.css"
import "@/styles/theme.css"

// A page outside the portal that failed, or the portal's own layout: Copacker's name along the top, as the not-found
// page has it, and the portal error page's empty state in the middle. Trying again fetches the page afresh (`retry`;
// `reset` would only re-render what already failed).
export default function ErrorPage({ retry }: { retry: () => void }) {
  const t = useTranslations("common.pages.error")
  useWorkspaceWatch()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <Link to="/" className="focus-ring rounded-md">
          <BrandMark flat />
        </Link>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          titleAs="h1"
          title={t("didntLoad")}
          description={t("dataUnchanged")}
          icon={<CircleAlert aria-hidden />}
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={retry}>{t("tryAgain")}</Button>
            <Button variant="outline" nativeButton={false} render={<Link to="/overview" />}>
              {t("goToOverview")}
            </Button>
          </div>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<a href="/workspaces" aria-label={t("switchWorkspace")} />}
          >
            {t("switchWorkspace")}
          </Button>
        </EmptyState>
      </main>
    </div>
  )
}
