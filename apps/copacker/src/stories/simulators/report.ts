// The codes a simulator's issue report lists, each once, in the order validatePacking reported them.
export function reportedCodes(canvasElement: HTMLElement) {
  const rows = canvasElement.querySelectorAll('section[aria-label="Issues"] tbody tr')
  return [...new Set([...rows].map((row) => row.firstElementChild?.textContent ?? ""))]
}
