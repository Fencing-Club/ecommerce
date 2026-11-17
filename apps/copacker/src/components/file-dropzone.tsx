// One file, dropped on the zone or chosen with its browse button. Presentational: it checks the file's type and size,
// hands it to `onFileChange` and shows it as a row with its name, its size and a remove button. The parent keeps the
// file and uploads it or submits it with its form. For example, a CSV import:
//
//   const [file, setFile] = useState<File | null>(null)
//   <FileDropzone label="Catalog CSV" accept={{ "text/csv": [".csv"] }} maxBytes={5 * 1024 * 1024} file={file} onFileChange={setFile} />
//
// UploadCN handles dropping, pasting and validation; files stay local until the parent submits its form.
//
// - accept: the media types and extensions to take, such as `pdfFiles`.
// - maxBytes: the largest file to take. The zone shows it, unless `hint` says something else.
// - label: shown above the zone. Leave it out when a card title already names the file.
// - name: submits the file with a surrounding native form. `id` goes on the zone's button.
// - error, invalid: the parent's own problem with the file, such as a failed upload. `error` shows under the zone.
// - children: shown in the file's row before the remove button, such as upload progress or an Upload button.
// - current: a file already stored, such as a shipment's uploaded invoice. While no file is chosen, the row shows it
//   in place of the zone, with Replace to choose another; a file dropped on it counts too. `href` opens the stored one.
// - ref: the button that chooses the next file, the zone or Replace, such as for a form to focus when it's required.

import { Button, Field, FieldLabel } from "@buildkitgg/shadcn"
import { useMergedRef } from "@mantine/hooks"
import { useDropzone, useFileValidation, usePasteFiles } from "@uploadcn/react"
import { FileText, UploadCloud, Trash2 } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { FieldError } from "@/components/field-error"
import { fileName } from "./common"

// A size as people read it in the language, such as 240 KB or 1.2 MB.
function fileSize(bytes: number, locale: string) {
  return bytes < 1024 * 1024
    ? new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 }).format(
        Math.max(1, bytes / 1024)
      )
    : new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(
        bytes / 1024 / 1024
      )
}

type Accept = Record<string, string[]>

export const pdfFiles: Accept = { "application/pdf": [".pdf"] }

// What the prompt and errors call the file: a PDF or CSV when that's all the zone takes, or just a file. The messages
// choose their words by it.
const typeNames: Record<string, "pdf" | "csv"> = { "application/pdf": "pdf", "text/csv": "csv" }

function typeName(accept: Accept) {
  const names = new Set(Object.keys(accept).map((type) => typeNames[type] ?? "file"))
  return names.size === 1 ? [...names][0]! : "file"
}

// Why a dropped, pasted or chosen file was turned down, in the zone's words.
function rejection(
  t: ReturnType<typeof useTranslations<"common.fileDropzone">>,
  codes: Set<string>,
  type: string,
  size: string
) {
  if (codes.has("file-invalid-type")) {
    return t("wrongType", { type })
  }
  if (codes.has("file-too-large")) {
    return t("tooLarge", { type, size })
  }
  return t("oneFile", { type })
}

// The prompt's "browse", in the link color.
function browse(chunks: React.ReactNode) {
  return <span className="font-medium text-primary">{chunks}</span>
}

