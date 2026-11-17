import {
  Button,
  DialogClose,
  DialogContent as ShadcnDialogContent,
  SheetClose,
  SheetContent as ShadcnSheetContent
} from "@buildkitgg/shadcn"
import { XIcon } from "lucide-react"
import { useTranslations } from "use-intl"

// shadcn's DialogContent and SheetContent with their close button labelled in the person's language. shadcn's own
// button is labelled "Close" in English, so these turn it off and draw the same button with the translated label.
export function DialogContent({
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof ShadcnDialogContent>) {
  const t = useTranslations("common.ui")
  return (
    <ShadcnDialogContent showCloseButton={false} {...props}>
      {children}
      {showCloseButton && (
        <DialogClose
          data-slot="dialog-close"
          render={<Button variant="ghost" className="absolute top-4 end-4" size="icon-sm" />}
        >
          <XIcon />
          <span className="sr-only">{t("close")}</span>
        </DialogClose>
      )}
    </ShadcnDialogContent>
  )
}

export function SheetContent({
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof ShadcnSheetContent>) {
  const t = useTranslations("common.ui")
  return (
    <ShadcnSheetContent showCloseButton={false} {...props}>
      {children}
      {showCloseButton && (
        <SheetClose
          data-slot="sheet-close"
          render={<Button variant="ghost" className="absolute top-4 end-4" size="icon-sm" />}
        >
          <XIcon />
          <span className="sr-only">{t("close")}</span>
        </SheetClose>
      )}
    </ShadcnSheetContent>
  )
}
