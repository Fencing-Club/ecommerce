"use client"

import { Ellipsis } from "lucide-react"
import { useLocale, useTimeZone, useTranslations } from "next-intl"
import Link from "next/link"
import { useState } from "react"
import { LinkRow } from "@/components/link-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorMessage } from "@/hooks/use-error-text"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { FormError, SubmitButton } from "./actions"
import { fileName, StatusBadge, type StatusTone } from "./common"
import { FileDropzone, pdfFiles } from "./file-dropzone"

type ImportSummary = { id: string; filename: string; status: string; revision: number; createdAt: string }
const importsApi = api.injectEndpoints({
  endpoints: (build) => ({
    imports: build.query<{ items: ImportSummary[] }, void>({ query: () => "imports", keepUnusedDataFor: 0 }),
    startImport: build.mutation<{ id: string }, FormData>({
      query: (body) => ({ url: "imports", method: "POST", body })
    }),
    changeImport: build.mutation<unknown, { id: string; method: "POST" | "DELETE" }>({
      query: ({ id, method }) => ({ url: `imports/${id}`, method })
    })
  })
})

// The imports route takes one PDF of up to 10 MB and 50 pages.
const maxBytes = 10 * 1024 * 1024

// Each import status's tone; its label is under orders.intake.statuses.
const statuses = {
  queued: "info",
  running: "info",
  review: "warning",
  failed: "destructive",
  cancelled: "neutral",
  saved: "success"
} satisfies Record<string, StatusTone>

function isKnownStatus(status: string): status is keyof typeof statuses {
  return Object.hasOwn(statuses, status)
}

// The table's first and last columns line up with the card's header.
const edgeTable = "[&_td:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:first-child]:ps-4 [&_th:last-child]:pe-4"

export function ImportIntake() {
  const t = useTranslations("orders.intake")
  const errorMessage = useErrorMessage()
  const locale = useLocale()
  const timeZone = useTimeZone()
  const imports = importsApi.useImportsQuery(undefined, { pollingInterval: 5000, skipPollingIfUnfocused: true })
  const [start, upload] = importsApi.useStartImportMutation()
  const [change, changing] = importsApi.useChangeImportMutation()
  const [file, setFile] = useState<File | null>(null)
  // Why the last import didn't start, and why the last retry or cancel failed.
  const [error, setError] = useState<string | null>(null)
  const [changeError, setChangeError] = useState<string | null>(null)
  async function update(id: string, method: "POST" | "DELETE") {
    setChangeError(null)
    try {
      await change({ id, method }).unwrap()
      await imports.refetch()
    } catch (failure) {
      setChangeError(errorMessage(failure))
    }
  }
  const items = imports.data?.items ?? []
  const listError = imports.isError ? errorMessage(imports.error) : changeError
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col items-start gap-4"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!file) {
                return
              }
              setError(null)
              const body = new FormData()
              body.set("file", file)
              try {
                await start(body).unwrap()
                setFile(null)
                await imports.refetch()
              } catch (failure) {
                setError(errorMessage(failure))
              }
            }}
          >
            <FileDropzone
              accept={pdfFiles}
              maxBytes={maxBytes}
              hint={t("hint")}
              file={file}
              onFileChange={(next) => {
                setFile(next)
                setError(null)
              }}
              disabled={upload.isLoading}
              error={error ?? undefined}
            />
            <SubmitButton type="submit" pending={upload.isLoading} disabled={!file}>
              {t("import")}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
      <Card className="@container gap-0 overflow-hidden py-0">
        <CardHeader className="border-b p-4">
          <CardTitle>{t("imports")}</CardTitle>
        </CardHeader>
        {listError && (
          <div className="border-b p-4">
            <FormError message={listError} />
          </div>
        )}
        {imports.isLoading && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("loading")}</p>}
        {imports.isSuccess && !items.length && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
        )}
        {items.length > 0 && (
          <Table framed={false} className={edgeTable}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.file")}</TableHead>
                <TableHead className="hidden @xl:table-cell">{t("columns.uploaded")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("columns.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const status: { label: string; tone: StatusTone } = isKnownStatus(item.status)
                  ? { label: t(`statuses.${item.status}`), tone: statuses[item.status] }
                  : { label: item.status, tone: "neutral" }
                // A review opens the review page; a saved import, its draft purchase order.
                const href = ["review", "saved"].includes(item.status) ? `/orders/import/${item.id}` : null
                const cells = (
                  <>
                    <TableCell className="w-full max-w-0">
                      {href ? (
                        <Link href={href} className="block truncate font-medium hover:underline">
                          {fileName(item.filename, { title: item.filename })}
                        </Link>
                      ) : (
                        <span className="block truncate font-medium">
                          {fileName(item.filename, { title: item.filename })}
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground @xl:hidden">
                        {formatDate(item.createdAt, locale, timeZone)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground @xl:table-cell">
                      {formatDate(item.createdAt, locale, timeZone)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {href && (
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={<Link href={href} />}
                            className="hidden @md:inline-flex"
                          >
                            {item.status === "saved" ? t("openDraft") : t("review")}
                          </Button>
                        )}
                        {/* On a narrow card, Retry is only in the row's menu, so the file's name keeps its room. */}
                        {item.status === "failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={changing.isLoading}
                            onClick={() => update(item.id, "POST")}
                            className="hidden @md:inline-flex"
                          >
                            {t("retry")}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("moreFor", { file: item.filename })}
                              />
                            }
                          >
                            <Ellipsis />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              render={
                                <a
                                  href={`/api/imports/${item.id}/source`}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={t("viewPdf")}
                                />
                              }
                            >
                              {t("viewPdf")}
                            </DropdownMenuItem>
                            {item.status === "failed" && (
                              <DropdownMenuItem disabled={changing.isLoading} onClick={() => update(item.id, "POST")}>
                                {t("retry")}
                              </DropdownMenuItem>
                            )}
                            {!["saved", "cancelled"].includes(item.status) && (
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={changing.isLoading}
                                onClick={() => update(item.id, "DELETE")}
                              >
                                {t("cancelImport")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </>
                )
                return href ? (
                  <LinkRow key={item.id} href={href}>
                    {cells}
                  </LinkRow>
                ) : (
                  <TableRow key={item.id}>{cells}</TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}
