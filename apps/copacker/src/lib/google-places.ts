let loading: Promise<void> | undefined

// Google is a browser-only dependency, shared by every address form in this document. A failed load can be retried.
export function loadGooglePlaces(key: string) {
  return (loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.id = "google-places"
    script.async = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&v=weekly`
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener(
      "error",
      () => {
        loading = undefined
        script.remove()
        reject(new Error("Address suggestions could not load"))
      },
      { once: true }
    )
    document.head.appendChild(script)
  }))
}
