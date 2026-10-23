import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CopackerClient, clientError } from "@repo/copacker-client"
import { commands, credentialOperations, defineOperation, type SuccessEnvelope } from "@repo/copacker-contract"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { runCli } from "../src/cli.ts"
import { atomicWrite, saveArtifact, uploadFile } from "../src/files.ts"
import { buildInput, decimalMinor } from "../src/input.ts"
import { render } from "../src/output.ts"
import { LocalStore } from "../src/storage.ts"

const workspace = "10000000-0000-4000-8000-000000000001"
const temps: string[] = []
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "copacker-cli-test-"))
  temps.push(path)
  return path
}
afterEach(async () => {
  await Promise.all(temps.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const envelope = (data: SuccessEnvelope["data"]): SuccessEnvelope => ({
  data,
  meta: {
    requestId: "test",
    workspaceId: workspace,
    generatedAt: "2026-10-15T00:00:00Z",
    completeness: "complete",
    sources: [],
    warnings: [],
    redactedFields: []
  }
})
const definition = (name: string, mutation = false) =>
  defineOperation(
    {
      operation: name,
      cliPath: name.split("."),
      context: name === "account.show" ? "account" : "workspace",
      effects: [],
      accessPolicy: { scopes: [], workspaceKinds: ["buyer"], description: "Fixture." },
      limits: { maxInputBytes: 1048576, maxFileBytes: 32000000 },
      asyncStatusSchema: null,
      execution: {
        kind: mutation ? "mutation" : "query",
        idempotent: true,
        confirmation: false,
        readBranches: [
          { field: "mode", value: "read" },
          { field: "action", value: "read" }
        ],
        csvColumns: ["id", "name"]
      }
    },
    z.record(z.string(), z.json()),
    z.json()
  ).descriptor
const find = (name: string) => {
  const result = commands.find((c) => c.operation === name)
  if (!result) {
    throw new Error(name)
  }
  return result
}

describe("CLI input and output", () => {
  it("maps both listing guards and explicit ownership", () => {
    expect(
      buildInput(
        find("product.listing.link"),
        {
          revision: "4",
          linkRevision: "2",
          variant: "variant",
          piecesPerListing: "6",
          inventoryOwner: "external"
        },
        [workspace]
      ).input
    ).toEqual({
      id: workspace,
      expectedRevision: 4,
      expectedLinkRevision: 2,
      variantId: "variant",
      piecesPerListing: 6,
      inventoryOwner: "external"
    })
  })
  it("maps advertised commands and exact amounts without confusing entity IDs", () => {
    expect(buildInput(find("order.show"), { connection: workspace }, ["1043"]).input).toEqual({
      reference: "1043",
      connectionId: workspace
    })
    expect(buildInput(find("po.show"), {}, [workspace]).input).toEqual({ id: workspace })
    for (const operation of ["product.import.apply", "inventory.import.apply"]) {
      expect(buildInput(find(operation), { reviewed: true }, [workspace]).input).toEqual({
        previewId: workspace,
        reviewed: true
      })
    }
    expect(
      buildInput(
        find("inventory.update"),
        { location: workspace, state: "on_hand", quantity: "120", dryRun: true, reason: "count" },
        [workspace]
      ).input
    ).toEqual({
      variantId: workspace,
      locationId: workspace,
      quantityState: "on_hand",
      quantity: 120,
      reason: "count",
      mode: "preview"
    })
    expect(
      buildInput(find("product.price.update"), { amount: "19.95", currency: "USD", dryRun: true }, [workspace]).input
        .amountMinor
    ).toBe(1995)
    expect(decimalMinor("123", "JPY")).toBe(123)
    expect(decimalMinor("1.125", "KWD")).toBe(1125)
    for (const amount of ["1.001", "1e2", "-1", "NaN", "9999999999999999"]) {
      expect(() => decimalMinor(amount, "USD")).toThrow(Error)
    }
    // A restock plan names its report with --from-report, never also in the selection file.
    expect(buildInput(find("restock.plan.create"), { fromReport: workspace }, []).input).toEqual({
      reportId: workspace
    })
    expect(() =>
      buildInput(find("restock.plan.create"), { fromReport: workspace }, [], { reportId: workspace })
    ).toThrow("once")
  })
  it("rejects duplicate fields and conflicting read/apply/generate selectors", () => {
    expect(() => buildInput(find("po.update"), { revision: "3" }, [workspace], { expectedRevision: 2 })).toThrow("once")
    expect(() =>
      buildInput(find("product.price.update"), { preview: workspace, amount: "1", currency: "USD" }, [workspace])
    ).toThrow("immutable")
    expect(() => buildInput(find("order.export"), { exportId: workspace, fileFormat: "csv" }, [])).toThrow("generation")
    expect(() => buildInput(find("inventory.update"), { batchId: workspace, quantity: "2" }, [])).toThrow("new values")
    expect(() => buildInput(find("po.submit"), { dryRun: true }, [workspace])).toThrow("does not support")
    expect(buildInput(find("inventory.update"), { batchId: workspace }, []).input).toEqual({
      mode: "read",
      batchId: workspace
    })
    expect(buildInput(find("order.export"), { exportId: workspace }, []).input).toEqual({
      action: "read",
      exportId: workspace
    })
    expect(buildInput(find("catalog.export"), { fileFormat: "pdf", revision: "2" }, [workspace]).input).toEqual({
      action: "generate",
      selection: { id: workspace, expectedRevision: 2 },
      fileFormat: "pdf"
    })
    expect(buildInput(find("product.variant.update"), { preview: workspace }, [workspace]).input).toEqual({
      mode: "apply",
      previewId: workspace,
      variantId: workspace
    })
  })
  it("preserves JSON, quotes CSV and removes terminal control sequences from tables", () => {
    const result = envelope({ items: [{ id: "one", name: 'a,"b"\nnext' }] })
    expect(JSON.parse(render(result, "json"))).toEqual(result)
    expect(render(result, "csv", ["id", "name"])).toBe('id,name\r\none,"a,""b""\nnext"\r\n')
    expect(() => render(result, "csv")).toThrow("CSV columns")
    expect(render(envelope({ name: "\x1b[31mred\x1b[0m\x07" }), "table")).not.toContain("\x1b")
    expect(render(envelope({ items: [] }), "table")).toBe("No matching records.\n")
  })
})

describe("CLI execution", () => {
  async function setup() {
    const store = new LocalStore(await directory())
    const stdout: string[] = [],
      stderr: string[] = [],
      requests: { operation: string; body: unknown; key: string | null }[] = []
    const fetcher: typeof fetch = async (url, init) => {
      const operation = String(url).split("/").at(-1)!
      const body = z
        .object({ input: z.record(z.string(), z.json()), workspaceId: z.string().optional() })
        .parse(JSON.parse(String(init?.body)))
      requests.push({ operation, body, key: new Headers(init?.headers).get("Idempotency-Key") })
      if (operation === "schema.show") {
        return Response.json(
          envelope(
            definition(
              z.string().parse(body.input.operation),
              !String(body.input.operation).endsWith(".show") && !String(body.input.operation).endsWith(".list")
            )
          )
        )
      }
      if (operation === "account.show") {
        return Response.json({ ...envelope({ id: "principal" }), meta: { ...envelope({}).meta, workspaceId: null } })
      }
      if (operation === "po.submit") {
        return Response.json(
          clientError("partial_write", "Document generation failed.", 409, { result: { poId: workspace, sent: true } })
            .envelope,
          { status: 409 }
        )
      }
      return Response.json(envelope({ id: workspace, name: "Result" }))
    }
    return {
      stdout,
      stderr,
      requests,
      environment: {
        store,
        stdout: (s: string) => stdout.push(s),
        stderr: (s: string) => stderr.push(s),
        interactive: false,
        env: { COPACKER_TOKEN: "never-print-this", COPACKER_WORKSPACE: workspace },
        fetch: fetcher,
        stdin: async () => "{}",
        confirm: async () => false
      }
    }
  }
  it("prints help without auth and gives one JSON envelope for invalid usage", async () => {
    const t = await setup()
    expect(await runCli(["--help"], { ...t.environment, env: {} })).toBe(0)
    expect(t.stdout.join("")).toContain("login")
    t.stdout.length = 0
    expect(await runCli(["order", "list", "--bogus", "--json"], t.environment)).toBe(2)
    expect(t.stdout).toHaveLength(1)
    expect(JSON.parse(t.stdout[0]!)).toHaveProperty("error.code", "invalid_input")
    expect(t.requests).toHaveLength(0)
  })
  it("requires an explicit automation workspace and does not leak tokens", async () => {
    const t = await setup()
    expect(
      await runCli(["product", "list", "--json"], { ...t.environment, env: { COPACKER_TOKEN: "never-print-this" } })
    ).toBe(2)
    expect(await runCli(["account", "show", "--json"], t.environment)).toBe(0)
    expect(t.stdout.join("") + t.stderr.join("")).not.toContain("never-print-this")
  })
  it("allows account schema inspection before selecting a workspace", async () => {
    const t = await setup()
    const environment = { ...t.environment, env: { COPACKER_TOKEN: "never-print-this" } }
    expect(await runCli(["schema", "show", "account.show", "--json"], environment)).toBe(0)
    expect(t.requests).toHaveLength(1)
    expect(t.requests[0]?.body).toEqual({ input: { operation: "account.show" } })
    expect(await runCli(["schema", "show", "po.create", "--json"], environment)).toBe(2)
    expect(t.requests).toHaveLength(1)
  })
  it("ends a stalled secret response with a recoverable receipt and removes the empty protected file", async () => {
    const t = await setup()
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal)
    const path = join(t.environment.store.directory, "secret.txt")
    const credential = {
      id: workspace,
      revision: 1,
      name: "restock-ci",
      workspaceId: workspace,
      principalId: "principal",
      scopes: ["reports:read"],
      createdAt: "2026-10-22T00:00:00Z",
      expiresAt: "2026-11-21T00:00:00Z",
      lastUsedAt: null,
      state: "pending_delivery",
      generation: 1,
      previousGenerationExpiresAt: null,
      pendingDeliveryExpiresAt: "2026-10-22T00:10:00Z"
    }
    const fetcher: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/private/delivery")) {
        const stream = new ReadableStream<Uint8Array>({
          start(streamController) {
            init?.signal?.addEventListener("abort", () => streamController.error(new Error("stalled secret bytes")), {
              once: true
            })
            queueMicrotask(() => controller.abort())
          }
        })
        return new Response(stream)
      }
      if (String(url).endsWith("/account.credential.create")) {
        return Response.json(
          envelope({
            credential,
            delivery: {
              id: workspace,
              expiresAt: "2026-10-22T00:10:00Z",
              state: "available",
              download: { url: "/private/delivery", authentication: "interactive_required" }
            }
          })
        )
      }
      if (String(url).endsWith("/schema.show") && String(init?.body).includes("account.credential.create")) {
        return Response.json(envelope(credentialOperations["account.credential.create"].descriptor))
      }
      return t.environment.fetch(url, init)
    }
    try {
      expect(
        await runCli(
          [
            "account",
            "credential",
            "create",
            "--name",
            "restock-ci",
            "--scope",
            "reports:read",
            "--expires-in",
            "30d",
            "--secret-file",
            path,
            "--json"
          ],
          { ...t.environment, fetch: fetcher }
        )
      ).toBe(5)
      expect(JSON.parse(t.stdout[0]!)).toHaveProperty("error.code", "credential_delivery_failed")
      expect(JSON.parse(t.stdout[0]!)).toHaveProperty("error.details.credential.id", workspace)
      expect(t.stdout.join("") + t.stderr.join("")).not.toContain("stalled secret bytes")
      await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      timeout.mockRestore()
    }
  })
  it("retains one execution identity across reruns and separates explicit new intents", async () => {
    const t = await setup()
    const args = [
      "inventory",
      "update",
      workspace,
      "--location",
      workspace,
      "--quantity",
      "4",
      "--state",
      "on_hand",
      "--reason",
      "count",
      "--dry-run",
      "--json"
    ]
    expect(await runCli(args, t.environment)).toBe(0)
    expect(await runCli(args, t.environment)).toBe(0)
    const writes = t.requests.filter((r) => r.operation === "inventory.update")
    expect(writes).toHaveLength(2)
    expect(writes[0]?.key).toBe(writes[1]?.key)
    expect(await runCli([...args, "--idempotency-key", "new-intent"], t.environment)).toBe(0)
    expect(t.requests.at(-1)?.key).toBe("new-intent")
    const files = await readdir(join(t.environment.store.directory, "receipts"))
    const receipt = await readFile(join(t.environment.store.directory, "receipts", files[0]!), "utf8")
    expect(receipt).not.toContain("never-print-this")
    expect(receipt).not.toContain("count")
  })
  it("requires a deliberate new intent after the replay window expires", async () => {
    const store = new LocalStore(await directory())
    const scope = { operation: "po.create", principal: "person", workspaceId: workspace }
    const original = await store.execution(scope)
    vi.useFakeTimers()
    try {
      vi.setSystemTime(original.receipt.createdAt + 8 * 86400000)
      await expect(store.execution(scope)).rejects.toMatchObject({
        envelope: { error: { code: "idempotency_expired" } }
      })
      const deliberate = await store.execution(scope, "reviewed-new-intent")
      expect(deliberate.receipt.key).toBe("reviewed-new-intent")
    } finally {
      vi.useRealTimers()
    }
  })
  it("requires explicit confirmation and preserves partial result details", async () => {
    const t = await setup()
    expect(await runCli(["po", "submit", workspace, "--revision", "1", "--json"], t.environment)).toBe(2)
    expect(t.requests.some((r) => r.operation === "po.submit")).toBe(false)
    t.stdout.length = 0
    expect(await runCli(["po", "submit", workspace, "--revision", "1", "--yes", "--json"], t.environment)).toBe(9)
    expect(JSON.parse(t.stdout[0]!)).toHaveProperty("error.details.result.sent", true)
  })
  it("rejects duplicate JSON input and mutually exclusive output choices", async () => {
    const t = await setup()
    expect(
      await runCli(["po", "create", "--input", "-", "--json"], { ...t.environment, stdin: async () => '{"x":1,"x":2}' })
    ).toBe(2)
    expect(await runCli(["order", "list", "--json", "--format", "csv"], t.environment)).toBe(2)
    expect(t.requests).toHaveLength(0)
  })
})

