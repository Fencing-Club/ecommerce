import { useTranslations } from "use-intl"
import { PageHeader } from "@/components/common"
import { DangerZone } from "@/components/danger-zone"
import { ExcludedOrderTags } from "@/components/excluded-order-tags"
import { IntegrationSection, IntegrationSyncSection } from "@/components/integration-panel"
import { Integrations } from "@/components/integrations"
import { InventoryLocations } from "@/components/inventory-locations"
import { MonthlyCosts } from "@/components/monthly-costs"
import { NoValue } from "@/components/no-value"
import { ProfileForm } from "@/components/profile-form"
import { SavedAddresses } from "@/components/saved-addresses"
import { LanguageForm, RestockSettingsForm, SupplierProfileForm, TimeZoneForm } from "@/components/settings-forms"
import { TeamSettings } from "@/components/team-settings"
import { Card, CardContent } from "@/components/ui/card"
import { isLocale } from "@/i18n/locales"
import { timeZoneLabel, timeZones } from "@/lib/time-zone"
import type { settingsPage } from "@/server/settings-page"

export default function Settings({ page }: { page: Awaited<ReturnType<typeof settingsPage>> }) {
  const {
    s,
    computerZone,
    buyer,
    supplier,
    admin,
    finances,
    restock,
    saved,
    profile,
    costs,
    currency,
    team,
    shopifyAccount,
    amazonAccount,
    ebayAccount,
    shopName,
    amazon,
    ebayName,
    orderTags,
    ownLocations,
    person,
    owned,
    computerLocale,
    amazonAdsAvailable,
    amazonSelfAuth
  } = page
  const t = useTranslations("settings")
  return (
    <>
      <PageHeader title={t("title")} />

      <div className="flex w-full max-w-5xl flex-col divide-y">
        <Section id="profile" title={t("profile.title")} description={s.user.email}>
          <ProfileForm
            profile={{
              firstName: person?.firstName ?? "",
              lastName: person?.lastName ?? "",
              position: person?.position ?? "",
              company: person?.company || s.org.name,
              ...(buyer && admin && { website: profile?.website ?? "" })
            }}
          />
        </Section>

        <Section id="language" title={t("language.title")} description={t("language.description")}>
          <LanguageForm locale={isLocale(person?.locale) ? person.locale : null} systemLocale={computerLocale} />
        </Section>

        <Section id="team" title={t("team.title")} description={t("team.description", { workspace: s.org.name })}>
          <TeamSettings
            {...team}
            admin={admin}
            owner={s.role === "owner"}
            you={s.user.id}
            workspace={s.org.name}
            kind={s.org.kind}
          />
        </Section>

        {buyer && (
          <Section id="integrations" title={t("integrations.title")} description={t("integrations.description")}>
            <Integrations
              amazonAdsAvailable={amazonAdsAvailable}
              admin={admin}
              amazonSelfAuth={amazonSelfAuth}
              shopify={
                shopifyAccount
                  ? { account: shopName ?? shopifyAccount.externalId, externalId: shopifyAccount.externalId }
                  : null
              }
              amazon={
                amazonAccount
                  ? {
                      account: amazon?.name ?? "Amazon",
                      externalId: amazonAccount.externalId,
                      marketplaces: amazon?.marketplaces ?? null,
                      health: amazon?.health ?? (amazon ? "connected" : "unavailable")
                    }
                  : null
              }
              shopifySettings={
                <>
                  <IntegrationSyncSection store="shopify" />
                  <IntegrationSection title={t("integrations.panel.preferencesTitle")}>
                    <div className="divide-y rounded-lg border bg-card">
                      <InventoryLocations />
                      <ExcludedOrderTags tags={s.org.excludedShopifyTags} suggestions={orderTags} />
                    </div>
                  </IntegrationSection>
                </>
              }
              ebay={
                ebayAccount
                  ? { account: ebayName ?? ebayAccount.externalId, externalId: ebayName ?? ebayAccount.externalId }
                  : null
              }
              ebaySettings={<IntegrationSyncSection store="ebay" />}
              amazonSettings={
                <>
                  <IntegrationSyncSection store="amazon" />
                </>
              }
            />
          </Section>
        )}

        {buyer && (
          <Section id="restock" title={t("restock.title")} description={t("restock.description")}>
            {admin ? (
              <RestockSettingsForm salesDays={restock.days} leadTimeDays={restock.leadTimeDays} />
            ) : (
              <Values
                values={[
                  { label: t("restock.salesPeriod"), value: t("restock.days", { count: restock.days }) },
                  { label: t("restock.leadTime"), value: t("restock.days", { count: restock.leadTimeDays }) }
                ]}
              />
            )}
          </Section>
        )}

        {buyer && (
          <Section id="time-zone" title={t("timeZone.title")} description={t("timeZone.description")}>
            {admin ? (
              <TimeZoneForm
                timeZone={s.org.timeZone}
                computerZone={computerZone}
                zones={timeZones().map((zone) => ({ value: zone, label: timeZoneLabel(zone) }))}
              />
            ) : (
              <Values
                values={[
                  {
                    label: t("timeZone.label"),
                    value: s.org.timeZone
                      ? timeZoneLabel(s.org.timeZone)
                      : t("timeZone.automaticZone", { zone: timeZoneLabel(computerZone) })
                  }
                ]}
              />
            )}
          </Section>
        )}

        {finances && (
          <Section id="monthly-costs" title={t("monthlyCosts.title")} description={t("monthlyCosts.description")}>
            <MonthlyCosts costs={costs} currency={currency} admin={admin} />
          </Section>
        )}

        {supplier && (
          <Section
            id="supplier-profile"
            title={t("supplierProfile.title")}
            description={t("supplierProfile.description")}
          >
            {admin ? (
              <SupplierProfileForm
                contactName={profile?.contactName ?? ""}
                contactEmail={profile?.contactEmail ?? ""}
                phoneNumber={profile?.phoneNumber ?? ""}
                website={profile?.website ?? ""}
              />
            ) : (
              <Values
                values={[
                  { label: t("supplierProfile.contactName"), value: profile?.contactName || <NoValue /> },
                  { label: t("supplierProfile.contactEmail"), value: profile?.contactEmail || <NoValue /> },
                  { label: t("supplierProfile.phone"), value: profile?.phoneNumber || <NoValue /> },
                  { label: t("supplierProfile.website"), value: profile?.website || <NoValue /> }
                ]}
              />
            )}
          </Section>
        )}

        <Section
          id="addresses"
          title={supplier ? t("addresses.pickupTitle") : t("addresses.title")}
          description={supplier ? t("addresses.pickupDescription") : t("addresses.description")}
        >
          <SavedAddresses contacts={saved} supplier={supplier} locations={ownLocations} admin={admin} />
        </Section>

        <Section id="delete" title={t("delete.title")} description={t("delete.description")}>
          <DangerZone
            workspace={s.org.name}
            kind={s.org.kind}
            owner={s.role === "owner"}
            email={s.user.email}
            handOver={owned.handOver.map((workspace) => workspace.name)}
            closing={owned.closing.map((workspace) => workspace.name)}
          />
        </Section>
      </div>
    </>
  )
}

function Section({
  id,
  title,
  description,
  children
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-20 gap-4 py-8 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={`${id}-title`} className="font-semibold">
          {title}
        </h2>
        <p className="text-sm break-words text-muted-foreground">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  )
}

// Settings only owners and admins change, as the rest of the team sees them.
function Values({ values }: { values: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <Card>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          {values.map(({ label, value }) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
