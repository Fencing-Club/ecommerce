import type { TestProject } from "vitest/node"
import { databaseSchemaSql } from "./database-schema"

declare module "vitest" {
  export interface ProvidedContext {
    databaseSchema: string
  }
}

// Builds the schema's SQL once for the whole run, so each database test file only executes it.
export default async function setup(project: TestProject) {
  project.provide("databaseSchema", await databaseSchemaSql())
}
