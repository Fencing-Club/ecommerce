import { storyIntl } from "../intl"

// Browser stories use the toolbar's localization instead of Node/Workers request storage.
export async function localization() {
  return storyIntl()
}

export async function requestLocale() {
  return storyIntl().locale
}
