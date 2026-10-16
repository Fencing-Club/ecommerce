import { z } from "zod"
import { runPreview } from "./preview-runner"

await runPreview(z.enum(["deploy", "remove", "sweep"]).parse(process.argv[2]))
