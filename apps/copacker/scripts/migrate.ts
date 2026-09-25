import { migrate } from "drizzle-orm/node-postgres/migrator"
import { db } from "../src/db/index"
await migrate(db(), { migrationsFolder: "./drizzle" })
process.stdout.write("Copacker migrations applied.\n")
process.exit(0)
