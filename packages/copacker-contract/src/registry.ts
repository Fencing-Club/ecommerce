import { z } from "zod"
import {
  contractVersion,
  accountOperations,
  errorMetaSchema,
  errorSchema,
  id,
  isQuery,
  jsonObject,
  metaSchema,
  operationDescriptorSchema,
  type JsonObject,
  type OperationDescriptor
} from "./protocol.ts"

export interface OperationDefinition<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  descriptor: OperationDescriptor
  input: I
  output: O
}

export function defineOperation<I extends z.ZodType, O extends z.ZodType>(
  metadata: Omit<
    OperationDescriptor,
    "inputSchema" | "outputSchema" | "errorSchema" | "contractVersion" | "mcpName"
  > & { mcp?: boolean },
  input: I,
  output: O
): OperationDefinition<I, O> {
  const descriptor = operationDescriptorSchema.parse({
    ...metadata,
    contractVersion,
    mcpName: metadata.mcp === false ? null : `copacker_${metadata.operation.replaceAll(/[.-]/g, "_")}`,
    inputSchema: z.toJSONSchema(input, { io: "input" }),
    outputSchema: z.toJSONSchema(output),
    errorSchema: z.toJSONSchema(errorSchema)
  })
  return { descriptor, input, output }
}

export function createRegistry(definitions: readonly OperationDefinition[]) {
  const byName = new Map<string, OperationDefinition>()
  const paths = new Set<string>()
  const mcpNames = new Set<string>()
  for (const definition of definitions) {
    const { operation, cliPath, mcpName } = definition.descriptor
    const path = cliPath.join(" ")
    if (byName.has(operation) || paths.has(path) || (mcpName !== null && mcpNames.has(mcpName))) {
      throw new Error(`Duplicate operation, CLI path or MCP name: ${operation}`)
    }
    byName.set(operation, definition)
    paths.add(path)
    if (mcpName !== null) {
      mcpNames.add(mcpName)
    }
  }
  return {
    get: (name: string) => byName.get(name),
    list: () => [...byName.values()].map((item) => item.descriptor),
    async execute(name: string, input: JsonObject, handler: (input: unknown, mutation: boolean) => Promise<unknown>) {
      const definition = byName.get(name)
      if (!definition) {
        throw new Error(`Operation is not registered: ${name}`)
      }
      const parsed = jsonObject.parse(definition.input.parse(input))
      if (new TextEncoder().encode(JSON.stringify(parsed)).length > definition.descriptor.limits.maxInputBytes) {
        throw new Error("Operation input exceeds its declared byte limit.")
      }
      return definition.output.parse(await handler(parsed, !isQuery(definition.descriptor, parsed)))
    },
    openapi() {
      return {
        openapi: "3.1.0",
        info: { title: "Copacker operations", version: contractVersion },
        components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
        paths: Object.fromEntries(
          [...byName.values()].map(({ descriptor: d, input, output }) => {
            // Generate each whole envelope together: embedding separately generated schemas breaks their local $refs.
            // A schema resource ID keeps those refs local when this document is embedded in OpenAPI as well.
            const document = (schema: z.ZodType, part: string, io: "input" | "output" = "output") => ({
              ...z.toJSONSchema(schema, { io }),
              $id: `urn:copacker:${contractVersion}:${d.operation}:${part}`
            })
            const success = document(z.strictObject({ data: output, meta: metaSchema }), "result")
            const request = z.strictObject({ ...(d.context === "workspace" ? { workspaceId: id } : {}), input })
            const bootstrap = z.strictObject({ input: z.strictObject({ operation: z.enum(accountOperations) }) })
            const requestDocument = document(
              d.operation === "schema.show" ? z.union([request, bootstrap]) : request,
              "request",
              "input"
            )
            return [
              `/api/operations/${d.operation}`,
              {
                post: {
                  operationId: d.operation,
                  security: [{ bearer: [] }],
                  // A mutation takes its execution key in this header; repeating it with the same input replays the result.
                  ...(d.execution.kind === "mutation" && {
                    parameters: [
                      {
                        name: "Idempotency-Key",
                        in: "header",
                        // Read branches of exports/batches need no key; every actual mutation does.
                        required: d.execution.readBranches.length === 0,
                        description:
                          "Required for mutations; omit for a declared read branch. Reuse for the same logical execution.",
                        schema: { type: "string", pattern: "^[\\x21-\\x7e]{1,200}$" }
                      }
                    ]
                  }),
                  requestBody: {
                    required: true,
                    content: {
                      "application/json": {
                        schema: requestDocument
                      }
                    }
                  },
                  responses: {
                    "200": { description: "Operation result", content: { "application/json": { schema: success } } },
                    // Work that continues on the server returns its operation state, read again through its status query.
                    "202": { description: "Operation accepted", content: { "application/json": { schema: success } } },
                    default: {
                      description: "Operation error",
                      content: {
                        "application/json": {
                          schema: document(z.strictObject({ error: errorSchema, meta: errorMetaSchema }), "error")
                        }
                      }
                    }
                  }
                }
              }
            ]
          })
        )
      }
    }
  }
}
