import { ArrowRight, Factory, MapPin, Truck, Warehouse } from "lucide-react"
import { Fragment, type ReactNode } from "react"
import { FieldTitle } from "./ui/field"

/** The same card surrounds editable packing fields and the submitted shipment details. */
export function ShipmentPackingDetails({
  route,
  shipFrom,
  shipTo,
  transport,
  packing
}: {
  route?: string[]
  shipFrom: ReactNode
  shipTo?: ReactNode
  transport?: ReactNode
  packing?: ReactNode
}) {
  return (
    <section className="@container/packing-details overflow-hidden rounded-lg border bg-card text-sm">
      {route && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/40 px-4 py-3">
          {route.map((stop, index) => {
            let Icon = Warehouse
            if (index === 0) {
              Icon = Factory
            } else if (index === route.length - 1) {
              Icon = MapPin
            }
            return (
              <Fragment key={`${index}-${stop}`}>
                {index > 0 && <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                <span className="inline-flex items-center gap-2">
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {stop}
                </span>
              </Fragment>
            )
          })}
        </div>
      )}
      <div className="space-y-4 p-4">
        <div className={shipTo ? "grid items-start gap-6 @lg/packing-details:grid-cols-2" : "min-w-0"}>
          <div className="min-w-0 space-y-3">{shipFrom}</div>
          {shipTo && <div className="min-w-0">{shipTo}</div>}
        </div>
        {transport}
      </div>
      {packing && <div className="space-y-4 border-t p-4">{packing}</div>}
    </section>
  )
}

/** Both shipment addresses share a display; editable cards align the destination with the selector. */
export function ShipmentAddress({
  label,
  name,
  address,
  contact,
  readOnly = false
}: {
  label: string
  name: string
  address: string
  contact?: ReactNode
  readOnly?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {readOnly ? <p className="text-xs text-muted-foreground">{label}</p> : <FieldTitle>{label}</FieldTitle>}
      <div className={readOnly ? "flex min-w-0 items-start gap-3" : "flex min-w-0 py-3"}>
        {readOnly && <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="flex min-w-0 flex-col gap-1">
          {name && <p className="font-medium">{name}</p>}
          <p className={readOnly ? "text-sm text-muted-foreground" : "text-xs leading-relaxed text-muted-foreground"}>
            {address}
          </p>
          {contact && <div className="text-xs text-muted-foreground">{contact}</div>}
        </div>
      </div>
    </div>
  )
}

export function ShipmentTransportLegs({ legs }: { legs: string[] }) {
  return (
    <div className="space-y-2 text-xs">
      {legs.map((leg, index) => (
        <p key={`${index}-${leg}`} className="flex items-start gap-2">
          <Truck aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {leg}
        </p>
      ))}
    </div>
  )
}
