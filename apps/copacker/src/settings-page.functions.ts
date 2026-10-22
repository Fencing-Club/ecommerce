import { createServerFn } from "@tanstack/react-start"
import { pageResult } from "@/server/page-result"
import { settingsPage } from "@/server/settings-page"
export const readSettings = createServerFn().handler(() => pageResult(settingsPage, "settings.title"))