describe("protected entity files", () => {
  it("writes atomically without replacing an existing file by default", async () => {
    const path = join(await directory(), "report.json")
    await atomicWrite(path, "first")
    await expect(atomicWrite(path, "second")).rejects.toThrow("already exists")
    expect(await readFile(path, "utf8")).toBe("first")
    await atomicWrite(path, "second", true)
    expect(await readFile(path, "utf8")).toBe("second")
    expect(await readdir(join(path, ".."))).toEqual(["report.json"])
  })
  it("verifies downloaded bytes and leaves no partial destination on corruption", async () => {
    const root = await directory(),
      output = join(root, "label.pdf")
    const bytes = Buffer.from("%PDF-fixture")
    const artifact = {
      id: workspace,
      filename: "label.pdf",
      mediaType: "application/pdf",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      revision: 1,
      sourceIds: [],
      download: { url: "/private/label", authentication: "required" },
      expiresAt: null
    }
    const client = new CopackerClient({
      baseUrl: "https://copacker.test",
      token: "secret",
      fetch: async () => new Response(bytes)
    })
    expect(await saveArtifact(client, envelope(artifact), output, false)).toBe(true)
    expect(await readFile(output)).toEqual(bytes)
    await expect(
      saveArtifact(client, envelope({ ...artifact, sha256: "0".repeat(64) }), join(root, "bad.pdf"), false)
    ).rejects.toThrow("integrity")
    expect(await readdir(root)).toEqual(["label.pdf"])
    expect(await saveArtifact(client, envelope({ status: "pending" }), output, false)).toBe(false)
  })
  it("uses distinct prepare and complete keys for an entity-bound upload", async () => {
    const path = join(await directory(), "invoice.pdf")
    await writeFile(path, "%PDF-fixture")
    const requests: { url: string; init?: RequestInit }[] = []
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url).endsWith("schema.show")) {
        return Response.json(envelope(definition("shipment.invoice.upload", true)))
      }
      if (init?.method === "PUT") {
        return new Response(null, { status: 204 })
      }
      const body = JSON.parse(String(init?.body))
      if (body.input.phase === "prepare") {
        return Response.json(
          envelope({
            intentId: workspace,
            handoffId: workspace,
            expiresAt: "2026-10-16T00:00:00Z",
            upload: { url: "/private/upload", method: "PUT", authentication: "required" }
          })
        )
      }
      return Response.json(envelope({ shipmentId: workspace, revision: 2 }))
    }
    const client = new CopackerClient({
      baseUrl: "https://copacker.test",
      token: "secret",
      workspaceId: workspace,
      fetch: fetcher
    })
    await expect(
      uploadFile(client, "shipment.invoice.upload", path, { id: workspace, expectedRevision: 1 }, "logical", workspace)
    ).resolves.toHaveProperty("data.revision", 2)
    const phases = requests.filter((r) => r.url.endsWith("shipment.invoice.upload"))
    expect(phases.map((p) => new Headers(p.init?.headers).get("Idempotency-Key"))).toEqual([
      "logical/prepare",
      "logical/complete"
    ])
    expect(JSON.parse(String(phases[1]?.init?.body)).input).not.toHaveProperty("id")
  })
})
