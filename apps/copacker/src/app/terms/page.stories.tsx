import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Legal } from "@/components/marketing/legal"
import { serverStory } from "@/stories/server"

// The terms page (page.tsx) as it renders. Its text is the page, so it's copied here whole: change the two together.
//
// The terms for using Copacker. The company's legal name, address and governing law aren't settled yet, so the clauses
// that need them are left out until they are. Fees follow the marketing page: free for now, with no promise it stays so.
async function TermsPage() {
  const t = await getTranslations("legal")
  const contact = <Link href="/contact">contact page</Link>
  return (
    <Legal
      title={t("terms.title")}
      updated="2026-09-27"
      lead="These terms are the agreement between you and Copacker for using copacker.ai and the Copacker app. By creating an account or using Copacker, you accept them. If you use Copacker for a company, you accept them on its behalf and confirm you’re allowed to, and “you” includes the company."
      sections={[
        {
          id: "service",
          title: "The service",
          content: (
            <>
              <p>
                Copacker forecasts a seller’s inventory, helps send purchase orders to suppliers just in time, and
                prepares the handoffs to freight forwarders, Amazon FBA and AWD, and the seller’s own locations, with
                the labels and documents they need. Suppliers and forwarders use Copacker to work on the purchase orders
                shared with them.
              </p>
              <p>
                We keep improving Copacker, so we may add, change, or remove features. Some may be early versions that
                are still being finished.
              </p>
            </>
          )
        },
        {
          id: "accounts",
          title: "Accounts and workspaces",
          content: (
            <ul>
              <li>You need to be at least 18 and able to enter into a contract to use Copacker.</li>
              <li>Give accurate information when you sign up, and keep it current.</li>
              <li>
                Keep your sign-in secure. You’re responsible for what happens in your account, so tell us through the{" "}
                {contact} if you think someone else has used it.
              </li>
              <li>
                A workspace belongs to the company it’s for. Its owner and admins decide who joins, what members can see
                and do, and which services it connects, and they’re responsible for the people they invite.
              </li>
            </ul>
          )
        },
        {
          id: "responsibilities",
          title: "Your responsibilities",
          content: (
            <>
              <ul>
                <li>
                  <strong>Your connected accounts.</strong> You’re responsible for your Amazon, Shopify, eBay, carrier
                  and other accounts you use with Copacker, and for following their terms and policies. Copacker acts in
                  them on your instructions.
                </li>
                <li>
                  <strong>What you enter.</strong> Keep products, quantities, prices, dimensions, weights, addresses and
                  lead times accurate. Copacker’s plans, labels, and documents are only as right as the information
                  they’re made from.
                </li>
                <li>
                  <strong>Labels and documents.</strong> Check every label and document before you use it: purchase
                  orders, packing lists, product, carton, and shipping labels, commercial invoices, and anything you
                  give a carrier, forwarder, or customs, such as a bill of lading or a customs declaration.
                </li>
                <li>
                  <strong>Your shipments.</strong> You’re responsible for what you ship and how it’s packed and labeled,
                  and for customs, duties, taxes, and the rules that apply to your products.
                </li>
                <li>
                  <strong>Forecasts.</strong> Forecasts, reorder dates, quantities, and costs are estimates from your
                  data, not guarantees. The decisions you make with them are yours.
                </li>
              </ul>
              <p>
                If you’re a supplier or a forwarder, the same goes for what you enter and upload, such as prices, stock,
                commercial invoices, and tracking numbers.
              </p>
            </>
          )
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          content: (
            <>
              <p>Don’t use Copacker to:</p>
              <ul>
                <li>Break the law, or infringe or violate anyone’s rights.</li>
                <li>Break the terms or policies of Amazon, Shopify, eBay, a carrier, or another service.</li>
                <li>Send spam, or invite people who don’t expect to hear from you.</li>
                <li>Upload malware, or content you don’t have the right to share.</li>
                <li>
                  Get into accounts, workspaces, or data that aren’t yours, or test or get around Copacker’s security.
                </li>
                <li>Overload Copacker, or copy or scrape it by automated means other than the tools we provide.</li>
                <li>Resell or rent Copacker to others without our permission.</li>
              </ul>
            </>
          )
        },
        {
          id: "your-data",
          title: "Your data",
          content: (
            <>
              <p>
                You own the data you put into Copacker or connect to it. We claim no rights to it beyond the permission
                you give us here: to host, copy, process, send, and display it only to provide, secure, and support
                Copacker for you, as the <Link href="/privacy">privacy policy</Link> describes.
              </p>
              <p>
                You’re responsible for having the right to the data you add, including other people’s details, such as
                your suppliers’ contacts.
              </p>
              <p>If you send us feedback or ideas, we may use them without any obligation to you.</p>
            </>
          )
        },
        {
          id: "other-services",
          title: "Other services",
          content: (
            <>
              <p>
                Copacker works with services that others run, such as Amazon, Shopify, eBay, carriers, freight
                forwarders and AI providers. Their own terms govern your use of them. We aren’t responsible for them,
                including their availability or changes to them that affect Copacker.
              </p>
              <p>Copacker isn’t affiliated with, endorsed by, or sponsored by Amazon, Shopify, or eBay.</p>
              <p>
                Amazon and all related marks are trademarks of Amazon.com, Inc. or its affiliates. Shopify is a
                trademark of Shopify Inc., and eBay is a trademark of eBay Inc. Other names are trademarks of their
                owners, used here only to say what Copacker works with.
              </p>
            </>
          )
        },
        {
          id: "ai",
          title: "AI features",
          content: (
            <>
              <p>
                Some features use AI, such as reading a document you import into a draft purchase order. AI can get
                things wrong, so check its results before you rely on them. An imported document becomes a purchase
                order only after you review and save it.
              </p>
              <p>
                AI agents and tools you connect to Copacker act with your access, and you’re responsible for what they
                do in your workspace.
              </p>
              <p>We don’t use your data to train AI models.</p>
            </>
          )
        },
        {
          id: "fees",
          title: "Fees",
          content: (
            <>
              <p>
                Copacker is free to use today. There are no paid plans, and signing up doesn’t ask for a card. We may
                introduce paid plans or features later. If we do, we’ll tell you first, and nothing will cost you money
                unless you agree to it.
              </p>
              <p>
                The services you connect may charge you for what Copacker does in them for you, such as Amazon’s fees
                for inbound shipments or a carrier’s charges. Those fees are yours.
              </p>
            </>
          )
        },
        {
          id: "availability",
          title: "Availability",
          content: (
            <p>
              We work to keep Copacker available and reliable, but we can’t promise it will always be available or free
              of errors. It may be interrupted for maintenance, updates, or reasons outside our control, including
              problems at the services it relies on. If we decide to stop offering Copacker, we’ll tell you in advance.
            </p>
          )
        },
        {
          id: "termination",
          title: "Suspension and termination",
          content: (
            <>
              <p>You can stop using Copacker at any time, and ask us to delete your account through the {contact}.</p>
              <p>
                We may suspend or end your access if you break these terms, if your use puts Copacker, its users or
                others at risk, or if the law requires it. When we reasonably can, we’ll tell you first and give you a
                chance to fix the problem.
              </p>
              <p>
                The parts of these terms that by their nature should last after your access ends do, including Your
                data, Disclaimers, and Limitation of liability.
              </p>
            </>
          )
        },
        {
          id: "disclaimers",
          title: "Disclaimers",
          content: (
            <p>
              Copacker is provided “as is” and “as available.” To the fullest extent the law allows, we make no
              warranties, express or implied, including warranties of merchantability, fitness for a particular purpose,
              title and non-infringement. We don’t warrant that forecasts, labels, documents or data from other services
              will be accurate, complete or fit for your purpose.
            </p>
          )
        },
        {
          id: "liability",
          title: "Limitation of liability",
          content: (
            <>
              <p>
                To the fullest extent the law allows, Copacker isn’t liable for indirect, incidental, special,
                consequential or punitive damages, or for lost profits, revenue, sales or data, stockouts, excess stock,
                shipping delays, or fees and penalties charged by other services, even if we were told they were
                possible.
              </p>
              <p>
                Our total liability for any claim relating to Copacker or these terms is limited to the greater of what
                you paid us for Copacker in the 12 months before the claim and US$100.
              </p>
              <p>Some places don’t allow some of these limits, so they may not all apply to you.</p>
            </>
          )
        },
        {
          id: "changes",
          title: "Changes to these terms",
          content: (
            <p>
              We may update these terms. We’ll post the new version here with a new date, and tell you by email or in
              Copacker before a significant change takes effect. If you keep using Copacker after that, you accept the
              new terms. If you don’t, stop using Copacker and ask us to delete your account.
            </p>
          )
        },
        {
          id: "contact",
          title: "Contact",
          content: <p>Questions about these terms? Write to us through the {contact}.</p>
        }
      ]}
    />
  )
}

const meta = preview.meta({
  title: "Pages/Marketing/Terms",
  ...serverStory(TermsPage),
  parameters: { layout: "fullscreen" }
})

const sections = [
  "The service",
  "Accounts and workspaces",
  "Your responsibilities",
  "Acceptable use",
  "Your data",
  "Other services",
  "AI features",
  "Fees",
  "Availability",
  "Suspension and termination",
  "Disclaimers",
  "Limitation of liability",
  "Changes to these terms",
  "Contact"
]

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible()
    await expect(canvas.getByText("September 27, 2026")).toHaveAttribute("dateTime", "2026-09-27")
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
    await expect(canvas.getByRole("region", { name: "Limitation of liability" })).toHaveTextContent("US$100")
    for (const link of canvas.getAllByRole("link", { name: "contact page" })) {
      await expect(link).toHaveAttribute("href", "/contact")
    }
  }
})

// In another language the frame is translated, and the terms stay in English until a lawyer reviews a translation.
export const Translated = meta.story({
  globals: { locale: "de" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).not.toHaveTextContent("Terms of service")
    await expect(canvas.getByRole("region", { name: "The service" })).toHaveAttribute("lang", "en")
  }
})
