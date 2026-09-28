import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Legal, Rows } from "@/components/marketing/legal"
import { serverStory } from "@/stories/server"

// The privacy page (page.tsx) as it renders. Its text is the page, so it's copied here whole: change the two together.
//
// What Copacker does with personal and marketplace data, written from what the code does: the sign-in, the stores it
// reads (never a customer's contact details), the providers that run it, and the cookies it sets. Amazon's, Amazon Ads'
// and eBay's developer programs read the marketplace data section. Change the text with the code it describes, and
// the date with the text.
async function PrivacyPage() {
  const t = await getTranslations("legal")
  const contact = <Link href="/contact">contact page</Link>
  return (
    <Legal
      title={t("privacy.title")}
      updated="2026-09-28"
      lead="This policy explains what Copacker collects, how we use it, who helps us run the service, and the choices you have. It covers copacker.ai, the Copacker app and the emails we send."
      sections={[
        {
          id: "summary",
          title: "The short version",
          content: (
            <ul>
              <li>
                We use your information to run Copacker for you. We don’t sell it, and we don’t use it for advertising.
              </li>
              <li>
                We use data from Amazon, Shopify, eBay and the other services you connect only to provide Copacker to
                you.
              </li>
              <li>We don’t keep your customers’ names, email addresses, phone numbers or addresses.</li>
              <li>
                We share information only with the providers that run Copacker, the people you work with in it, and when
                the law requires it.
              </li>
              <li>You can ask for a copy of your information, or ask us to delete it, through the {contact}.</li>
            </ul>
          )
        },
        {
          id: "collect",
          title: "What we collect",
          content: (
            <>
              <h3 id="collect-account">Your account</h3>
              <p>
                Your name, email address, position and company. If you sign in with Google or Microsoft, they share your
                name and email address with us. Your password goes to WorkOS, our sign-in provider; Copacker never
                stores it.
              </p>
              <h3 id="collect-workspace">Your workspace</h3>
              <p>
                What you and your team add to Copacker: your company’s details and addresses; your suppliers and
                forwarders, with their contact names, email addresses, phone numbers and addresses; products, prices,
                catalogs and stock; purchase orders, shipments, costs and comments; and the files you upload, such as
                commercial invoices, labels, product photos and price lists.
              </p>
              <h3 id="collect-services">Services you connect</h3>
              <p>When you connect a store or marketplace, you let Copacker read the data it needs from it:</p>
              <ul>
                <li>
                  <strong>Amazon</strong>, through the Selling Partner API: your seller account and marketplaces,
                  listings, FBA and AWD inventory, orders, fees and payments, and inbound shipments.
                </li>
                <li>
                  <strong>Amazon Ads</strong>, when you connect it: your advertising accounts and campaigns, with their
                  spend and sales by product.
                </li>
                <li>
                  <strong>Shopify</strong>: your store, products, locations, inventory, orders and Shopify Payments
                  transactions.
                </li>
                <li>
                  <strong>eBay</strong>, when you connect it: your orders and inventory.
                </li>
              </ul>
              <p>
                From your orders, we keep what planning needs: order numbers and dates, products, quantities, prices,
                fees and fulfillment status. For Shopify orders, we also keep the customer’s ID number, so repeat
                customers can be counted. We don’t keep your customers’ names, email addresses, phone numbers or
                addresses.
              </p>
              <p>We also keep the credentials each service gives us when you connect it, encrypted.</p>
              <h3 id="collect-messages">Messages and the waitlist</h3>
              <p>
                The contact form sends us your name, email address, company and message. The waitlist keeps your email
                address and the language you read the site in.
              </p>
              <h3 id="collect-usage">When you use Copacker</h3>
              <p>
                Our servers and providers receive your IP address and browser details with each request. WorkOS uses
                them to protect sign-in, and we use them to slow down repeated form submissions. Copacker also sets a
                few cookies, described in <a href="#cookies">Cookies</a>.
              </p>
            </>
          )
        },
        {
          id: "use",
          title: "How we use it",
          content: (
            <>
              <ul>
                <li>
                  To run Copacker: sign you in, forecast your stock, plan restocks, prepare purchase orders, shipments,
                  labels and documents, and show your sales and costs.
                </li>
                <li>
                  To make the changes you ask for in the services you connect, such as creating an Amazon inbound
                  shipment or updating a product’s cost in Shopify.
                </li>
                <li>
                  To send the emails Copacker needs: sign-in codes, password resets, invitations, purchase orders and
                  notices when labels are ready.
                </li>
                <li>To keep Copacker secure, prevent abuse and fix problems.</li>
                <li>To answer your messages, and to email you about the waitlist if you joined it.</li>
                <li>To meet our legal obligations.</li>
              </ul>
              <p>
                Where the law requires a legal basis, we rely on our contract with you to provide the service, our
                legitimate interest in keeping Copacker secure and working, your consent for the waitlist, and our legal
                obligations.
              </p>
              <p>
                We don’t sell your information, we don’t use it for advertising, and we don’t use it to train AI models.
              </p>
            </>
          )
        },
        {
          id: "ai",
          title: "AI features",
          content: (
            <p>
              When you import a document, such as a supplier’s order confirmation, Copacker sends it through OpenRouter
              to an AI model, which reads it into a draft purchase order for you to review. To match its lines, the
              model looks up products in your catalog. The document and those lookups go to the model only for that
              import.
            </p>
          )
        },
        {
          id: "marketplace-data",
          title: "Amazon and marketplace data",
          content: (
            <>
              <p>
                This covers data from Amazon, through the Selling Partner API and the Amazon Ads API, and from Shopify,
                eBay and any other store or marketplace you connect.
              </p>
              <ul>
                <li>
                  We use it only to provide Copacker to you: your forecasts, purchase orders, shipments, labels and
                  reports.
                </li>
                <li>We never sell it, and we don’t use it for advertising or marketing, ours or anyone else’s.</li>
                <li>We never use it to contact your customers, and we don’t keep their personal information.</li>
                <li>
                  We share it only with the providers that run Copacker, listed below, and with the people you give
                  access: your team, and the suppliers and forwarders you share a purchase order with. We disclose it
                  otherwise only when the law requires it.
                </li>
                <li>
                  We read only what Copacker needs, and act in your accounts only to do what you ask, such as creating
                  an inbound shipment.
                </li>
                <li>
                  You can disconnect a service in Settings at any time. We then delete its credentials and stop reading
                  from it.
                </li>
              </ul>
            </>
          )
        },
        {
          id: "sharing",
          title: "Who we share it with",
          content: (
            <>
              <p>The providers that run Copacker process information for us, only to provide the service:</p>
              <Rows
                rows={[
                  [
                    "WorkOS",
                    "Sign-in and accounts: passwords, sign-in with Google or Microsoft, single sign-on, checks that protect sign-in, and the waitlist."
                  ],
                  ["Railway", "Hosting: runs Copacker, and stores its database, documents and logs."],
                  ["Cloudflare", "Carries and protects traffic to copacker.ai, and serves the site’s video."],
                  ["Amazon Web Services", "Delivers notifications from Amazon and Shopify to Copacker."],
                  ["Resend", "Sends Copacker’s emails."],
                  [
                    "OpenRouter",
                    "Passes documents you import to the AI model that reads them, currently Anthropic’s Claude."
                  ],
                  [
                    "Langfuse",
                    "Keeps the instructions the import model follows, and records how each import ran, never what the document said."
                  ]
                ]}
              />
              <p>Other people see your information only as you choose:</p>
              <ul>
                <li>
                  <strong>Your team</strong> sees your workspace, as its owner and admins allow.
                </li>
                <li>
                  <strong>Suppliers and forwarders</strong> see the purchase orders and shipments you share with them,
                  not your sales or the other costs you record.
                </li>
                <li>
                  <strong>The services you connect</strong>, such as Amazon and Shopify, receive what Copacker sends
                  them for you.
                </li>
                <li>
                  <strong>AI agents and tools you connect</strong> can read and change your workspace’s data with your
                  access. Their providers handle what they receive under their own terms.
                </li>
              </ul>
              <p>
                We may also disclose information when the law requires it, or to protect Copacker, our users or others
                from harm or fraud. If Copacker is merged, acquired or sold, your information may transfer with it, and
                this policy will still apply to it.
              </p>
            </>
          )
        },
        {
          id: "cookies",
          title: "Cookies",
          content: (
            <>
              <p>Copacker uses only the cookies it needs to work:</p>
              <ul>
                <li>A session cookie that keeps you signed in.</li>
                <li>One that remembers the workspace you have open.</li>
                <li>Short-lived ones that hold a sign-in or an invitation in progress, for up to 10 minutes.</li>
                <li>One with your computer’s time zone, and one that remembers whether the app’s sidebar is open.</li>
              </ul>
              <p>
                Your choice of light or dark theme stays in your browser’s local storage. We don’t use analytics or
                advertising cookies, and we don’t track you across other websites.
              </p>
            </>
          )
        },
        {
          id: "retention",
          title: "How long we keep it",
          content: (
            <ul>
              <li>
                <strong>Your account and workspaces:</strong> while they’re open. Ask us to delete them, and we’ll
                delete the information in them, except what the law requires us to keep.
              </li>
              <li>
                <strong>Data from services you connect:</strong> while the workspace is open, unless you ask us to
                delete it sooner. Disconnecting a service deletes its credentials right away. When a Shopify store
                uninstalls Copacker, we erase what we copied from it when Shopify asks, 48 hours later.
              </li>
              <li>
                <strong>Store notifications:</strong> notifications from Amazon and Shopify can include a customer’s
                details, so they’re deleted once Copacker has processed them, or after 14 days at most if it can’t.
              </li>
              <li>
                <strong>Your messages to us:</strong> as long as we need them to help you.
              </li>
              <li>
                <strong>The waitlist:</strong> until you leave it.
              </li>
            </ul>
          )
        },
        {
          id: "security",
          title: "Security",
          content: (
            <>
              <ul>
                <li>Copacker is served over encrypted connections (HTTPS).</li>
                <li>Credentials for the services you connect are encrypted before they’re stored.</li>
                <li>Your password is held by WorkOS, never by Copacker.</li>
                <li>
                  Documents are kept in private storage, and Copacker checks that you may see one before sending it.
                </li>
                <li>People see only the workspaces they belong to, and members only the pages they’re given.</li>
              </ul>
              <p>
                No service can promise perfect security. If a breach affects your information, we’ll tell you as the law
                requires.
              </p>
            </>
          )
        },
        {
          id: "rights",
          title: "Your rights and choices",
          content: (
            <>
              <p>
                Depending on where you live, you may have the right to access, correct or delete your information, to
                get a copy of it, to object to or restrict how we use it, and to withdraw consent you gave. To use these
                rights, write to us through the {contact}. We’ll confirm it’s you before we act, and we won’t treat you
                differently for asking.
              </p>
              <p>You can also:</p>
              <ul>
                <li>Change your name, position and company in Settings.</li>
                <li>Disconnect a store or marketplace in Settings.</li>
                <li>Leave the waitlist at any time, from any of its emails or through the contact page.</li>
              </ul>
              <p>
                If your information is in a workspace someone else runs, such as a buyer’s, we may pass your request to
                them. You can also complain to your local data protection authority.
              </p>
            </>
          )
        },
        {
          id: "children",
          title: "Children",
          content: (
            <p>
              Copacker is a service for businesses. It isn’t meant for children, and we don’t knowingly collect
              information from anyone under 16. If you think a child has given us information, tell us through the{" "}
              {contact} and we’ll delete it.
            </p>
          )
        },
        {
          id: "transfers",
          title: "International transfers",
          content: (
            <p>
              Our providers process information in the United States and other countries, which may have different data
              protection laws than where you live. Wherever it’s processed, we protect it as this policy describes.
            </p>
          )
        },
        {
          id: "changes",
          title: "Changes to this policy",
          content: (
            <p>
              We’ll post any change here and update the date at the top. If a change affects you significantly, we’ll
              tell you by email or in Copacker before it takes effect.
            </p>
          )
        },
        {
          id: "contact",
          title: "Contact",
          content: <p>Questions or requests about your information? Write to us through the {contact}.</p>
        }
      ]}
    />
  )
}

