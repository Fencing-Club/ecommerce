"use client"

// One file, dropped on the zone or chosen with its browse button. Presentational: it checks the file's type and size,
// hands it to `onFileChange` and shows it as a row with its name, its size and a remove button. The parent keeps the
// file and uploads it or submits it with its form. For example, a CSV import:
//
//   const [file, setFile] = useState<File | null>(null)
//   <FileDropzone label="Catalog CSV" accept=".csv,text/csv" maxBytes={5 * 1024 * 1024} file={file} onFileChange={setFile} />
//
// - accept: the types to take, as an input's accept attribute lists them. Dropped files are checked against it too.
// - maxBytes: the largest file to take. The zone shows it, unless `hint` says something else.
// - label: shown above the zone. Leave it out when a card title already names the file.
// - name: submits the file with a surrounding native form. `id` goes on the zone's button.
// - error, invalid: the parent's own problem with the file, such as a failed upload. `error` shows under the zone.
// - children: shown in the file's row before the remove button, such as upload progress or an Upload button.

import { FileText, UploadCloud, X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"

const kilobytes = new Intl.NumberFormat("en-US", { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 })
const megabytes = new Intl.NumberFormat("en-US", { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })

// A size as people read it, such as 240 KB or 1.2 MB.
function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? kilobytes.format(Math.max(1, bytes / 1024)) : megabytes.format(bytes / 1024 / 1024)
}

// What the prompt and errors call the file: PDF or CSV when that's all the zone takes, or just "file".
const typeNames: Record<string, string> = { ".pdf": "PDF", "application/pdf": "PDF", ".csv": "CSV", "text/csv": "CSV" }

function typeName(types: string[]) {
  const names = new Set(types.map((type) => typeNames[type] ?? "file"))
  return names.size === 1 ? [...names][0]! : "file"
}

// Whether a file is one of the accepted types: by extension (.pdf), by media type (application/pdf) or by a media
// type's family (image/*), as the browser's own picker matches them.
function accepts(file: File, types: string[]) {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return (
    types.length === 0 ||
    types.some((accepted) => {
      if (accepted.startsWith(".")) {
        return name.endsWith(accepted)
      }
      return accepted.endsWith("/*") ? type.startsWith(accepted.slice(0, -1)) : type === accepted
    })
  )
}

export function FileDropzone({
  accept,
  maxBytes,
  file,
  onFileChange,
  label,
  hint,
  disabled = false,
  id,
  name,
  invalid = false,
  error,
  children
}: {
  accept: string
  maxBytes: number
  file: File | null
  onFileChange: (file: File | null) => void
  label?: React.ReactNode
  hint?: React.ReactNode
  disabled?: boolean
  id?: string
  name?: string
  invalid?: boolean
  error?: string
  children?: React.ReactNode
}) {
  const generatedId = useId()
  const zoneId = id ?? `${generatedId}-zone`
  const input = useRef<HTMLInputElement>(null)
  const zone = useRef<HTMLButtonElement>(null)
  const row = useRef<HTMLDivElement>(null)
  // Where focus goes once a chosen or removed file renders, since the zone and the row replace each other.
  const refocus = useRef<"zone" | "row" | null>(null)
  const [dragging, setDragging] = useState(false)
  // Why the last file dropped or chosen was turned down.
  const [problem, setProblem] = useState("")
  const types = accept
    .split(",")
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean)
  const noun = typeName(types)
  const message = problem || error
  const flagged = Boolean(message) || invalid

  // The hidden input holds the file the parent keeps, so a native form submits it and choosing the same file again
  // after removing it still counts as a change.
  useEffect(() => {
    const picker = input.current
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
  }, [file])

  function choose(files: FileList | null) {
    const next = files?.[0]
    if (!next) {
      return
    }
    let issue = ""
    if (!accepts(next, types)) {
      issue = noun === "file" ? "Choose a supported file" : `Choose a ${noun}`
    } else if (next.size > maxBytes) {
      issue = `Choose a ${noun} up to ${fileSize(maxBytes)}`
    }
    setProblem(issue)
    if (issue) {
      if (input.current) {
        input.current.value = ""
      }
      return
    }
    refocus.current = "row"
    onFileChange(next)
  }

  function remove() {
    setProblem("")
    refocus.current = "zone"
    onFileChange(null)
  }

  function over(event: React.DragEvent) {
    event.preventDefault()
    event.dataTransfer.dropEffect = disabled ? "none" : "copy"
    setDragging(!disabled)
  }

  function drop(event: React.DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!disabled) {
      choose(event.dataTransfer.files)
    }
  }

  return (
    <Field data-invalid={flagged} data-disabled={disabled}>
      {label && (
        <FieldLabel id={`${zoneId}-label`} htmlFor={zoneId}>
          {label}
        </FieldLabel>
      )}
      <input
        ref={input}
        type="file"
        name={name}
        accept={accept}
        hidden
        onChange={(event) => choose(event.target.files)}
      />
      {file ? (
        // Takes focus when the file is chosen, so keyboard and screen reader users land on it rather than the page.
        <div
          ref={row}
          tabIndex={-1}
          data-invalid={flagged || undefined}
          className="flex min-h-12 items-center gap-3 rounded-lg border py-2 pr-2 pl-3 text-foreground outline-none data-invalid:border-destructive"
        >
          <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </span>
            <span className="text-xs text-muted-foreground">{fileSize(file.size)}</span>
          </span>
          {children}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${file.name}`}
            disabled={disabled}
            onClick={remove}
          >
            <X />
          </Button>
        </div>
      ) : (
        // A button rather than the input itself, so the zone takes focus, clicks and drops alike.
        <button
          ref={zone}
          type="button"
          id={zoneId}
          disabled={disabled}
          aria-labelledby={label ? `${zoneId}-label ${zoneId}-prompt` : undefined}
          aria-describedby={
            [label ? `${zoneId}-hint` : "", message ? `${zoneId}-error` : ""].filter(Boolean).join(" ") || undefined
          }
          data-dragging={dragging || undefined}
          data-invalid={flagged || undefined}
          onClick={() => input.current?.click()}
          onDragEnter={over}
          onDragOver={over}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors outline-none *:pointer-events-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent data-dragging:border-ring data-dragging:bg-muted/50 data-invalid:border-destructive data-invalid:focus-visible:ring-destructive/20"
        >
          <UploadCloud aria-hidden className="mb-1 size-5 text-muted-foreground" />
          <span id={`${zoneId}-prompt`} className="text-sm">
            Drop a {noun} or <span className="font-medium text-primary">browse</span>
          </span>
          <span id={`${zoneId}-hint`} className="text-xs text-muted-foreground">
            {hint ?? `Up to ${fileSize(maxBytes)}`}
          </span>
        </button>
      )}
      <FieldError id={`${zoneId}-error`}>{message}</FieldError>
    </Field>
  )
}
