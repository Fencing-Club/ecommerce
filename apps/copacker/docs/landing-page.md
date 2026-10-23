# Landing page

Anyone signed out sees the marketing page at `/` (`apps/copacker/src/app/page.tsx`). Signed in, `/` still goes
straight to their home. The page is set on warm paper, with dark stages set into it for the hero and the agents, and an
orange one for the close. The contact page at `/contact` (`apps/copacker/src/app/contact/page.tsx`) shares its frame,
and so do the privacy policy and terms at `/privacy` and `/terms`, whose text is in their own `page.tsx`. The pages'
parts live in `apps/copacker/src/components/marketing/`:

| File                             | What it is                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `site.tsx`                       | The frame the pages share: the paper and stage grounds, the nav bar and the footer.                 |
| `legal.tsx`                      | The privacy policy's and terms' document: title and date, anchored sections, contents alongside.    |
| `landing.tsx`                    | The home page: hero, forecast, journey, agents, FAQ and the close.                                  |
| `contact.tsx`, `contact-form.tsx` | The contact page, and its form, which posts to `/api/contact`.                                      |
| `bar.tsx`                        | The nav bar, which turns dark over the stages (marked `data-tone="dark"`) and light over the paper. |
| `dot-field.tsx`                  | The hero's WebGL backdrop: points that settle from scattered to ordered, lit around the pointer.    |
| `tilt.tsx`                       | Leans the hero's product shot back and straightens it as it scrolls in.                             |
| `planner.tsx`                    | The forecast to play with: lead time, stores and the holiday rush move the reorder date and size.   |
| `journey.tsx`, `journey-world.ts` | One purchase order's trip, factory through customs to Amazon and you, as a 3D diorama (three.js).  |
| `agents.tsx`, `ticker.tsx`       | The animated diagram of agents working over MCP, and the lines that take turns in its card.         |
| `connect.tsx`, `setups.ts`       | The agent picker, with each agent's setup to copy (`copy-button.tsx`), and the CLI's session.       |
| `signup.tsx`                     | The close: the waitlist (`#waitlist`), which posts to `/api/mailing-list`.                          |
| `mockups.tsx`, `scaled.tsx`      | The hero's product shot, and the wrapper that scales it to its column like a screenshot.            |
| `film.tsx`                       | The button that plays the ad; it loads the dialog once the page is idle or on the first click.      |
| `film-dialog.tsx`                | The dialog that plays the ad from its media URL.                                                    |

- The product shot and the journey's cards are the app's own components (`Table`, `Status`, `StatusBadge` and so on)
  with demo data, in the light theme. Paper sections carry `.light` and the stages `.dark` (`src/styles/theme.css.ts`),
  and Tailwind's `dark:` variant skips anything inside `.light`. When the app's pages change, update the shot to match.
- The forecast is a small model, not the app's: sales per store per day, lifted through the rush, with the order placed
  far enough ahead to land ten days of sales before the shelf runs dry. Amazon checks the shipment in over a day or
  two while sales go on.
- The journey's world is built from rounded blocks in `journey-world.ts`, and `frame(progress, time)` poses the whole
  scene for a point on the trip, so it scrubs both ways. Its `beat` table sets when each thing happens: the packing
  line (FNSKU and suffocation warning labels on the units, the box right-sized round them, then the carton and
  shipping labels on the box), Amazon's pickup for its GWD warehouse in China, the forwarder's pickup, the voyage (the
  bill of lading lands once the container is aboard), customs (the seller's container goes in, the barrier lifts on
  release, and FedEx loads its cartons at the dock), then the forwarder's drop at FBA and FedEx's at the seller's own
  warehouse (the copy just says a carrier). The chapters, cards and the order's documents in `journey.tsx` are timed
  to the same points, so change them together. three.js loads only as the section comes near. The cards follow places
  in the world (`locate`) or hold a spot on screen, and slide to stay clear of the screen's edges, the header and the
  words. The last shot fits the whole board to any screen's shape; on a phone the trip ends at the warehouses instead.
  The sea's color, glints and foam are drawn per point in a shader patched onto its material (`onBeforeCompile`).
- The journey asks phones and tablets (a coarse pointer) for less of the GPU: a 1.5x pixel ratio and a 1024 px shadow
  map, and one more try without anti-aliasing if the first context fails. When a browser still can't draw the world,
  or drops its context, the section shows a still per chapter from `public/marketing/journey/` (`wide-<n>.jpg` at
  1440×900 and `phone-<n>.jpg` at 390×844, 2x), the words and documents over them as usual. Remake the stills when the
  world changes: load the page in headless Chromium with reduced motion, hide the header, the words and the cards, and
  screenshot the sticky view at each chapter's start.
- The pages load none of the app's providers (AuthKit, the data cache, tooltips, the theme) and only the messages
  their client components use (`ClientMessages` in `landing.tsx` and `contact.tsx`), so a visitor's HTML and
  JavaScript carry none of the app. The app's layouts bring those themselves (`AppProviders`).
- Work the first view doesn't need waits until the page has loaded and is idle (`use-page-idle.ts`): the hero's WebGL
  dots, and the fonts of the forecast's handwritten note and of the agents' code. The hero's words start faint rather
  than hidden (`lift` in `site.tsx`), so they're the first thing painted. The contact form's schema uses Zod Mini.
