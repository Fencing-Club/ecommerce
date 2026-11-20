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

## The check

`tests/page-gutter.test.js` fails when:

- a file other than `base.css` defines `--gutter`, `--content-max` or `--page-gutter`;
- a stylesheet hardcodes the content width or centers a box on the page with its own math;
- a `.page-width` rule outside `base.css` sets an inline padding other than zero or the tokens.

It reads the CSS, not the rendered page, so a section that sets a fixed inline padding on its own class still gets
past it. Check new sections against the gutter in the browser at 390, 768, 1100 and 1440.
