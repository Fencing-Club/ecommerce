import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import { BrandMark } from "@/components/auth/stage"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"
// Outside the app's layouts, so it brings the app's stylesheet itself; the reset comes first.
import "@/styles/global.css"
import "./globals.css"

// A URL that matches no page, outside the app's shell: Copacker's name along the top, as the app's header has it, and
// the empty state in the middle. A portal page that can't find a record shows the portal's own not-found page instead.
// "/" takes someone signed in to their workspace, and anyone else to sign in.
export default function NotFound() {
  const t = useTranslations("common.pages.notFound")
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <Link to="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark flat />
        </Link>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center p-6">
        <EmptyState title={t("title")} description={t("checkAddress")}>
          <Button nativeButton={false} render={<Link to="/" />}>
            {t("goToCopacker")}
          </Button>
        </EmptyState>
      </main>
    </div>
  )
}
