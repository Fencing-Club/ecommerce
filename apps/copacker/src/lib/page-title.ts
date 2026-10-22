// Every page's document title: the page's own, then the app's name. A page without one is just "Copacker".
export function pageTitle(title?: string) {
  return title ? `${title} | Copacker` : "Copacker"
}
