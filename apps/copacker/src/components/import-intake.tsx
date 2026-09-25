"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { FormError } from "./actions"
import { sx } from "@/styles/sprinkles.css"

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
const statusNames: Record<string, string> = {
  queued: "Waiting to process",
  running: "Reading and matching products",
  review: "Ready for review",
  failed: "Needs attention",
  cancelled: "Cancelled",
  saved: "Saved as draft"
}

export function ImportIntake() {
  const imports = importsApi.useImportsQuery(undefined, { pollingInterval: 5000, skipPollingIfUnfocused: true })
  const [start, upload] = importsApi.useStartImportMutation()
  const [change, changing] = importsApi.useChangeImportMutation()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function update(id: string, method: "POST" | "DELETE") {
    setError(null)
    try {
      await change({ id, method }).unwrap()
      await imports.refetch()
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <Card>
        <CardHeader>
          <CardTitle>Import a purchase order or invoice</CardTitle>
          <CardDescription>
            Upload a PDF of up to 10 MB and 50 pages. Importing prepares a proposal for review. It does not email your
            supplier or create a shipment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className={sx({ display: "flex", flexDirection: "column", gap: 4 })}
            onSubmit={async (event) => {
              event.preventDefault()
              const form = event.currentTarget
              if (!file) {
                return
              }
              setError(null)
              const body = new FormData()
              body.set("file", file)
              try {
                await start(body).unwrap()
                setFile(null)
                form.reset()
                await imports.refetch()
              } catch (failure) {
                setError(errorMessage(failure))
              }
            }}
          >
            <label htmlFor="import-document">Purchase order or invoice PDF</label>
            <Input
              id="import-document"
              type="file"
              accept="application/pdf,.pdf"
              required
              disabled={upload.isLoading}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button type="submit" disabled={!file || upload.isLoading}>
              {upload.isLoading ? "Uploading document…" : "Import document"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {error && <FormError message={error} />}
      <Card>
        <CardHeader>
          <CardTitle>Document imports</CardTitle>
          <CardDescription>
            Imports continue in the background. You can return to this page to check progress.
          </CardDescription>
        </CardHeader>
        <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
          {imports.isError && <FormError message={errorMessage(imports.error)} />}
          {imports.isLoading && <output>Loading imports…</output>}
          {imports.data?.items.length === 0 && <p>No documents imported yet.</p>}
          {imports.data?.items.map((item) => (
            <div key={item.id} className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
              <strong>{item.filename}</strong>
              <output>{statusNames[item.status] ?? item.status}</output>
              <div className={sx({ display: "flex", gap: 2 })}>
                {["review", "saved"].includes(item.status) && (
                  <Link href={`/orders/import/${item.id}`}>
                    {item.status === "saved" ? "Open draft" : "Review proposal"}
                  </Link>
                )}
                <Link href={`/api/imports/${item.id}/source`} target="_blank" rel="noreferrer">
                  View source PDF
                </Link>
                {item.status === "failed" && (
                  <Button variant="outline" disabled={changing.isLoading} onClick={() => update(item.id, "POST")}>
                    Retry import
                  </Button>
                )}
                {!["saved", "cancelled"].includes(item.status) && (
                  <Button variant="outline" disabled={changing.isLoading} onClick={() => update(item.id, "DELETE")}>
                    Cancel import
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
