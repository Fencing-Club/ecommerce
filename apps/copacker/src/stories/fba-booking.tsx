import { money } from "@repo/aisle"
import { CircleCheck, CircleAlert, FileText, LoaderCircle } from "lucide-react"
import { useId, useState } from "react"
import { Status } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

type Quote = {
  id: string
  name: string
  placementFee: number
  shipments: { destination: string; cartons: number; carrier: string; service: string; cost: number }[]
}
type Stage = "options" | "review" | "booking" | "confirmed" | "failed" | "uncertain" | "expired"
type Result = "confirmed" | "failed" | "uncertain"
function total(quote: Quote) {
  return quote.placementFee + quote.shipments.reduce((sum, shipment) => sum + shipment.cost, 0)
}

export function FbaBookingPreview({
  orderName,
  shipmentName,
  origin,
  readyDate,
  currency,
  quotes,
  initialStage = "options",
  labelsReady = true,
  onBook
}: {
  orderName: string
  shipmentName: string
  origin: string
  readyDate: string
  currency: string
  quotes: Quote[]
  initialStage?: Stage
  labelsReady?: boolean
  onBook: (quoteId: string) => Promise<Result>
}) {
  const [open, setOpen] = useState(true)
  const [stage, setStage] = useState<Stage>(initialStage)
  const [selection, setSelection] = useState(quotes[0]?.id ?? "")
  const [approved, setApproved] = useState(false)
  const id = useId()
  const quote = quotes.find((option) => option.id === selection)
  const format = (value: number) => money(value, currency)
  const terminal = stage === "confirmed" || stage === "uncertain"
  async function book() {
    if (!quote || !approved || stage !== "review") {
      return
    }
    setStage("booking")
    try {
      setStage(await onBook(quote.id))
    } catch {
      setStage("uncertain")
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Book FBA shipping
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto" showCloseButton={stage !== "booking"}>
          <DialogHeader>
            <DialogTitle>{stage === "confirmed" ? "Shipping booked" : "Book FBA shipping"}</DialogTitle>
            <DialogDescription>
              {orderName} / {shipmentName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <span className="text-muted-foreground">Shipment status</span>
            <Status status="packing" />
          </div>
          {stage === "confirmed" ? (
            <div className="space-y-4">
              <div className="flex gap-3">
                <CircleCheck className="size-5 shrink-0 text-green-700" />
                <div>
                  <p className="font-medium">Shipping confirmed for {shipmentName}.</p>
                  <p className="text-muted-foreground">
                    {labelsReady
                      ? "Labels have been added to shipment documents."
                      : "Amazon is preparing the labels. They will be added to shipment documents when ready."}
                  </p>
                </div>
              </div>
              {labelsReady ? (
                <div className="rounded-lg border divide-y">
                  {["Amazon carton labels", "Carrier labels"].map((name) => (
                    <div key={name} className="flex gap-2 items-center p-3">
                      <FileText className="size-4 text-muted-foreground" />
                      <span>{name}</span>
                      <span className="ms-auto text-muted-foreground">PDF</span>
                    </div>
                  ))}
                </div>
              ) : (
                <output className="text-muted-foreground">Preparing labels…</output>
              )}
              <p className="text-muted-foreground">
                Release documents when the required approvals and documents are complete. The shipment then becomes
                Ready to ship or Ready for pickup.
              </p>
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Ship from</dt>
                  <dd>{origin}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ready date</dt>
                  <dd>{readyDate}</dd>
                </div>
              </dl>
              {(stage === "expired" || stage === "failed" || stage === "uncertain") && (
                <div role="alert" className="flex gap-3 rounded-lg border p-3">
                  <CircleAlert className="size-5 shrink-0 text-red-600" />
                  <div>
                    <p className="font-medium">
                      {stage === "expired" && "This quote has expired."}
                      {stage === "uncertain" && "We’re checking the booking result."}
                      {stage === "failed" && "Amazon couldn’t confirm this booking."}
                    </p>
                    <p className="text-muted-foreground">
                      {stage === "expired" && "Get a new quote and review the updated charges before booking."}
                      {stage === "uncertain" &&
                        "Don’t book again. We’ll reconcile the Amazon result before allowing another attempt."}
                      {stage === "failed" &&
                        "The request was rejected before confirmation. Review updated options before trying again."}
                    </p>
                  </div>
                </div>
              )}
              {stage === "options" && (
                <>
                  <h3 className="font-medium">Choose placement and shipping</h3>
                  <RadioGroup
                    aria-label="Placement and shipping"
                    value={selection}
                    onValueChange={(value) => {
                      setSelection(value)
                      setApproved(false)
                    }}
                  >
                    {quotes.map((option) => (
                      <Label
                        key={option.id}
                        htmlFor={`${id}-${option.id}`}
                        className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer has-data-checked:border-primary"
                      >
                        <RadioGroupItem id={`${id}-${option.id}`} value={option.id} />
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between gap-3">
                            <span>{option.name}</span>
                            <span>{format(total(option))}</span>
                          </div>
                          <p className="text-xs font-normal text-muted-foreground">
                            {option.shipments.length} {option.shipments.length === 1 ? "destination" : "destinations"}.
                            Placement {format(option.placementFee)}. Shipping{" "}
                            {format(total(option) - option.placementFee)}.
                          </p>
                          {option.shipments.map((shipment) => (
                            <p key={shipment.destination} className="text-xs font-normal text-muted-foreground">
                              {shipment.destination}: {shipment.cartons} cartons, {shipment.carrier} {shipment.service}
                            </p>
                          ))}
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    Only eligible options returned by Amazon are shown. Quotes must still be valid when you confirm. For
                    AGL or your own carrier, use the separate transport arrangement.
                  </p>
                </>
              )}
              {quote && stage !== "options" && (
                <div className="space-y-3">
                  <h3 className="font-medium">{quote.name}</h3>
                  <div className="rounded-lg border divide-y">
                    {quote.shipments.map((shipment) => (
                      <div key={shipment.destination} className="flex justify-between gap-4 p-3">
                        <div>
                          <p>{shipment.destination}</p>
                          <p className="text-muted-foreground">
                            {shipment.cartons} cartons / {shipment.carrier} {shipment.service}
                          </p>
                        </div>
                        <span>{format(shipment.cost)}</span>
                      </div>
                    ))}
                  </div>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt>Placement fee</dt>
                      <dd>{format(quote.placementFee)}</dd>
                    </div>
                    <div className="flex justify-between border-t pt-3 font-semibold">
                      <dt>Total charges</dt>
                      <dd>{format(total(quote))}</dd>
                    </div>
                  </dl>
                  {stage === "review" && (
                    <>
                      <p className="text-muted-foreground">
                        Confirming accepts Amazon’s placement and shipping charges for all destinations shown. Placement
                        confirmation cannot be undone through this form.
                      </p>
                      <div className="flex gap-3 items-start">
                        <Checkbox
                          id={`${id}-approve`}
                          checked={approved}
                          onCheckedChange={(checked) => setApproved(checked === true)}
                        />
                        <Label htmlFor={`${id}-approve`} className="leading-5">
                          I approve {format(total(quote))} in Amazon charges for {shipmentName}.
                        </Label>
                      </div>
                    </>
                  )}
                  {stage === "booking" && (
                    <output className="flex gap-2 items-center">
                      <LoaderCircle className="size-4 animate-spin" />
                      Confirming with Amazon…
                    </output>
                  )}
                </div>
              )}
            </>
          )}
          <DialogFooter>
            {stage !== "booking" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (stage === "review") {
                    setStage("options")
                    setApproved(false)
                  } else {
                    setOpen(false)
                  }
                }}
              >
                {stage === "review" ? "Back" : "Close"}
              </Button>
            )}
            {stage === "options" && (
              <Button disabled={!quote} onClick={() => setStage("review")}>
                Review charges
              </Button>
            )}
            {stage === "review" && (
              <Button disabled={!approved} onClick={book}>
                Confirm and book {quote ? format(total(quote)) : ""}
              </Button>
            )}
            {(stage === "failed" || stage === "expired") && (
              <Button
                onClick={() => {
                  setApproved(false)
                  setStage("options")
                }}
              >
                Review new quotes
              </Button>
            )}
            {terminal && stage === "confirmed" && <Button onClick={() => setOpen(false)}>Done</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
