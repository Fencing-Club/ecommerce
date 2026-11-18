import { Button } from "@buildkitgg/shadcn"
import { FileCheck, FileSpreadsheet, FileText, LinkIcon, Store, Tags } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { fileName } from "@/components/common"
import { BookingDialog, type BookingDialogState, BookingStep, DoneAction } from "./booking-dialog"
import { DownloadAction, FileRow, LabelsRow, OpenAction, RowStatus } from "./file-row"
import { type Issue, IssueSummary, type IssueSummaryProps, IssuesView } from "./issues"
import { type PickerShipment, ShipmentPicker } from "./shipment-picker"
import { TemplateSlot, type TemplateSlotState } from "./template-slot"

export type AglFile = { name: string; href: string }

// A problem the template check found, worded here: a carton holding two packing groups, a carton without its gross
// weight, or a product whose count differs from the one Amazon expects.
export type AglTemplateIssue =
  | { kind: "mixedGroups"; carton: number; groups: [string, string] }
  | { kind: "noWeight"; carton: number }
  | { kind: "unitsDiffer"; product: string; expected: number; packed: number }

// A product without an Amazon SKU, which the inventory file can't list.
export type AglMissingSku = { product: string; supplierSku: string }

export type AglShipment = PickerShipment & {
  // When it differs from the packing: each product whose count differs, in Amazon and in the packing.
  differences?: Array<{ product: string; amazon: number; packing: number }>
}

// The box-content template Amazon gives back: not there yet, being filled (`progress` is a percentage), filled into the
// file to upload, or the problems that stopped it.
export type AglTemplate =
  | { status: "empty" }
  | { status: "filling"; progress: number }
  | { status: "filled"; file: AglFile }
  | { status: "issues"; issues: AglTemplateIssue[] }

export type AglLabels = { status: "pending" } | { status: "ready"; href: string; count: number } | { status: "failed" }

// Everything the AGL booking shows, as the server knows it.
export type AglBooking = {
  // Cartons book in three steps, the first ending with Amazon's box-content template. Case packs of one SKU carry
  // their own carton details, and AWD books by case pack from a packing list, so both take two.
  kind: "cartons" | "casePacks" | "awd"
  // The inventory file, or AWD's packing list.
  file: AglFile
  // Cartons, or case packs.
  cartons: number
  units: number
  sellerCentralUrl: string
  // Products the inventory file can't list yet. While there are any, nothing else in the booking can happen.
  missingSkus: AglMissingSku[]
  template: AglTemplate
  // Amazon's shipments, newest first.
  shipments: AglShipment[]
  linked: { shipment: AglShipment; labels: AglLabels; customsUrl: string } | null
}

export type AglStep = "start" | "book" | "link"

// What Check again checks: the products' SKUs, the template, or the chosen shipment against the packing.
export type AglCheck = "skus" | "template" | "match"

type Words = ReturnType<typeof useTranslations<"booking">>

