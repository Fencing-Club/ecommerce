# Copacker emails

Copacker's transactional emails, built with React Email: `@repo/copacker-emails`. Each email function, such as
`invitationEmail` or `labelsReadyEmail`, renders one email to the `subject`, `html` and `text` it is sent with
(`Email`).

- `src/emails/`: one file per email. Its default export is the React component, with `PreviewProps` for the preview
  server and the tests; its named export renders the email.
- `layout.tsx`, `parts.tsx` and `theme.ts`: the shared frame, the pieces emails reuse (details, line items, steps,
  link fallbacks) and the colors and fonts.
- `render.ts`: `renderEmail`, which renders the HTML and the plain text from it.

The templates only lay out the words. The app passes every piece of copy in, already translated into the reader's
language (its `emails.*` messages), along with its own address (`appUrl`), which serves the header mark. Sending is the
app's: it queues and delivers emails through Resend (`apps/copacker/src/server/email.ts`).

Run `pnpm dev` here to preview the emails with React Email's server on port 3030.
