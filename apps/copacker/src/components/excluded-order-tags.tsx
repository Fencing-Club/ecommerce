"use client"

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
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, useActionMutation } from "@/lib/api"
import { FormError } from "./actions"
import { DetailRow } from "./inventory-locations"
import { TagPicker } from "./tag-picker"

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
    <DetailRow
      title={
        <>
          Excluded order tags
          {copying && (
            <output title="Syncing tags from Shopify" className="inline-flex">
              <Spinner className="size-3.5 text-muted-foreground" />
              <span className="sr-only">Syncing tags from Shopify</span>
            </output>
          )}
        </>
      }
      action={<EditTags tags={tags} suggestions={suggestions} />}
    >
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary">{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p>None</p>
      )}
    </DetailRow>
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
        Edit
      </DialogTrigger>
      {/* Typing goes straight into the tags, not to the first chip's remove button. */}
      <DialogContent initialFocus={input}>
        <form onSubmit={submit} className="flex flex-col gap-4">
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
            <FieldDescription>Use * as a wildcard, like amazon*</FieldDescription>
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
