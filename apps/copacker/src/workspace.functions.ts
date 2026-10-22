import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { arrayIncludes } from "ts-extras"
import { z } from "zod"
import { NotFoundError } from "@/i18n/errors"
import { homeFor } from "@/lib/navigation"
import type { WorkspaceKind } from "@/lib/onboarding"
import { overviewSearch } from "@/lib/page-search"
import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { overviewPageData } from "@/server/overview-page"
import { pageResult, type TitleKey } from "@/server/page-result"
import { overviewDestination } from "@/server/portal-session"
import {
  catalogsPageData,
  catalogPageData,
  customersPageData,
  customerPageData,
  inventoryPageData,
  salesPageData,
  restockPageData,
  productsPageData,
  productPageData
} from "@/server/workspace-pages"

type Session = Awaited<ReturnType<typeof session>>

// A page that only some kinds of workspace have. Another kind goes to its home, or to `elsewhere` when the page names
// one. `read` checks the viewer's grants and returns the page's data, or null for a record that isn't there.
function workspacePage<T>({
  kinds,
  elsewhere,
  title,
  read
}: {
  kinds: readonly WorkspaceKind[]
  elsewhere?: string
  title: TitleKey
  read: (s: Session) => T | null | Promise<T | null>
}) {
  return pageResult(async () => {
    const s = await session()
    if (!arrayIncludes(kinds, s.org.kind)) {
      throw redirect({ href: elsewhere ?? homeFor(s.org.kind, s) })
    }
    const page = await read(s)
    if (page === null) {
      throw new NotFoundError()
    }
    return page
  }, title)
}

const recordId = z.object({ id: z.string() })

export const readCatalogs = createServerFn().handler(() =>
  workspacePage({ kinds: ["supplier"], title: "supplier.pages.catalogs", read: catalogsPageData })
)

export const readNewCatalog = createServerFn().handler(() =>
  workspacePage({ kinds: ["supplier"], title: "supplier.pages.newCatalog", read: (s) => catalogPageData(s, null) })
)

export const readCatalog = createServerFn()
  .validator(recordId)
  .handler(({ data }) =>
    workspacePage({ kinds: ["supplier"], title: "supplier.pages.catalog", read: (s) => catalogPageData(s, data.id) })
  )

export const readCustomers = createServerFn().handler(() =>
  workspacePage({ kinds: ["supplier"], title: "supplier.pages.customers", read: customersPageData })
)

export const readCustomer = createServerFn()
  .validator(recordId)
  .handler(({ data }) =>
    workspacePage({ kinds: ["supplier"], title: "supplier.pages.customer", read: (s) => customerPageData(s, data.id) })
  )

// A buyer's inventory is on Products.
export const readInventory = createServerFn().handler(() =>
  workspacePage({ kinds: ["supplier"], elsewhere: "/products", title: "inventory.page.title", read: inventoryPageData })
)

export const readSales = createServerFn().handler(() =>
  workspacePage({ kinds: ["buyer"], title: "sales.title", read: salesPageData })
)

export const readRestock = createServerFn().handler(() =>
  workspacePage({ kinds: ["buyer"], title: "restock.title", read: restockPageData })
)

export const readProducts = createServerFn().handler(() =>
  workspacePage({ kinds: ["buyer", "supplier"], title: "products.page.title", read: productsPageData })
)

export const readNewProduct = createServerFn().handler(() =>
  workspacePage({
    kinds: ["supplier"],
    elsewhere: "/products",
    title: "products.page.addProduct",
    read: (s) => {
      requireAccess(s, "products", "edit")
      requireAccess(s, "prices")
      return {}
    }
  })
)

export const readProduct = createServerFn()
  .validator(recordId)
  .handler(({ data }) =>
    workspacePage({
      kinds: ["supplier"],
      elsewhere: "/products",
      title: "products.page.product",
      read: (s) => productPageData(s, data.id)
    })
  )

// Every workspace has an Overview, but a forwarder's, or one the viewer can't open, sends them on to their home.
export const readOverview = createServerFn()
  .validator(overviewSearch)
  .handler(({ data }) =>
    pageResult(async () => {
      const s = await session()
      const destination = overviewDestination(s)
      if (destination) {
        throw redirect({ href: destination })
      }
      return overviewPageData(s, data)
    }, "overview.title")
  )
