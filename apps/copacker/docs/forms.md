# Forms

Every form that saves through an action is built from the same few pieces. Reach for them before writing a form's
layout, a field's label and error, or a dialog's open state by hand.

## The pieces

- **`useActionForm`** (`src/hooks/use-action-form.ts`): React Hook Form with the action's Zod schema. It submits to
  `/api/action` (or through `run`), puts a failure on `root.server`, waits for the page to show the result, and resets.
  See [hooks](../../../docs/hooks.md).
- **`ActionForm`** (`components/action-form.tsx`): the only form layout. `layout` is `inline` (the button under the
  fields), `dialog` (Cancel and the button in the dialog's footer), `card` (a settings card whose Save stays outlined
  until something changes, then says Saved) or `auth` (the sign-in pages' full-width button, which spins until the
  next page opens). `requireChange` keeps the button disabled until a field changes. It reads the form's state with
  `useFormState`, so the button follows edits however its parent is memoized. A submit never reaches a form further
  up React's tree, such as the packing form a pickup address dialog opens from.
- **`FormServerError`** (`components/form-feedback.tsx`): the surrounding form's `root.server` error. `ActionForm`
  shows it; a form laid out another way, such as the order builder, places it itself. `FormError` shows any one
  message the same way; its `id` lets a field name it in `aria-describedby`, and `className` fits it into a box, as
  the PO timeline's comment box does.
- **`FormDialog`** (`components/form-dialog.tsx`): a form in a dialog, from a `trigger` or through `open` and
  `onOpenChange`. Its form mounts inside the open dialog, so every opening starts from its default values with no old
  typing or error, and it closes once the result shows. `size` is `default`, `md` or `lg`; a tall form scrolls.
- **`FormField` and `useFormField`** (`components/form-controls.tsx`): one field's label, control, description and
  error. `useFormField(name)` binds it to the form and returns `fieldProps` for `FormField` and `controlProps` for the
  control, whose `aria-describedby` lists its description and error by ids that are on the page. `fieldControl`
  gives the same props to a field outside React Hook Form, such as `SelectField`. `FormInput`, `FormNumber`,
  `FormMoney`, `FormTextarea`, `FormCheckbox`, `FormSelect`, the address fields and the auth fields are built on them.
  `FormMoney` is `MoneyInput` in a field: it stores minor units, reads amounts in the page's language and stores `NaN`
  for text that isn't an amount, so the schema's number check shows "Enter a number".
- **`keepEnterFromSubmitting`** (`components/action-form.tsx`): for a form only its button should submit, such as one
  that creates a purchase order.

## Addresses

- **`addressLine` and `addressLines`** (`@repo/copacker-orders`): the one address format, "1000 Siji Road, Building 3,
  Yiwu, Zhejiang 322000, CN" on a line, or as a document's lines. Lists, summaries, the packet snapshot and the
  purchase order PDFs all use it.
- **`AddressFields`** (`components/address-fields.tsx`): an address's fields at a path in the form.
- **`AddressDialog`** (`components/partner-address.tsx`): the one form for a named address, used for the workspace's
  saved addresses and a partner's. A pickup's phone is required.
- **`AddressRow`** (`components/partner-address.tsx`): one address in a list, with its menu.
- **`RowActionsMenu`** (`components/row-actions-menu.tsx`): a list row's ⋯ menu, which a spinner replaces while one of
  its actions runs.
