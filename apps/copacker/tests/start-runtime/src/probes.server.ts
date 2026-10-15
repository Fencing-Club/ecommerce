import type { AuthenticationResponse } from "@workos-inc/node"
import { getAuthkit } from "@workos/authkit-tanstack-react-start"
import { env } from "cloudflare:workers"
import { sql } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { db, withDatabase } from "../../../src/db"
import { saveAuthentication } from "../../../src/server/auth-session"
import { decrypt, encrypt } from "../../../src/server/security"
import { validatePdf } from "../../../src/server/storage"

// Synthetic identity and secrets, used only by the isolated compatibility application. Never a real WorkOS account.
export const authentication: AuthenticationResponse = {
  accessToken: "compatibility-access",
  refreshToken: "compatibility-refresh",
  user: {
    object: "user",
    id: "user_compatibility",
    email: "compatibility@example.invalid",
    emailVerified: true,
    profilePictureUrl: null,
    name: "Compatibility Test",
    firstName: "Compatibility",
    lastName: "Test",
    lastSignInAt: null,
    locale: "en",
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-15T00:00:00Z",
    externalId: null,
    metadata: {}
  }
}

export async function sessionProbe(request: Request) {
  const service = await getAuthkit()
  if (request.method === "POST") {
    const { response } = await saveAuthentication(authentication)
    const headers = new Headers(response?.headers)
    headers.append("Set-Cookie", "migration-second=present; Path=/; HttpOnly; SameSite=Lax")
    return Response.json({ saved: true }, { headers })
  }
  if (request.method === "DELETE") {
    const { response } = await service.clearSession(new Response(null, { status: 204 }))
    return response ?? new Response(null, { status: 500 })
  }
  const session = await service.getSession(request)
  // A codec/storage probe, not authentication: dummy access tokens are deliberately never accepted by withAuth.
  return Response.json({ userId: session?.user.id ?? null })
}

export async function databaseProbe() {
  const value = await withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, async () =>
    db().transaction(async (tx) => {
      // Only connection-local temporary data; no schema changes or writes to application records.
      await tx.execute(sql`create temporary table migration_probe (value integer) on commit drop`)
      await tx.execute(sql`insert into migration_probe values (42)`)
      const result = await tx.execute(sql`select value from migration_probe`)
      return result.rows
    })
  )
  return Response.json({ rows: value })
}

export async function documentProbe() {
  const pdf = await PDFDocument.create()
  for (let page = 0; page < 1000; page++) {
    pdf.addPage()
  }
  const bytes = await pdf.save()
  await validatePdf(bytes)
  const original = "synthetic-provider-token"
  const scope = "compatibility:provider"
  const encrypted = encrypt(original, scope)
  return Response.json({
    pages: pdf.getPageCount(),
    bytes: bytes.length,
    crypto: decrypt(encrypted, scope) === original
  })
}