- Every animation respects reduced motion: the diagrams hold still, the forecast changes at once, the dots start in
  order, and the journey steps from chapter to chapter instead of moving.
- Animations move only transform and opacity where they can, so the compositor runs them off the main thread.
  `globals.css` drops the kit's blur from `animate-in` and `animate-out`, a hidden FAQ answer doesn't play its
  close animation as the page loads, and a tint that changes (the nav bar's tone, the journey's latest document) is a
  layer that fades. The FAQ answers opening and closing and the journey's documents joining the list still animate
  height, since the content below has to move with them.
- To see the signed-out page while signed in, open the same Portless URL in a separate browser context,
  where the session cookie isn't set.
- There are no paid plans, so the page asks only for a sign-up, and says it's free.
- The contact form emails each message through Resend to `CONTACT_EMAIL`, with replies going to the person who wrote
  (`src/server/contact.ts`). Like the waitlist, its endpoint takes anyone, turns away bots that fill in a hidden
  field, and slows down more than five messages from one address in ten minutes (`src/server/rate-limit.ts`).
- Every setup in `setups.ts` adds the hosted server, `https://copacker.ai/mcp`, which isn't built yet, and signs in with OAuth; each follows
  the client's own docs as of September 2026. For those sign-ins to work unaided, the server's OAuth needs dynamic
  client registration or client metadata documents, `iss` in its authorization response, loopback redirects on any
  port, and refresh tokens (`offline_access`), or ChatGPT signs people out when the first token expires.
- Copacker lets teams in a few at a time, so the pages link to neither sign-in nor sign-up: the nav bar's, hero's and
  contact page's buttons go to the waitlist. `/login` and `/signup` still work for anyone with the link.
- The waitlist is WorkOS's (`src/server/mailing-list.ts`): each signup is an entry on the environment's default
  waitlist, which the Waitlist feature (Authentication, Features) created, with the page's language and the site it
  came from as additional fields, since local, staging and production share the WorkOS environment. Approving an entry
  (Users, Waitlist) sends WorkOS's invitation; its link, the application's User invitation URL, opens `/signup` with
  `invitation_token`, where the form keeps to the invited address and signing up accepts the invitation, which
  confirms the address without a code. The endpoint takes anyone signed out, so it checks the address, turns away bots
  that fill in a hidden field, and slows down more than five signups from one address in ten minutes. WorkOS returns an
  address's existing entry unchanged, so an entry created in the last minute counts as new; someone new gets one
  welcome email (`waitlist-welcome` in `packages/copacker-emails`) through Resend, in the language the page was shown
  in, with replies going to `CONTACT_EMAIL`, and `CONTACT_EMAIL` gets a plain-text notice with the address and
  language, whose replies reach the person who joined. WorkOS's own waitlist confirmation email isn't asked for. The
  welcome carries a signed link to `/unsubscribe`, which asks before leaving since mail scanners open links, and a
  one-click `List-Unsubscribe` header that posts to `/api/mailing-list/unsubscribe`; leaving deletes the entry, so
  joining again is new. The signature is keyed on `TOKEN_ENCRYPTION_KEY`, so the links need no storage.
- The privacy policy and terms are written from what the code does: the stores Copacker reads (and that it keeps no
  customer's name, email address, phone number or address), the providers that run it, its cookies and its AI import.
  Amazon's, Amazon Ads' and eBay's developer programs read the policy's marketplace data section. When a data flow
  changes, such as a new provider, store, cookie or AI feature, change the text and its date with it. The terms leave out
  the company's legal name, address and governing law until they're settled.
- `/robots.txt` and `/sitemap.xml` come from `src/app/robots.ts` and `src/app/sitemap.ts`, at `APP_URL`. The sitemap
  lists the marketing pages; add a new one there. Robots.txt closes the API, the portal's pages (the sidebar's `areas`
  in `src/lib/access.ts`, and Settings) and the sign-in steps whose links carry tokens. `tests/robots.test.ts` fails if
  a page under `(portal)` isn't closed.

## Assets

The film, the ad's web mix at 1080p and 30 fps, is in the `copacker-media` R2 bucket, named for the first 8 characters
of its SHA-256 (`film-924d480a.mp4`), and `film-dialog.tsx` plays it from `https://media.copacker.ai/`.
`apps/copacker/public/marketing/` holds its poster and the social image, both from the ad's end card. After re-rendering
the ad (see [Video](../../video/docs/README.md)), export them again from `apps/video`:

```sh
pnpm exec remotion ffmpeg -y -i out/copacker-web.mp4 -r 30 -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart out/film.mp4
pnpm exec remotion ffmpeg -y -ss 101.2 -i out/copacker-web.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 3 ../copacker/public/marketing/film.jpg
pnpm exec remotion ffmpeg -y -ss 101.2 -i out/copacker-web.mp4 -frames:v 1 -vf crop=1920:1008:0:36,scale=1200:630 -q:v 3 ../copacker/public/marketing/og.jpg
```

Then upload the new cut under its own hash and point `film-dialog.tsx` at it. A new name means no cache holds an old
cut, so there's nothing to purge. The bucket answers range requests, which Safari needs to play and seek it.

```sh
npx wrangler r2 object put copacker-media/film-<hash>.mp4 --file=out/film.mp4 --content-type=video/mp4 --cache-control="public, max-age=31536000, immutable" --remote
```
