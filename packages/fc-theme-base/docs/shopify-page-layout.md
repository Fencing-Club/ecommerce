# Page layout

Every row on the page lines its content up on one gutter: the announcement bar, both header rows, every section and
the footer. The rule matches the Layout section of the Tokens board in `FencingClubWebsite.pen`.

## The rule

- The gutter is 16px below 990px and 24px from 990px.
- Content stops at 1248px and centers, so a 1440px screen has 96px on each side.
- Breakpoints stay at 750px and 990px. A section can change its layout at other widths, but not its gutter.

## Where it lives

`assets/base.css` holds the whole rule:

- `--gutter`: the gutter for the current width.
- `--content-max`: the content width.
- `--page-gutter`: the inline padding that does both: the gutter, or half the space left beside the content when
  that's wider. Its `100%` resolves where it's used, against that element's containing block, so it only works on
  an element that spans the page.
- `.page-width`: puts an element on the page gutter.

## Using it

- In markup, give a full-width band the `page-width` class.
- In CSS, use `padding-inline: var(--page-gutter)` on a band that can't take the class, such as a full-width panel
  or a section whose own rule sets its padding. Set only `padding-block` beside it.
- A box that should line up with the content but keep its own background or radius, such as a support card or the
  article hero, takes `margin-inline: var(--page-gutter)`.
- Something that bleeds to the screen edge inside a band, such as a scrolling row of pills, uses
  `margin-inline: calc(-1 * var(--gutter))` and `padding-inline: var(--gutter)`.
- Rows inside a band add no gutter of their own.
- Icons count as content. When a control's tap target is wider than its icon, as with the menu button or the
  announcement arrows, the icon sits on the gutter and the tap target reaches past it.

## The checks

`tests/page-gutter.test.js` reads the CSS and fails when:

- a file other than `base.css` defines `--gutter`, `--content-max` or `--page-gutter`;
- a stylesheet hardcodes the content width or centers a box on the page with its own math;
- a `.page-width` rule outside `base.css` sets an inline padding other than zero or the tokens.

The `Layout/Page gutter` stories render every section the templates and section groups place, at 390, 768, 1100,
1440 and 1920, and measure the visible text, icons and images. A section added to a template is measured with no
extra work. A story fails when, in any section:

- content crosses the gutter, except an image wider than the content, such as the homepage hero, and content cut
  off at the edge of a scrolling row;
- the leftmost content isn't on the gutter.

A section that centers its content on purpose goes in the story's `centered` list, with the widths it applies to and
the reason. The stories render through the Storybook stand-ins, so they don't cover what only the store renders, such
as product media from the admin. See [Storybook](storybook.md).
