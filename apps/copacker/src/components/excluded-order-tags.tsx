"use client"

import { Pencil } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { errorMessage, useActionMutation } from "@/lib/api"
import { FormError } from "./actions"
import { TagPicker } from "./tag-picker"
import * as styles from "./inventory-locations.css"

// Shopify order tags whose orders Copacker leaves out, shown in the Shopify connection card like its locations.
export function ExcludedOrderTags({
  tags,
  suggestions,
  copying
}: {
  tags: string[]
  suggestions: string[]
  // Some orders were copied before tags were read; the next Shopify sync reads them.
  copying: boolean
}) {
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h3 className={styles.title}>Excluded order tags</h3>
        <EditTags tags={tags} suggestions={suggestions} />
      </div>
      {tags.length > 0 ? (
        <ul className={styles.tags}>
          {tags.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary">{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.detail}>None</p>
      )}
      {copying && <p className={styles.detail}>Copying tags from Shopify…</p>}
    </section>
  )
}

function EditTags({ tags, suggestions }: { tags: string[]; suggestions: string[] }) {
  const id = useId()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  const [run, saving] = useActionMutation()
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    try {
      await run({ action: "workspace.excludedShopifyTags", data: { tags: value } }).unwrap()
      setOpen(false)
      router.refresh()
    } catch (saveError) {
      setError(errorMessage(saveError, "Couldn’t save the tags. Try again."))
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(tags)
          setError(undefined)
        }
        setOpen(next)
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label="Edit excluded order tags" />}>
        <Pencil data-icon="inline-start" />
        Edit
      </DialogTrigger>
      {/* Typing goes straight into the tags, not to the first chip's remove button. */}
      <DialogContent initialFocus={input}>
        <form onSubmit={submit} className={styles.form}>
          <DialogHeader>
            <DialogTitle>Excluded order tags</DialogTitle>
            <DialogDescription>Shopify orders with these tags aren’t counted.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={id}>Tags</FieldLabel>
            <TagPicker
              id={id}
              value={value}
              onChange={setValue}
              suggestions={suggestions}
              placeholder="Add a tag"
              inputRef={input}
            />
            <FieldDescription>Use * as a wildcard, like amazon*.</FieldDescription>
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={saving.isLoading}>
              {saving.isLoading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
