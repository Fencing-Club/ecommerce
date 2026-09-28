// Copacker's transactional emails. Each function renders one email to the subject, HTML and plain text it's sent with.
// The templates only lay out the words: the app passes them in, translated into the reader's language.
export { customerDataRequestEmail, type CustomerDataRequestProps } from "./emails/customer-data-request"
export { invitationEmail, type InvitationProps } from "./emails/invitation"
export { labelsReadyEmail, type LabelsReadyProps } from "./emails/labels-ready"
export { passwordResetEmail, type PasswordResetProps } from "./emails/password-reset"
export { purchaseOrderEmail, type PurchaseOrderProps, shownLines } from "./emails/purchase-order"
export { waitlistWelcomeEmail, type WaitlistWelcomeProps } from "./emails/waitlist-welcome"
export type { EmailCopy } from "./layout"
export type { Email } from "./render"
