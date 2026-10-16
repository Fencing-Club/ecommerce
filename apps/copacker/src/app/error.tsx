import { Link } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { useTranslations } from "use-intl"
import { BrandMark } from "@/components/auth/stage"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
// Outside the app's layouts, so it brings the app's stylesheet itself; the reset comes first.
import "@/styles/global.css"
import "./globals.css"

// A page outside the portal that failed, or the portal's own layout: Copacker's name along the top, as the not-found
// page has it, and the portal error page's empty state in the middle. Trying again fetches the page afresh (`retry`;
// `reset` would only re-render what already failed).
export default function ErrorPage({ retry }: { retry: () => void }) {
  const t = useTranslations("common.pages.error")
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <Link to="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark flat />
        </Link>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center p-6">
        <Empty className="gap-4 py-10">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon" className="size-10 text-muted-foreground">
              <CircleAlert aria-hidden className="size-5" />
            </EmptyMedia>
            <EmptyTitle>
              <h1>{t("didntLoad")}</h1>
            </EmptyTitle>
            <EmptyDescription>{t("dataUnchanged")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={retry}>{t("tryAgain")}</Button>
              <Button variant="outline" nativeButton={false} render={<Link to="/overview" />}>
                {t("goToOverview")}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </main>
    </div>
  )
}
