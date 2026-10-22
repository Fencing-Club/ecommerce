// Saves a file the browser already holds, such as a PDF it fetched or a CSV it built, under `filename`. The object URL
// is revoked a minute later, not right after the click: some browsers cancel a download whose URL goes before it starts.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// Reads an API response that sends a file, for an RTK Query `responseHandler`: the file itself, or the JSON error the
// API sends instead, so its message shows.
export function fileOrError(response: Response): Promise<unknown> {
  return response.ok ? response.blob() : response.json()
}
