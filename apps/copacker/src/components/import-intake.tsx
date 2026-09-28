"use client"

import { Ellipsis, FileText } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { api, errorMessage } from "@/lib/api"
import { FormError, SubmitButton } from "./actions"
import { StatusBadge, type StatusTone } from "./common"
import { FileDropzone } from "./file-dropzone"

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

const statuses: Record<string, { label: string; tone: StatusTone }> = {
  queued: { label: "Waiting", tone: "info" },
  running: { label: "Reading", tone: "info" },
  review: { label: "Ready for review", tone: "warning" },
  failed: { label: "Failed", tone: "destructive" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  saved: { label: "Saved as draft", tone: "success" }
}

export function ImportIntake() {
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
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Purchase order or invoice</CardTitle>
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
              accept="application/pdf,.pdf"
              maxBytes={maxBytes}
              hint="Up to 10 MB and 50 pages"
              file={file}
              onFileChange={(next) => {
                setFile(next)
                setError(null)
              }}
              disabled={upload.isLoading}
              error={error ?? undefined}
            />
            <SubmitButton type="submit" pending={upload.isLoading} disabled={!file}>
              Import
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Imports</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {imports.isError && <FormError message={errorMessage(imports.error)} />}
          <FormError message={changeError ?? undefined} />
          {imports.isLoading && <p className="text-sm text-muted-foreground">Loading imports…</p>}
          {imports.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No imports yet</p>}
          {Boolean(imports.data?.items.length) && (
            <ul className="divide-y">
              {imports.data?.items.map((item) => {
                const status: { label: string; tone: StatusTone } = statuses[item.status] ?? {
                  label: item.status,
                  tone: "neutral"
                }
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <span className="max-w-full truncate text-sm font-medium sm:flex-1" title={item.filename}>
                        {item.filename}
                      </span>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </div>
                    {["review", "saved"].includes(item.status) && (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/orders/import/${item.id}`} />}
                      >
                        {item.status === "saved" ? "Open draft" : "Review"}
                      </Button>
                    )}
                    {item.status === "failed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={changing.isLoading}
                        onClick={() => update(item.id, "POST")}
                      >
                        Retry
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${item.filename}`} />}
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
                              aria-label="View PDF"
                            />
                          }
                        >
                          View PDF
                        </DropdownMenuItem>
                        {!["saved", "cancelled"].includes(item.status) && (
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={changing.isLoading}
                            onClick={() => update(item.id, "DELETE")}
                          >
                            Cancel import
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
