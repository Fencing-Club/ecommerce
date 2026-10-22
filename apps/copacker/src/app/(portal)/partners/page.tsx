import { Search } from "lucide-react"
import { useTranslations } from "use-intl"
import { EmptyState, PageHeader } from "@/components/common"
import { ForwarderRow, SupplierRow } from "@/components/partner-actions"
import { TabLinks } from "@/components/tab-links"
import { Card } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { partnersPage } from "@/server/partners-page"
import { PartnerCreation } from "./add"
const tabs = [{ key: "all" }, { key: "supplier" }, { key: "forwarder" }] as const

// A tab's link, keeping the search.
function tabHref(tab: string, q: string) {
  const params = new URLSearchParams({ ...(tab !== "all" && { type: tab }), ...(q && { q }) })
  return params.size ? `/partners?${params}` : "/partners"
}

export default function PartnersPage({ page }: { page: Awaited<ReturnType<typeof partnersPage>> }) {
  const { editable, tab, q, defaultLeadTimeDays, emptyHint, showType, shown } = page
  const t = useTranslations("partners.page")
  return (
    <>
      <PageHeader title={t("title")}>{editable && <PartnerCreation />}</PageHeader>
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b p-2">
          <TabLinks
            label={t("tabsLabel")}
            tabs={tabs.map((candidate) => ({
              label: t(`tabs.${candidate.key}`),
              href: tabHref(candidate.key, q),
              current: candidate.key === tab
            }))}
          />
          {/* A plain GET form: Enter searches, and the tab stays. Keyed by q so a new header search refills it. */}
          <form action="/partners" className="ms-auto w-full sm:w-64">
            {tab !== "all" && <input type="hidden" name="type" value={tab} />}
            <InputGroup className="h-8">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                key={q}
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("search")}
                aria-label={t("search")}
              />
            </InputGroup>
          </form>
        </div>
        {shown.length ? (
          <div className="@container">
            {/* On a phone each row stacks, as its row says. */}
            <Table framed={false} className="@max-md:block">
              <TableHeader className="@max-md:hidden">
                <TableRow>
                  <TableHead className="ps-4">{t("columns.name")}</TableHead>
                  {showType && <TableHead className="hidden @2xl:table-cell">{t("columns.type")}</TableHead>}
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="hidden @2xl:table-cell">{t("columns.details")}</TableHead>
                  <TableHead className="w-12 pe-4">
                    <span className="sr-only">{t("columns.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="@max-md:block">
                {shown.map((row) =>
                  row.type === "supplier" ? (
                    <SupplierRow
                      key={`s-${row.id}`}
                      supplier={row.supplier}
                      editable={editable}
                      showType={showType}
                      defaultLeadTimeDays={defaultLeadTimeDays}
                    />
                  ) : (
                    <ForwarderRow
                      key={`f-${row.id}`}
                      forwarder={row.forwarder}
                      editable={editable}
                      showType={showType}
                    />
                  )
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title={q ? t("empty.noMatch", { query: q }) : t(`empty.${tab}`)} description={emptyHint} />
        )}
      </Card>
    </>
  )
}
