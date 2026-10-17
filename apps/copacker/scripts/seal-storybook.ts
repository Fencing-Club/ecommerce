import { execFileSync } from "node:child_process"
import path from "node:path"
import invariant from "tiny-invariant"
import { sealStorybookArtifact } from "./storybook-artifact"

const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
invariant(commit === process.env.APP_COMMIT_SHA, "Storybook checkout differs from the requested commit")
sealStorybookArtifact(path.resolve("storybook-static"), commit)