const meta = preview.meta({
  title: "Pages/Marketing/Privacy",
  ...serverStory(PrivacyPage),
  parameters: { layout: "fullscreen" }
})

const sections = [
  "The short version",
  "What we collect",
  "How we use it",
  "AI features",
  "Amazon and marketplace data",
  "Who we share it with",
  "Cookies",
  "How long we keep it",
  "Security",
  "Your rights and choices",
  "Children",
  "International transfers",
  "Changes to this policy",
  "Contact"
]

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible()
    await expect(canvas.getByText("September 28, 2026")).toHaveAttribute("dateTime", "2026-09-28")
    // Every section is in the contents, in order, linked to its anchor.
    const [contents] = canvas.getAllByRole("navigation", { name: "Contents" })
    if (!contents) {
      throw new Error("The page has its contents")
    }
    const links = within(contents).getAllByRole("link")
    await expect(links.map((link) => link.textContent)).toEqual(sections)
    for (const link of links) {
      const id = link.getAttribute("href")?.slice(1) ?? ""
      await expect(document.getElementById(id)).toHaveAttribute("aria-labelledby", `${id}-title`)
    }
    // The providers that run Copacker, and the way to ask about your information.
    const sharing = within(canvas.getByRole("region", { name: "Who we share it with" }))
    await expect(sharing.getByText("WorkOS").tagName).toBe("DT")
    await expect(sharing.getByText("Resend")).toBeVisible()
    for (const link of canvas.getAllByRole("link", { name: "contact page" })) {
      await expect(link).toHaveAttribute("href", "/contact")
    }
    for (const link of canvas.getAllByRole("link", { name: "Cookies" })) {
      await expect(link).toHaveAttribute("href", "#cookies")
    }
  }
})

export const Phone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const toggle = canvas.getByText("Contents", { selector: "summary" })
    await userEvent.click(toggle)
    const folded = toggle.closest("details")
    await expect(folded).toHaveAttribute("open")
    if (!folded) {
      throw new Error("The contents fold")
    }
    await expect(within(folded).getAllByRole("link")).toHaveLength(sections.length)
  }
})
