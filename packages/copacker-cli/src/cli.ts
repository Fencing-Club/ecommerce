import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createInterface } from "node:readline/promises"
import { CopackerClient, CopackerError, apiOrigin, clientError } from "@repo/copacker-client"
import {
  commands,
  exitCode,
  isQuery,
  jsonObject,
  parseInput,
  type CommandDefinition,
  type JsonObject,
  type SuccessEnvelope
} from "@repo/copacker-contract"
import { Command, CommanderError } from "commander"
import { z } from "zod"
import { login, logout, profileToken } from "./auth.ts"
import { atomicWrite, fileFingerprint, saveArtifact, uploadFile } from "./files.ts"
import { booleanFlags, buildInput, camel, optionsSchema, type Options } from "./input.ts"
import { render, safeMessage } from "./output.ts"
import { LocalStore, secretFile } from "./storage.ts"

export interface CliEnvironment {
  stdout: (text: string) => void
  stderr: (text: string) => void
  stdin: () => Promise<string>
  interactive: boolean
  env: NodeJS.ProcessEnv
  store: LocalStore
  fetch?: typeof fetch
  confirm: (message: string) => Promise<boolean>
}

function defaults(): CliEnvironment {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    async stdin() {
      const parts: Buffer[] = []
      let size = 0
      for await (const part of process.stdin) {
        const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part)
        size += bytes.length
        if (size > 1048576) {
          throw clientError("invalid_input", "JSON input exceeds 1 MiB.")
        }
        parts.push(bytes)
      }
      return Buffer.concat(parts).toString("utf8")
    },
    interactive: !!process.stdin.isTTY && !!process.stdout.isTTY,
    env: process.env,
    store: new LocalStore(),
    async confirm(message) {
      const terminal = createInterface({ input: process.stdin, output: process.stderr })
      try {
        return /^y(?:es)?$/i.test((await terminal.question(`${message} [y/N] `)).trim())
      } finally {
        terminal.close()
      }
    }
  }
}

function localResult(data: JsonObject, workspaceId: string | null = null): SuccessEnvelope {
  return {
    data,
    meta: {
      requestId: randomUUID(),
      workspaceId,
      generatedAt: new Date().toISOString(),
      completeness: "complete",
      sources: [],
      warnings: [],
      redactedFields: []
    }
  }
}

function timeout(options: Options): number {
  const seconds = Number(options.timeout ?? "300")
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) {
    throw clientError("invalid_input", "--timeout must be between 1 and 86400 seconds.")
  }
  return seconds * 1000
}

async function context(options: Options, environment: CliEnvironment, account = false) {
  const profile = options.profile ?? "default"
  const saved = await environment.store.profile(profile)
  const baseUrl = apiOrigin(options.apiUrl ?? environment.env.COPACKER_API_URL ?? saved.baseUrl)
  if (environment.env.COPACKER_TOKEN && options.profile) {
    throw clientError("invalid_input", "Use COPACKER_TOKEN or an explicit --profile, not both.")
  }
  if (!environment.env.COPACKER_TOKEN && baseUrl !== saved.baseUrl) {
    throw clientError(
      "invalid_input",
      "Stored credentials belong to a different API origin. Run login for this origin first."
    )
  }
  const workspaceId =
    options.workspace ?? environment.env.COPACKER_WORKSPACE ?? (environment.interactive ? saved.workspaceId : undefined)
  if (!account && !workspaceId) {
    throw clientError("invalid_input", "Noninteractive workspace operations require --workspace or COPACKER_WORKSPACE.")
  }
  if (workspaceId && !z.uuid().safeParse(workspaceId).success) {
    throw clientError("invalid_input", "Workspace IDs must be UUIDs.")
  }
  const client = new CopackerClient({
    baseUrl,
    workspaceId,
    fetch: environment.fetch,
    token: environment.env.COPACKER_TOKEN ?? (() => profileToken(environment.store, profile, baseUrl))
  })
  return { client, profile, baseUrl, workspaceId }
}