// Booking Amazon Global Logistics, which the buyer books in Seller Central: Copacker makes the inventory file, fills
// Amazon's box-content template, finds the booked shipment and fetches its labels. It reopens where the buyer left off
// (`initialStep`); missing SKUs and a linked shipment show whatever the step. Every button does one thing, through the
// callbacks.
export function AglBookingDialog({
  booking,
  initialStep = "start",
  onTemplate,
  onFix,
  onCheckAgain,
  onRefreshShipments,
  onLink,
  onRetryLabels,
  ...dialog
}: BookingDialogState & {
  booking: AglBooking
  initialStep?: AglStep
  onTemplate: (file: File) => void
  onFix: (issue: AglTemplateIssue | AglMissingSku) => void
  onCheckAgain: (check: AglCheck) => void
  onRefreshShipments: () => void
  onLink: (shipmentId: string) => void
  onRetryLabels: () => void
}) {
  const t = useTranslations("booking")
  const [chosenStep, setStep] = useState<AglStep>(initialStep)
  // The IssuesView, open over the step its problems belong to.
  const [reviewing, setReviewing] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const { template, kind } = booking
  const total = kind === "cartons" ? 3 : 2
  // The book step is for cartons, and needs their filled template.
  const step = chosenStep === "book" && template.status !== "filled" ? "start" : chosenStep
  // A shipment that matches the packing is chosen until the buyer chooses another, even one that appears on a refresh.
  const shipmentId = chosen ?? booking.shipments.find((shipment) => shipment.match === "matches")?.id ?? null
  const shipment = booking.shipments.find((candidate) => candidate.id === shipmentId)
  const differences = shipment?.match === "differs" ? (shipment.differences ?? []) : []
  const templateIssues = template.status === "issues" ? template.issues : []
  const back = (to: AglStep) => (
    <Button variant="outline" onClick={() => setStep(to)}>
      {t("back")}
    </Button>
  )

  if (booking.missingSkus.length) {
    return (
      <BookingDialog {...dialog} screen="missingSkus">
        <IssuesView
          title={t("agl.missingSkus.title", { count: booking.missingSkus.length })}
          description={t("agl.missingSkus.description")}
          issues={booking.missingSkus.map((missing) => ({
            id: missing.supplierSku,
            where: missing.product,
            what: t("agl.issues.supplierSku", { sku: missing.supplierSku }),
            fix: { label: t("agl.issues.addSku"), onFix: () => onFix(missing) }
          }))}
          step={{ current: 1, total }}
          onCheckAgain={() => onCheckAgain("skus")}
        />
      </BookingDialog>
    )
  }

  if (booking.linked) {
    return (
      <BookingDialog {...dialog} screen="done">
        <Done linked={booking.linked} onRetryLabels={onRetryLabels} />
      </BookingDialog>
    )
  }

  if (step === "link" && reviewing && differences.length) {
    return (
      <BookingDialog {...dialog} screen="mismatch">
        <IssuesView
          title={t("agl.mismatch.title", { count: differences.length })}
          description={t("agl.mismatch.description")}
          issues={differences.map((difference) => ({
            id: difference.product,
            where: difference.product,
            what: t("agl.mismatch.counts", { amazon: difference.amazon, packing: difference.packing })
          }))}
          step={{ current: total, total }}
          onBack={() => setReviewing(false)}
          onCheckAgain={() => onCheckAgain("match")}
        />
      </BookingDialog>
    )
  }

  if (step === "link") {
    return (
      <BookingDialog {...dialog} screen="link">
        <BookingStep
          title={t("agl.link.title")}
          description={t("agl.link.description")}
          step={{ current: total, total }}
          actions={
            <>
              {back(kind === "cartons" ? "book" : "start")}
              <Button disabled={!shipment || differences.length > 0} onClick={() => shipment && onLink(shipment.id)}>
                <LinkIcon data-icon="inline-start" aria-hidden />
                {t("agl.link.submit")}
              </Button>
            </>
          }
        >
          <ShipmentPicker
            shipments={booking.shipments}
            value={shipmentId}
            onValueChange={setChosen}
            onRefresh={onRefreshShipments}
            issue={
              differences.length
                ? {
                    title: t("agl.mismatch.summary", { count: differences.length }),
                    description: t("agl.mismatch.summaryDescription", { count: differences.length }),
                    action: t("review"),
                    onAction: () => setReviewing(true)
                  }
                : undefined
            }
          />
        </BookingStep>
      </BookingDialog>
    )
  }

  if (step === "book" && template.status === "filled") {
    return (
      <BookingDialog {...dialog} screen="book">
        <BookingStep
          title={t("agl.book.title")}
          description={t("agl.book.description")}
          step={{ current: 2, total }}
          actions={
            <>
              {back("start")}
              <Button onClick={() => setStep("link")}>{t("continue")}</Button>
            </>
          }
        >
          <FileRow
            icon={<FileCheck className="text-green-800 dark:text-green-400" aria-hidden />}
            title={fileName(template.file.name, { title: template.file.name })}
            description={t("agl.book.filledFor", { cartons: booking.cartons, units: booking.units })}
          >
            <DownloadAction href={template.file.href} />
          </FileRow>
          <FileRow icon={<Store aria-hidden />} title={t("sellerCentral")} description={t("agl.book.sellerCentral")}>
            <OpenAction href={booking.sellerCentralUrl} />
          </FileRow>
        </BookingStep>
      </BookingDialog>
    )
  }

  if (kind !== "cartons") {
    // Case packs and AWD book straight away: the file goes to Seller Central as it is.
    const awd = kind === "awd"
    return (
      <BookingDialog {...dialog} screen="start">
        <BookingStep
          title={awd ? t("agl.awd.title") : t("agl.book.title")}
          description={awd ? t("agl.awd.description") : t("agl.casePacks.description")}
          step={{ current: 1, total }}
          actions={<Button onClick={() => setStep("link")}>{t("continue")}</Button>}
        >
          <FileRow
            icon={awd ? <FileText aria-hidden /> : <FileSpreadsheet aria-hidden />}
            title={fileName(booking.file.name, { title: booking.file.name })}
            description={
              awd
                ? t("agl.awd.counts", { packs: booking.cartons, units: booking.units })
                : t("agl.casePacks.counts", { packs: booking.cartons, units: booking.units })
            }
          >
            <DownloadAction href={booking.file.href} />
          </FileRow>
          <FileRow
            icon={<Store aria-hidden />}
            title={t("sellerCentral")}
            description={awd ? t("agl.awd.sellerCentral") : t("agl.casePacks.sellerCentral")}
          >
            <OpenAction href={booking.sellerCentralUrl} />
          </FileRow>
        </BookingStep>
      </BookingDialog>
    )
  }

  if (reviewing && templateIssues.length) {
    return (
      <BookingDialog {...dialog} screen="templateIssues">
        <IssuesView
          title={t("agl.templateIssues.title", { count: templateIssues.length })}
          description={t("agl.templateIssues.description")}
          issues={templateIssues.map((issue) => templateIssue(t, issue, () => onFix(issue)))}
          step={{ current: 1, total }}
          onBack={() => setReviewing(false)}
          onCheckAgain={() => onCheckAgain("template")}
        />
      </BookingDialog>
    )
  }

  return (
    <BookingDialog {...dialog} screen="start">
      <BookingStep
        title={t("agl.start.title")}
        description={t("agl.start.description")}
        step={{ current: 1, total }}
        actions={
          <Button disabled={template.status !== "filled"} onClick={() => setStep("book")}>
            {t("continue")}
          </Button>
        }
      >
        <FileRow
          icon={<FileSpreadsheet aria-hidden />}
          title={fileName(booking.file.name, { title: booking.file.name })}
          description={t("agl.start.counts", { cartons: booking.cartons, units: booking.units })}
        >
          <DownloadAction href={booking.file.href} />
        </FileRow>
        <FileRow icon={<Store aria-hidden />} title={t("sellerCentral")} description={t("agl.start.sellerCentral")}>
          <OpenAction href={booking.sellerCentralUrl} />
        </FileRow>
        <TemplateSlot state={slotState(t, booking, () => setReviewing(true), onFix)} onFile={onTemplate} />
      </BookingStep>
    </BookingDialog>
  )
}

