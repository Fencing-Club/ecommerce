import { z } from "zod"
import { NotFoundError } from "@/i18n/errors"

const uuid = z.uuid()

// A record's id from a page's URL. A malformed one, such as /shipments/abc/packet, names a record that doesn't exist, so
// the page shows Not found rather than an error. Page validators accept any string and leave the check to this.
export function pageId(raw: string) {
  const id = uuid.safeParse(raw)
  if (!id.success) {
    throw new NotFoundError()
  }
  return id.data
}