export function FileDropzone({
  accept,
  maxBytes,
  file,
  onFileChange,
  current,
  label,
  hint,
  disabled = false,
  id,
  name,
  invalid = false,
  error,
  ref,
  children
}: {
  accept: Accept
  maxBytes: number
  file: File | null
  onFileChange: (file: File | null) => void
  current?: { name: string; size?: number; href?: string }
  label?: React.ReactNode
  hint?: React.ReactNode
  disabled?: boolean
  id?: string
  name?: string
  invalid?: boolean
  error?: string
  ref?: React.Ref<HTMLButtonElement>
  children?: React.ReactNode
}) {
  const t = useTranslations("common.fileDropzone")
  const locale = useLocale()
  const generatedId = useId()
  const zoneId = id ?? `${generatedId}-zone`
  // The zone, or Replace beside a stored file: whichever chooses the next file.
  const zone = useRef<HTMLButtonElement>(null)
  const row = useRef<HTMLDivElement>(null)
  // Where focus goes once a chosen or removed file renders, since the zone and the row replace each other.
  const refocus = useRef<"zone" | "row" | null>(null)
  // Why the last file dropped or chosen was turned down.
  const [problem, setProblem] = useState("")
  const type = typeName(accept)
  const largest = fileSize(maxBytes, locale)
  const message = problem || error
  const flagged = Boolean(message) || invalid
  // The zone's own button and Replace open the picker, so the dropzone itself only takes drops and pastes. A chosen
  // file takes neither until it's removed.
  const inputRef = useRef<HTMLInputElement>(null)
  const pasteTarget = useRef<HTMLDivElement>(null)
  const acceptedTypes = Object.entries(accept).flatMap(([mime, extensions]) => [mime, ...extensions])
  const { validate } = useFileValidation({ accept: acceptedTypes, maxSize: maxBytes, maxFiles: 1 })
  async function choose(files: File[]) {
    if (disabled || file || !files.length) {
      return
    }
    // A multi-file drop must never silently choose one of the documents.
    if (files.length > 1) {
      setProblem(t("oneFile", { type }))
      return
    }
    const { accepted, rejected } = await validate(files)
    const [next] = accepted
    if (next) {
      setProblem("")
      refocus.current = "row"
      onFileChange(next)
    } else if (rejected[0]) {
      setProblem(rejection(t, new Set(rejected[0].issues.map((issue) => issue.code)), type, largest))
    }
  }
  const { handlers, isDragging: isDragActive } = useDropzone({
    accept: acceptedTypes,
    // Let our validation report a multi-file drop instead of the hook discarding it silently.
    multiple: true,
    disabled: disabled || Boolean(file),
    onDrop: choose
  })
  usePasteFiles({ target: pasteTarget, enabled: !disabled && !file, onPaste: choose })
  const open = () => inputRef.current?.click()
  const zoneRef = useMergedRef(zone, ref)
  const replaceRef = useMergedRef(zone, ref)

  // The hidden input holds the file the parent keeps, so a native form submits it and choosing the same file again
  // after removing it still counts as a change.
  useEffect(() => {
    const picker = inputRef.current
    if (picker && picker.files?.[0] !== file) {
      if (file) {
        try {
          const transfer = new DataTransfer()
          transfer.items.add(file)
          picker.files = transfer.files
        } catch {
          // Without DataTransfer, a native form can't submit a dropped file; the parent still has it.
        }
      } else {
        picker.value = ""
      }
    }
    if (refocus.current === "row") {
      row.current?.focus()
    } else if (refocus.current === "zone") {
      zone.current?.focus()
    }
    refocus.current = null
  }, [file, inputRef])

  function remove() {
    setProblem("")
    refocus.current = "zone"
    onFileChange(null)
  }

  return (
    <Field ref={pasteTarget} data-invalid={flagged} data-disabled={disabled}>
      {label && (
        <FieldLabel id={`${zoneId}-label`} htmlFor={zoneId}>
          {label}
        </FieldLabel>
      )}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={acceptedTypes.join(",")}
        disabled={disabled}
        hidden
        onChange={(event) => {
          void choose(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ""
        }}
      />
      {file || current ? (
        // Takes focus when the file is chosen, so keyboard and screen reader users land on it rather than the page. One
        // row for the chosen and the stored file, so focus stays when an uploaded file becomes the stored one.
        <div
          {...handlers}
          ref={row}
          tabIndex={-1}
          data-invalid={flagged || undefined}
          data-dragging={isDragActive || undefined}
          className="flex min-h-12 items-center gap-3 rounded-lg border py-2 pe-2 ps-3 text-foreground transition-colors outline-none data-dragging:border-ring data-dragging:bg-muted/50 data-invalid:border-destructive"
        >
          <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {file ? (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{fileName(file.name, { title: file.name })}</span>
                <span className="text-xs text-muted-foreground">{fileSize(file.size, locale)}</span>
              </span>
              {children}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("remove", { name: file.name })}
                disabled={disabled}
                onClick={remove}
              >
                <Trash2 />
              </Button>
            </>
          ) : (
            current && (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  {current.href ? (
                    <a
                      href={current.href}
                      className="focus-ring truncate rounded-sm text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {fileName(current.name, { title: current.name })}
                    </a>
                  ) : (
                    <span className="truncate text-sm font-medium">
                      {fileName(current.name, { title: current.name })}
                    </span>
                  )}
                  {current.size !== undefined && (
                    <span className="text-xs text-muted-foreground">{fileSize(current.size, locale)}</span>
                  )}
                </span>
                <Button
                  ref={replaceRef}
                  type="button"
                  id={zoneId}
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  aria-label={t("replaceFile", { name: current.name })}
                  aria-describedby={message ? `${zoneId}-error` : undefined}
                  onClick={open}
                >
                  {t("replace")}
                </Button>
              </>
            )
          )}
        </div>
      ) : (
        // A button rather than the input itself, so the zone takes focus, clicks and drops alike.
        <button
          {...handlers}
          ref={zoneRef}
          type="button"
          id={zoneId}
          disabled={disabled}
          aria-labelledby={label ? `${zoneId}-label ${zoneId}-prompt` : undefined}
          aria-describedby={
            [label ? `${zoneId}-hint` : "", message ? `${zoneId}-error` : ""].filter(Boolean).join(" ") || undefined
          }
          data-dragging={isDragActive || undefined}
          data-invalid={flagged || undefined}
          onClick={open}
          className="focus-ring flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors *:pointer-events-none hover:bg-muted/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent data-dragging:border-ring data-dragging:bg-muted/50 data-invalid:border-destructive data-invalid:focus-visible:ring-destructive/20"
        >
          <UploadCloud aria-hidden className="mb-1 size-5 text-muted-foreground" />
          <span id={`${zoneId}-prompt`} className="text-sm">
            {t.rich("prompt", { type, browse })}
          </span>
          <span id={`${zoneId}-hint`} className="text-xs text-muted-foreground">
            {hint ?? t("upTo", { size: largest })}
          </span>
        </button>
      )}
      <FieldError id={`${zoneId}-error`}>{message}</FieldError>
    </Field>
  )
}
