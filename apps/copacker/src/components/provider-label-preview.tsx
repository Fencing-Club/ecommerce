"use client"

import { Button } from "@buildkitgg/shadcn"
import { Download } from "lucide-react"
import { useEffect, useState } from "react"
import { readPdfPages, type PagePreview } from "@/lib/pdf-preview"

export function ProviderLabelPreview({ file, title }: { file: File; title: string }) {
  const [result, setResult] = useState<{ file: File; url: string; pages: PagePreview[] } | null>(null)
  const [failed, setFailed] = useState<File | null>(null)
  useEffect(() => {
    let active = true
    const url = URL.createObjectURL(file)
    readPdfPages(file, () => active)
      .then((pages) => {
        if (active) {
          setResult({ file, url, pages })
        }
      })
      .catch(() => {
        if (active) {
          setFailed(file)
        }
      })
    return () => {
      active = false
      URL.revokeObjectURL(url)
    }
  }, [file])
  const current = result?.file === file ? result : null
  return (
    <section className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{file.name}</p>
        </div>
        {current ? (
          <Button render={<a aria-label="Download original PDF" href={current.url} download={file.name} />}>
            <Download />
            Download original PDF
          </Button>
        ) : (
          <Button disabled>
            <Download />
            Download original PDF
          </Button>
        )}
      </header>
      <p className="text-sm">
        Print the original PDF at 100% (actual size). Match each label number to the carton label reference.
      </p>
      {failed === file && <p role="alert">This PDF could not be opened.</p>}
      {failed !== file && !current && <output>Preparing preview…</output>}
      {current && (
        <div className="space-y-6 overflow-x-auto rounded-lg bg-muted p-4" dir="ltr">
          {current.pages.map((page, index) => (
            <figure
              key={index}
              className="mx-auto min-w-[480px] max-w-[816px]"
              aria-label={`Original PDF page ${index + 1}`}
            >
              <img
                src={page.image}
                alt={`Page ${index + 1} of ${current.pages.length}`}
                width={page.width}
                height={page.height}
                className="h-auto w-full border"
              />
              <figcaption className="sr-only">{page.text}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}
