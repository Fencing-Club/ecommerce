import { notFound, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { createTranslator } from "use-intl"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { requirePage, session } from "@/server/auth"
import { localization } from "@/server/localization"
import { overviewPageData } from "@/server/overview-page"
import { localizedPage, pageResult } from "@/server/page-result"
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

export const readCatalogs = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(() =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "supplier") {
        throw redirect({ href: "/" })
      }
      requirePage(s, "catalogs")
      const page = await catalogsPageData(s)
      if (!page) {
        throw notFound()
      }
      return page
    }, "supplier.pages.catalogs")
  )

export const readNewCatalog = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(() =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "supplier") {
        throw redirect({ href: "/" })
      }
      requirePage(s, "catalogs", "edit")
      const page = await catalogPageData(s, null)
      if (!page) {
        throw notFound()
      }
      return page
    }, "supplier.pages.newCatalog")
  )

export const readCatalog = createServerFn()
  .validator(z.object({ query: urlQuery, id: z.string().max(128) }))
  .handler(({ data }) =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "supplier") {
        throw redirect({ href: "/" })
      }
      requirePage(s, "catalogs")
      const page = await catalogPageData(s, data.id)
      if (!page) {
        throw notFound()
      }
      return page
    }, "supplier.pages.catalog")
  )

export const readCustomers = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(() =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "supplier") {
        throw redirect({ href: "/" })
      }
      requirePage(s, "customers")
      const page = await customersPageData(s)
      if (!page) {
        throw notFound()
      }
      return page
    }, "supplier.pages.customers")
  )

export const readCustomer = createServerFn()
  .validator(z.object({ query: urlQuery, id: z.string().max(128) }))
  .handler(({ data }) =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "supplier") {
        throw redirect({ href: "/" })
      }
      requirePage(s, "customers")
      const page = await customerPageData(s, data.id)
      if (!page) {
        throw notFound()
      }
      return page
    }, "supplier.pages.customer")
  )

export const readInventory = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "supplier") {
        throw redirect({ href: "/products" })
      }
      requirePage(s, "inventory")
      const page = await inventoryPageData(s, data.query.tab)
      if (!page) {
        throw notFound()
      }
      return page
    }, "inventory.page.title")
  )

export const readSales = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "buyer") {
        throw redirect({ href: "/orders" })
      }
      requirePage(s, "sales")
      const page = await salesPageData(s, data.query.q)
      if (!page) {
        throw notFound()
      }
      return page
    }, "sales.title")
  )

export const readRestock = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(() =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "buyer") {
        throw redirect({ href: "/orders" })
      }
      requirePage(s, "restock")
      const page = await restockPageData(s)
      if (!page) {
        throw notFound()
      }
      return page
    }, "restock.title")
  )

export const readProducts = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "buyer" && s.org.kind !== "supplier") {
        throw redirect({ href: "/orders" })
      }
      requirePage(s, "products")
      const page = await productsPageData(s, data.query.q)
      if (!page) {
        throw notFound()
      }
      return page
    }, "products.page.title")
  )

export const readNewProduct = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(() =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "supplier") {
        throw redirect({ href: "/products" })
      }
      requirePage(s, "products", "edit")
      requirePage(s, "prices")
      return {}
    }, "products.page.addProduct")
  )

export const readProduct = createServerFn()
  .validator(z.object({ query: urlQuery, id: z.string().max(128) }))
  .handler(({ data }) =>
    localizedPage(async () => {
      const s = await session()
      if (s.org.kind !== "supplier") {
        throw redirect({ href: "/products" })
      }
      requirePage(s, "products")
      const page = await productPageData(s, data.id)
      if (!page) {
        throw notFound()
      }
      return page
    }, "products.page.product")
  )

export const readOverview = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) =>
    pageResult(async () => {
      const s = await session()
      const destination = overviewDestination(s)
      if (destination) {
        throw redirect({ href: destination })
      }
      requirePage(s, "overview")
      requirePage(s, "prices")
      const page = await overviewPageData(s, data.query)
      if (!page) {
        throw notFound()
      }
      const t = createTranslator(await localization())
      return { data: page, title: t("overview.title"), query: data.query }
    })
  )
