import { sql } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { documents, poImports, productBarcodes, supplierCatalogImports, supplierProductGroups } from "./schema"

// Use schema columns so product-level images cannot drift to the variant table during storage reconciliation.
export const storageReferenceQuery = new PgDialect().sqlToQuery(sql`
  SELECT ${documents.objectKey} AS key FROM ${documents}
  UNION SELECT ${poImports.objectKey} FROM ${poImports}
  UNION SELECT ${supplierCatalogImports.objectKey} FROM ${supplierCatalogImports}
  UNION SELECT ${productBarcodes.objectKey} FROM ${productBarcodes}
  UNION SELECT image->>'key' FROM ${supplierProductGroups},
    jsonb_array_elements(${supplierProductGroups.images}) image
`).sql