// The template slot's state: one problem shows with its own fix, several as a count that opens them all.
function slotState(
  t: Words,
  booking: AglBooking,
  onReview: () => void,
  onFix: (issue: AglTemplateIssue) => void
): TemplateSlotState {
  const { template } = booking
  switch (template.status) {
    case "empty":
      return { status: "empty" }
    case "filling":
      return { status: "filling", progress: template.progress, units: booking.units }
    case "filled":
      return { status: "filled", cartons: booking.cartons, units: booking.units }
    case "issues": {
      const [only] = template.issues
      if (only && template.issues.length === 1) {
        return { status: "issue", issue: { ...aloneIssue(t, only), onAction: () => onFix(only) } }
      }
      return {
        status: "issue",
        issue: {
          title: t("agl.templateIssues.summary", { count: template.issues.length }),
          description: t("agl.templateIssues.summaryDescription"),
          action: t("review"),
          onAction: onReview
        }
      }
    }
  }
}

// A template problem as a row of the IssuesView.
function templateIssue(t: Words, issue: AglTemplateIssue, onFix: () => void): Issue {
  switch (issue.kind) {
    case "mixedGroups":
      return {
        id: `carton-${issue.carton}-groups`,
        where: t("agl.issues.carton", { carton: issue.carton }),
        what: t("agl.issues.mixedGroups", { first: issue.groups[0], second: issue.groups[1] }),
        fix: { label: t("agl.issues.editCarton"), onFix }
      }
    case "noWeight":
      return {
        id: `carton-${issue.carton}-weight`,
        where: t("agl.issues.carton", { carton: issue.carton }),
        what: t("agl.issues.noWeight"),
        fix: { label: t("agl.issues.editCarton"), onFix }
      }
    case "unitsDiffer":
      return {
        id: `units-${issue.product}`,
        where: issue.product,
        what: t("agl.issues.unitsDiffer", { expected: issue.expected, packed: issue.packed }),
        fix: { label: t("agl.issues.editPacking"), onFix }
      }
  }
}

