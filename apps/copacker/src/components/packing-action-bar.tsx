import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { Ellipsis } from "lucide-react"
import { useTranslations } from "use-intl"
import { SubmitButton } from "@/components/form-feedback"
import type { PackingWork } from "@/hooks/use-packing-draft"

// Packing's actions: Finish packing, or Save draft while units are left to pack, which submits the packing form, and
// Save draft under the Actions menu. They sit in the page header beside the title; on a phone the button moves below
// the cartons, so the form shows the bar twice, once for each place, and both follow the same state.
export function PackingActionBar({
  formId,
  placement,
  finishing,
  ready,
  canSave,
  working,
  onSaveDraft
}: {
  // The packing form the button submits.
  formId: string
  placement: "header" | "footer"
  // Every unit is packed, so the button finishes packing rather than saving the draft.
  finishing: boolean
  // Every carton, and every pallet when packed on them, is complete, with nothing for the checks to point out.
  ready: boolean
  // Whether the draft can save, as it can't past the carton limit.
  canSave: boolean
  working: PackingWork | null
  onSaveDraft: () => void
}) {
  const t = useTranslations("orders.packing")
  const columns = useTranslations("orders.detail.columns")
  // A draft saves as it is; finishing takes a packing that's ready.
  const disabled = working !== null || !canSave || (finishing && !ready)
  const button = (
    <SubmitButton
      className={placement === "header" ? "max-sm:hidden" : "max-sm:flex-1"}
      type="submit"
      form={formId}
      pending={working === (finishing ? "submit" : "save")}
      disabled={disabled}
    >
      {t(finishing ? "finishPacking" : "saveDraft")}
    </SubmitButton>
  )
  if (placement === "footer") {
    return <div className="flex flex-wrap gap-2 max-sm:w-full sm:hidden">{button}</div>
  }
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={working !== null}
          render={<Button type="button" variant="outline" size="icon" aria-label={columns("actions")} />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!canSave} onClick={onSaveDraft}>
            {t("saveDraft")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {button}
    </div>
  )
}
