import { createServerFn } from "@tanstack/react-start"
import { match } from "ts-pattern"
import { createTranslator } from "use-intl"
import { z } from "zod"
import { localization } from "@/server/localization"
import { maintenanceActive } from "@/server/maintenance"
import { appUrl } from "@/server/security"

export const readDocument = createServerFn()
  .validator(z.string().max(2048))
  .handler(async ({ data: pathname }) => {
    const config = await localization()
    const { common, marketing, auth, validation, onboarding, legal, navigation } = config.messages
    const publicPage = [
      "/",
      "/contact",
      "/privacy",
      "/terms",
      "/unsubscribe",
      "/setup",
      "/maintenance",
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/invite",
      "/onboarding",
      "/workspaces/new"
    ].includes(pathname)
    const t = createTranslator(config)
    const marketingPage = ["/", "/contact", "/privacy", "/terms"].includes(pathname)
    const { title, description } = match(pathname)
      .with("/", () => ({ title: t("marketing.metadata.title"), description: t("marketing.metadata.description") }))
      .with("/contact", () => ({
        title: t("marketing.contact.metadata.title"),
        description: t("marketing.contact.metadata.description")
      }))
      .with("/privacy", () => ({
        title: t("legal.privacy.metadata.title"),
        description: t("legal.privacy.metadata.description")
      }))
      .with("/terms", () => ({
        title: t("legal.terms.metadata.title"),
        description: t("legal.terms.metadata.description")
      }))
      .otherwise(() => ({ title: "Copacker", description: t("common.appDescription") }))
    return {
      ...config,
      messages: publicPage ? { common, marketing, auth, validation, onboarding, legal, navigation } : config.messages,
      maintenance: maintenanceActive(),
      head: {
        meta: [
          { title },
          { name: "description", content: description },
          ...(marketingPage
            ? [
                { property: "og:type", content: "website" },
                { property: "og:site_name", content: "Copacker" },
                { property: "og:title", content: title },
                { property: "og:description", content: description },
                { property: "og:image", content: new URL("/marketing/og.jpg", appUrl()).href },
                { name: "twitter:card", content: "summary_large_image" },
                { name: "twitter:title", content: title },
                { name: "twitter:description", content: description },
                { name: "twitter:image", content: new URL("/marketing/og.jpg", appUrl()).href }
              ]
            : [{ name: "robots", content: "noindex, nofollow" }])
        ],
        links: [
          { rel: "icon", href: "/favicon.ico" },
          { rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
          { rel: "apple-touch-icon", href: "/apple-icon.png" },
          ...(marketingPage ? [{ rel: "canonical", href: new URL(pathname, appUrl()).href }] : [])
        ]
      }
    }
  })