// A template problem on its own, where the template goes: a headline, a line, and its fix.
function aloneIssue(t: Words, issue: AglTemplateIssue): Omit<IssueSummaryProps, "onAction"> {
  switch (issue.kind) {
    case "mixedGroups":
      return {
        title: t("agl.issues.mixedGroupsTitle", { carton: issue.carton }),
        description: t("agl.issues.mixedGroupsDescription", { first: issue.groups[0], second: issue.groups[1] }),
        action: t("agl.issues.editThisCarton", { carton: issue.carton })
      }
    case "noWeight":
      return {
        title: t("agl.issues.noWeightTitle", { carton: issue.carton }),
        description: t("agl.issues.noWeightDescription"),
        action: t("agl.issues.editThisCarton", { carton: issue.carton })
      }
    case "unitsDiffer":
      return {
        title: t("agl.issues.unitsDifferTitle", { product: issue.product }),
        description: t("agl.issues.unitsDiffer", { expected: issue.expected, packed: issue.packed }),
        action: t("agl.issues.editPacking")
      }
  }
}

// The booked shipment, linked: its labels to download, or the problem getting them, and the customs left in Seller
// Central. The labels row keeps its place while Amazon sends them.
function Done({ linked, onRetryLabels }: { linked: NonNullable<AglBooking["linked"]>; onRetryLabels: () => void }) {
  const t = useTranslations("booking")
  const { shipment, labels } = linked
  return (
    <BookingStep title={t("agl.done.title")} description={t("agl.done.description")} actions={<DoneAction />}>
      <FileRow
        icon={<LinkIcon aria-hidden />}
        title={shipment.name}
        description={t("agl.done.shipment", { id: shipment.id, cartons: shipment.cartons, units: shipment.units })}
      >
        <RowStatus>{t("agl.done.linked")}</RowStatus>
      </FileRow>
      {/* Says when the labels arrive, or why they didn't. */}
      <div aria-live="polite">
        {labels.status === "failed" ? (
          <IssueSummary
            title={t("agl.done.labelsFailed")}
            description={t("agl.done.labelsFailedDescription")}
            action={t("tryAgain")}
            retry
            onAction={onRetryLabels}
          />
        ) : (
          <LabelsRow icon={<Tags aria-hidden />} title={t("agl.done.labels")} from="Amazon" labels={labels} />
        )}
      </div>
      <FileRow
        icon={<FileText aria-hidden />}
        title={t("agl.done.customs")}
        description={t("agl.done.customsDescription")}
      >
        <OpenAction href={linked.customsUrl} />
      </FileRow>
    </BookingStep>
  )
}
