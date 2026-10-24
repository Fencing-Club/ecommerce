import { type Address, addressLine } from "@repo/copacker-orders"
import { cn } from "@/lib/utils"
import { PhoneLink } from "./common"

// An address as a label prints it, a line each: the place's name when it has one, its street lines, then the city,
// region, postal code and country. With `contact`, who to call there follows: the address's name and phone.
export function AddressText({
  name,
  address,
  contact = false,
  className
}: {
  name?: string
  address: Partial<Address>
  contact?: boolean
  className?: string
}) {
  const { addressLine1, addressLine2, ...area } = address
  const lines = [name, addressLine1, addressLine2, addressLine(area)].filter((line): line is string => Boolean(line))
  const person = contact ? address.name : undefined
  const phone = contact ? address.phoneNumber : undefined
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {lines.map((line, index) => (
        <span key={`${index}-${line}`}>
          <bdi>{line}</bdi>
        </span>
      ))}
      {(person || phone) && (
        <span className="text-xs text-muted-foreground">
          <bdi>
            {person}
            {person && phone && ", "}
            {phone && <PhoneLink number={phone} countryCode={address.countryCode} />}
          </bdi>
        </span>
      )}
    </div>
  )
}
