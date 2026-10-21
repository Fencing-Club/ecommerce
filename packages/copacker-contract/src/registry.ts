import { z } from "zod"
import {
  contractVersion,
  errorSchema,
  isQuery,
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
    mcpName: metadata.mcp === false ? null : metadata.operation.replaceAll(/[.-]/g, "_"),
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
      const parsed = definition.input.parse(input)
      return definition.output.parse(await handler(parsed, !isQuery(definition.descriptor, input)))
    },
    openapi() {
      return {
        openapi: "3.1.0",
        info: { title: "Copacker operations", version: contractVersion },
        components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
        paths: Object.fromEntries(
          [...byName.values()].map(({ descriptor: d }) => [
            `/api/operations/${d.operation}`,
            {
              post: {
                operationId: d.operation,
                security: [{ bearer: [] }],
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          ...(d.context === "workspace" ? { workspaceId: { type: "string", format: "uuid" } } : {}),
                          input: d.inputSchema
                        },
                        required: d.context === "workspace" ? ["workspaceId", "input"] : ["input"]
                      }
                    }
                  }
                },
                responses: {
                  "200": {
                    description: "Operation result",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { data: d.outputSchema, meta: { type: "object" } },
                          required: ["data", "meta"]
                        }
                      }
                    }
                  },
                  default: {
                    description: "Operation error",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { error: d.errorSchema, meta: { type: "object" } },
                          required: ["error", "meta"]
                        }
                      }
                    }
                  }
                }
              }
            }
          ])
        )
      }
    }
  }
}
