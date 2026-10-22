import { Tags } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useTranslations } from "use-intl"
import { FormError } from "@/components/form-feedback"
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
import { useAction } from "@/hooks/use-action"
import { DetailRow } from "./inventory-locations"
import { TagPicker } from "./tag-picker"

// Shopify order tags whose orders Copacker leaves out, shown in the Shopify connection card like its locations.
export function ExcludedOrderTags({ tags, suggestions }: { tags: string[]; suggestions: string[] }) {
  const t = useTranslations("settings.excludedTags")
  return (
    <DetailRow icon={<Tags />} title={t("title")} action={<EditTags tags={tags} suggestions={suggestions} />}>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary">{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("none")}</p>
      )}
    </DetailRow>
  )
}

function EditTags({ tags, suggestions }: { tags: string[]; suggestions: string[] }) {
  const t = useTranslations("settings.excludedTags")
  const id = useId()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const save = useAction("workspace.excludedShopifyTags", {
    fallback: t("saveFailed"),
    onSuccess: () => setOpen(false)
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(tags)
          save.reset()
        }
        setOpen(next)
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" className="h-11 shrink-0 sm:h-[34px]" aria-label={t("editLabel")} />}
      >
        {t("edit")}
      </DialogTrigger>
      {/* Typing goes straight into the tags, not to the first chip's remove button. */}
      <DialogContent initialFocus={input}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save.run({ tags: value })
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={id}>{t("tags")}</FieldLabel>
            <TagPicker
              id={id}
              value={value}
              onChange={setValue}
              suggestions={suggestions}
              placeholder={t("addTag")}
              inputRef={input}
            />
            <FieldDescription>{t("wildcard")}</FieldDescription>
          </Field>
          <FormError message={save.error} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="submit" disabled={save.pending}>
              {save.pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
