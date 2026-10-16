import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { OverviewPagePending } from "@/components/overview-page"
import { can } from "@/lib/access"
import { homeFor } from "@/lib/navigation"
import { requirePage, session } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { overviewPageData, type OverviewPageData } from "@/server/overview-page"
import { OverviewContent } from "./content"

export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("overview")
  return { title: t("title") }
})

type Query = Record<string, string | string[] | undefined>

async function Content({ data, query }: { data: Promise<OverviewPageData>; query: Query }) {
  return <OverviewContent page={await data} query={query} />
}

export default withRequest(async function OverviewPage({ searchParams }: { searchParams: Promise<Query> }) {
  const s = await session()
  // Every workspace has an Overview for links to land on; a member without it goes to their home.
  if (!can(s, "overview") || s.org.kind === "forwarder") {
    redirect(homeFor(s.org.kind, s))
  }
  requirePage(s, "prices")
  const query = await searchParams
  return (
    <Suspense key={JSON.stringify(query)} fallback={<OverviewPagePending />}>
      <Content data={overviewPageData(s, query)} query={query} />
    </Suspense>
  )
})