async function deliverCredential(
  client: CopackerClient,
  result: SuccessEnvelope,
  options: Options,
  environment: CliEnvironment,
  sink?: Awaited<ReturnType<typeof secretFile>>
) {
  const data = z
    .object({
      credential: jsonObject,
      delivery: z.object({
        id: z.uuid(),
        state: z.enum(["available", "consumed", "expired"]),
        download: z.object({ url: z.string(), authentication: z.literal("interactive_required") })
      })
    })
    .parse(result.data)
  if (data.delivery.state !== "available") {
    throw clientError(
      "credential_delivery_unavailable",
      "The secret delivery is no longer available. Rotate or revoke the credential if it was not saved.",
      409,
      { credential: data.credential }
    )
  }
  try {
    const response = await client.transfer(data.delivery.download.url)
    const secret = z.object({ token: z.string().min(1).max(8192) }).parse(await response.json())
    if (sink) {
      await sink.write(secret.token)
    } else if (options.storeAs) {
      await environment.store.saveCredential(options.storeAs, { kind: "automation", accessToken: secret.token })
      await environment.store.saveProfile(options.storeAs, { baseUrl: client.baseUrl, workspaceId: client.workspaceId })
    }
  } catch {
    throw clientError(
      "credential_delivery_failed",
      "The credential may be active, but protected delivery did not finish. Inspect this credential and rotate or revoke it if necessary.",
      409,
      { credential: data.credential, deliveryId: data.delivery.id }
    )
  }
  return { ...result, data: { credential: data.credential, delivery: { id: data.delivery.id, completed: true } } }
}

async function execute(
  definition: CommandDefinition,
  options: Options,
  args: string[],
  environment: CliEnvironment
): Promise<{ result: SuccessEnvelope; code: number; format: "table" | "json" | "csv"; columns?: string[] }> {
  if (options.json && options.format && options.format !== "json") {
    throw clientError("invalid_input", "--json conflicts with --format.")
  }
  const format = options.json ? "json" : (options.format ?? "table")
  const waitTimeout = timeout(options)
  if (options.all && !definition.paged) {
    throw clientError("invalid_input", "--all is available only for paged collection reads.")
  }
  let raw: JsonObject = {}
  if (options.input) {
    const text = options.input === "-" ? await environment.stdin() : await readFile(options.input, "utf8")
    try {
      raw = parseInput(text)
    } catch {
      throw clientError("invalid_input", "Supply one JSON object with unique keys and no more than 1 MiB of input.")
    }
  }
  const built = buildInput(definition, options, args, raw)
  const account = definition.operation === "account.show" || definition.operation === "workspace.list"
  const { client, baseUrl, workspaceId } = await context(options, environment, account)
  const descriptor = await client.describe(definition.operation)
  if (descriptor.cliPath.join(".") !== definition.operation) {
    throw clientError("unsupported_contract", "The deployed command path does not match this CLI.", 409)
  }
  if (format === "csv" && !descriptor.execution.csvColumns?.length) {
    throw clientError("invalid_input", "This operation has no declared CSV projection.")
  }
  const mutation = !isQuery(descriptor, built.input)
  if (mutation && format === "csv") {
    throw clientError("invalid_input", "CSV stdout is available only for declared tabular reads.")
  }
  if (mutation && (definition.confirmation || descriptor.execution.confirmation) && !options.yes) {
    if (
      !environment.interactive ||
      !(await environment.confirm(`Run ${definition.operation.replaceAll(".", " ")} in workspace ${workspaceId}?`))
    ) {
      throw clientError("invalid_input", "This operation requires --yes in a noninteractive command.")
    }
  }
  const issuance = ["account.credential.create", "account.credential.rotate"].includes(definition.operation)
  if (issuance && (!!options.secretFile === !!options.storeAs || options.output)) {
    throw clientError(
      "invalid_input",
      "Choose exactly one protected sink: --secret-file or --store-as. Do not use --output."
    )
  }
  if (!issuance && (options.secretFile || options.storeAs)) {
    throw clientError("invalid_input", "Credential delivery options apply only to credential creation and rotation.")
  }
  let sink: Awaited<ReturnType<typeof secretFile>> | undefined
  let sinkCompleted = false
  if (issuance && options.secretFile) {
    sink = await secretFile(options.secretFile)
  }
  if (issuance && options.storeAs) {
    const probe = `probe-${randomUUID()}`
    await environment.store.saveCredential(probe, { kind: "automation", accessToken: "storage-availability-check" })
    await environment.store.clearCredential(probe)
  }
  try {
    let execution: Awaited<ReturnType<LocalStore["execution"]>> | undefined
    const uploadDigest = built.file ? await fileFingerprint(built.file) : undefined
    if (mutation || built.file) {
      // Receipt identity survives credential rotation: tokens and raw business inputs are never persisted.
      const accountResult = await client.call("account.show", {})
      const principal = z.object({ id: z.string().min(1) }).parse(accountResult.data).id
      const requestInput: JsonObject = { ...built.input }
      if (Array.isArray(requestInput.rows)) {
        requestInput.rows = [...requestInput.rows].sort((a, b) =>
          String(jsonObject.parse(a).rowId).localeCompare(String(jsonObject.parse(b).rowId), "en")
        )
      }
      if (options.expiresIn) {
        requestInput.expiresAt = `duration:${options.expiresIn}`
      }
      execution = await environment.store.execution(
        {
          baseUrl,
          workspaceId: workspaceId ?? null,
          principal,
          operation: definition.operation,
          input: requestInput,
          ...(uploadDigest ? { fileSha256: uploadDigest } : {})
        },
        options.idempotencyKey,
        typeof built.input.expiresAt === "string" ? built.input.expiresAt : undefined
      )
      if (options.expiresIn && execution.receipt.expiresAt) {
        built.input.expiresAt = execution.receipt.expiresAt
      }
      if (
        [
          "po.create",
          "product.create",
          "catalog.create",
          "partners.create",
          "address.create",
          "expense.create"
        ].includes(definition.operation) &&
        !built.input.clientReference
      ) {
        built.input.clientReference = execution.receipt.intentId
      }
      environment.stderr(`Execution key: ${execution.receipt.key}\n`)
    }
    const callOptions = { descriptor, idempotencyKey: execution?.receipt.key }
    let result: SuccessEnvelope
    if (built.file && execution) {
      result = await uploadFile(
        client,
        definition.operation,
        built.file,
        built.input,
        execution.receipt.key,
        execution.receipt.intentId,
        uploadDigest
      )
    } else if (options.all) {
      result = await client.all(definition.operation, built.input, callOptions)
    } else {
      result = await client.call(definition.operation, built.input, callOptions)
    }
    if (execution) {
      await environment.store.complete(execution)
    }
    if (options.wait) {
      result = await client.wait(result, waitTimeout)
    }
    if (issuance) {
      result = await deliverCredential(client, result, options, environment, sink)
      sinkCompleted = true
    }
    if (options.output) {
      const saved = await saveArtifact(client, result, options.output, !!options.overwrite)
      if (!saved) {
        const data = jsonObject.safeParse(result.data)
        if (data.success && Object.hasOwn(data.data, "artifactStatus")) {
          throw clientError("invalid_state", "The artifact is not ready. Repeat its entity command with --wait.", 409, {
            result: result.data
          })
        }
        await atomicWrite(options.output, render(result, format, descriptor.execution.csvColumns), !!options.overwrite)
      }
      environment.stderr(`Saved ${options.output}\n`)
    }
    return {
      result,
      code: options.requireComplete && result.meta.completeness !== "complete" ? 8 : 0,
      format,
      columns: descriptor.execution.csvColumns
    }
  } finally {
    if (sink && !sinkCompleted) {
      await sink.cancel().catch(() => undefined)
    }
  }
}

