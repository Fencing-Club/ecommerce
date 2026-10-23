import { Badge, Button, DialogTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { Tags } from "lucide-react"
import { useRef } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { touchButton } from "@/lib/controls"
import { cn } from "@/lib/utils"
import { FormField, useFormField } from "./form-controls"
import { FormDialog } from "./form-dialog"
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

const tagsSchema = z.object({ tags: z.array(z.string()) })

function EditTags({ tags, suggestions }: { tags: string[]; suggestions: string[] }) {
  const t = useTranslations("settings.excludedTags")
  const input = useRef<HTMLInputElement>(null)
  return (
    <FormDialog
      trigger={
        <DialogTrigger
          render={<Button variant="outline" className={cn(touchButton, "shrink-0")} aria-label={t("editLabel")} />}
        >
          {t("edit")}
        </DialogTrigger>
      }
      title={t("title")}
      description={t("description")}
      submitLabel={t("save")}
      // Typing goes straight into the tags, not to the first chip's remove button.
      initialFocus={input}
      form={{
        schema: tagsSchema,
        action: "workspace.excludedShopifyTags",
        defaultValues: { tags },
        fallback: t("saveFailed")
      }}
    >
      <TagsField suggestions={suggestions} inputRef={input} />
    </FormDialog>
  )
}

function TagsField({
  suggestions,
  inputRef
}: {
  suggestions: string[]
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const t = useTranslations("settings.excludedTags")
  const {
    field: { value, onChange },
    fieldProps
  } = useFormField("tags", { description: t("wildcard") })
  return (
    <FormField {...fieldProps} label={t("tags")}>
      <TagPicker
        id={fieldProps.id}
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
        suggestions={suggestions}
        placeholder={t("addTag")}
        inputRef={inputRef}
      />
    </FormField>
  )
}
