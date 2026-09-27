// Writes one line of progress to the process output, with the time, for a person watching the worker (or its service
// logs). Failures still go to console.error.
export function logLine(message: string) {
  const time = new Date().toTimeString().slice(0, 8)
  // Progress isn't a warning or an error, so it's logged as plain output.
  // oxlint-disable-next-line no-console
  console.log(`${time} ${message}`)
}