export function createProgram(environment: CliEnvironment, completed: (code: number) => void): Command {
  const program = new Command()
    .name("copacker")
    .description("Read and operate Copacker through its shared application contract.")
    .version("0.0.0")
    .option("--workspace <id>", "Workspace UUID.")
    .option("--profile <name>", "Stored login profile.")
    .option("--api-url <origin>", "Copacker API origin.")
    .option("--json", "One JSON result or error envelope.")
    .option("--format <format>", "Stdout format: table, json or csv.")
    .option("--input <path>", "Structured JSON file, or - for stdin.")
    .option("--output <path>", "Save output or an authorized artifact.")
    .option("--overwrite", "Replace an existing output file.")
    .option("--all", "Read every page.")
    .option("--require-complete", "Exit 8 for partial or unavailable data.")
    .option("--wait", "Wait through the entity's status operation.")
    .option("--timeout <seconds>", "Wait deadline, default 300 seconds.")
    .option("--dry-run", "Preview supported writes.")
    .option("--preview <id>", "Apply a reviewed immutable preview.")
    .option("--batch-id <id>", "Read this entity operation's retained batch.")
    .option("--export-id <id>", "Read this entity operation's retained export.")
    .option("--file-format <format>", "Artifact format, independent of stdout.")
    .option("--idempotency-key <key>", "Stable key for this logical mutation.")
    .option("--yes", "Confirm the command's explicit effects.")
    .option("--secret-file <absolute-path>", "Save a new credential in an owner-only file.")
    .option("--store-as <profile>", "Save a new credential in the operating-system store.")
  program.exitOverride()
  program.configureOutput({ writeOut: environment.stdout, writeErr: environment.stderr, outputError: () => undefined })
  program
    .command("login")
    .description("Sign in through the browser using PKCE.")
    .option("--no-browser", "Print the browser link without opening it.")
    .action(async (_: unknown, command: Command) => {
      const options = optionsSchema.parse(command.optsWithGlobals())
      const profile = options.profile ?? "default"
      const saved = await environment.store.profile(profile)
      const result = await login(
        environment.store,
        profile,
        options.apiUrl ?? environment.env.COPACKER_API_URL ?? saved.baseUrl,
        (text) => environment.stderr(`${text}\n`),
        options.browser !== false
      )
      environment.stdout(render(localResult(result), options.json ? "json" : "table"))
      completed(0)
    })
  program
    .command("logout")
    .description("Revoke and clear the selected interactive login.")
    .action(async (_: unknown, command: Command) => {
      const options = optionsSchema.parse(command.optsWithGlobals())
      const profile = options.profile ?? "default"
      const saved = await environment.store.profile(profile)
      const result = await logout(environment.store, profile, saved.baseUrl)
      environment.stdout(render(localResult(result), options.json ? "json" : "table"))
      completed(result.revoked ? 0 : 6)
    })
  const tree = new Map<string, Command>([["", program]])
  const group = (path: string[]): Command => {
    const key = path.join(".")
    const existing = tree.get(key)
    if (existing) {
      return existing
    }
    const parent = group(path.slice(0, -1))
    const node = parent.command(path.at(-1)!)
    tree.set(key, node)
    return node
  }
  group(["workspace"])
    .command("use")
    .argument("<id>")
    .description("Validate and save a local workspace default.")
    .action(async (id: string, _: unknown, command: Command) => {
      const options = optionsSchema.parse(command.optsWithGlobals())
      const { client, profile, baseUrl } = await context({ ...options, workspace: id }, environment)
      await client.call("workspace.show", {})
      await environment.store.saveProfile(profile, { baseUrl, workspaceId: id })
      environment.stdout(render(localResult({ workspaceId: id }, id), options.json ? "json" : "table"))
      completed(0)
    })
  for (const definition of commands) {
    const command = group(definition.operation.split(".")).description(definition.description)
    command.addHelpText(
      "after",
      `\nStructured input: --input <file> or --input -\nInspect fields: copacker schema show ${definition.operation}\nShared options such as --workspace, --json and --wait: copacker --help`
    )
    if (definition.positional) {
      command.argument(`[${definition.positional}]`, "May also be supplied through --input.")
    }
    if (definition.upload) {
      command.argument("[path]", "Local file to upload through this entity.")
    }
    for (const flag of definition.flags) {
      if (flag === "file-format") {
        continue
      }
      const repeat = flag === "scope" || (flag === "channel" && definition.operation === "report.restock")
      if (repeat) {
        command.option(`--${flag} <value>`, `${camel(flag)} (repeatable).`, (value: string, previous: unknown) => [
          ...z.array(z.string()).parse(previous ?? []),
          value
        ])
      } else {
        command.option(`--${flag}${booleanFlags.has(flag) ? "" : " <value>"}`, `${camel(flag)}.`)
      }
    }
    command.action(async (...values: unknown[]) => {
      const active = values.at(-1)
      if (!(active instanceof Command)) {
        throw clientError("internal_error", "Could not resolve the command.", 500)
      }
      const args = values.slice(0, -2).flatMap((value) => (typeof value === "string" ? [value] : []))
      const result = await execute(definition, optionsSchema.parse(active.optsWithGlobals()), args, environment)
      environment.stdout(render(result.result, result.format, result.columns))
      if (result.result.meta.completeness !== "complete") {
        environment.stderr(
          `Data coverage: ${result.result.meta.completeness}. Inspect JSON metadata for source details.\n`
        )
      }
      for (const warning of result.result.meta.warnings) {
        environment.stderr(`${safeMessage(warning.message)}\n`)
      }
      completed(result.code)
    })
  }
  return program
}

export async function runCli(argv: string[], overrides: Partial<CliEnvironment> = {}): Promise<number> {
  const environment = { ...defaults(), ...overrides }
  let code = 0
  const program = createProgram(environment, (value) => {
    code = value
  })
  try {
    await program.parseAsync(argv, { from: "user" })
    return code
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      return 0
    }
    let failure: CopackerError
    if (error instanceof CopackerError) {
      failure = error
    } else if (error instanceof CommanderError) {
      failure = clientError("invalid_input", error.message)
    } else if (error instanceof z.ZodError || error instanceof SyntaxError) {
      failure = clientError(
        "invalid_input",
        "Invalid input or configuration. Check the command schema and JSON fields."
      )
    } else {
      failure = clientError(
        "internal_error",
        "The command could not complete. Check local files and connectivity; any execution key has been retained.",
        500
      )
    }
    const json =
      argv.includes("--json") ||
      argv.includes("--format=json") ||
      argv.some((item, index) => item === "--format" && argv[index + 1] === "json")
    if (json) {
      environment.stdout(`${JSON.stringify(failure.envelope)}\n`)
    } else {
      environment.stderr(`${safeMessage(failure.envelope.error.message)}\n`)
    }
    return exitCode(failure.envelope.error, failure.status)
  }
}
