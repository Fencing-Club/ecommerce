import { z } from "zod"
import { runPreview } from "./preview-runner"

await runPreview(z.enum(["deploy", "remove", "discover"]).parse(process.argv[2]))
