# Theme blocks

The theme is moving its sections onto [Shopify theme blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks).
Shared blocks live in `blocks/`. A section lists the blocks it accepts in its schema and renders them with
`{% content_for 'blocks' %}`, so merchants can add, reorder and nest them in the theme editor.

## The shared blocks

- **Heading** (`heading.liquid`): the heading text, its level (`h1` to `h4`, `h2` by default), a size from small to
  extra large, and its alignment. Level sets the document outline and size sets the look, so pick them separately.
- **Text** (`text.liquid`): rich text in one of five styles: body, lead (larger and muted, for intros and story
  paragraphs), subtle (smaller, muted, for supporting detail), eyebrow (the small uppercase label above a heading) or
  quote (a pull quote, larger with a rule beside it), and its alignment. Merchants type eyebrows in normal case; the
  style makes them uppercase.
- **Button** (`button.liquid`): a label, a link, a style (primary, secondary or outline), a size and an optional
  trailing arrow. It renders through `ui-button`. Without a link it shows disabled, so it stays visible in the editor.
- **Image** (`image.liquid`): an image, shown at its own shape or cropped to square, portrait, landscape or wide.
  Its alt text comes from the image in Shopify's files. With no image, Shopify's placeholder illustration shows.
- **Group** (`group.liquid`): a column or a row of any theme blocks, with a spacing step and alignment on both
  axes. Rows wrap when they run out of room. Groups nest, so a section header is a column group holding a text
  eyebrow, a heading and a row group of buttons.

- **Link** (`link.liquid`): a text link, such as "View all", with an optional trailing arrow. It renders through
  `ui-link`.
- **Feature** (`feature.liquid`): a short selling point: an icon, a label, a line of detail and an optional link.
- **Product card** (`product-card.liquid`): one chosen product, shown through `ui-product-card`, with an optional
  badge and add button.
- **Phase heading** (`phase-heading.liquid`): opens an About page chapter with a referee's call. The call style puts
  its English meaning on one line, the call in very large type under it, then a rule. The eyebrow style, for the
  hero, is a short rule and the call in small capitals, with the meaning beside it on phones. The call is a level 2
  or 3 heading, or a paragraph when a level 1 heading follows it.

## Section shells

A section built on blocks is a thin shell. It puts its content on the page gutter, lays out its blocks and holds
only settings that belong to the whole section, such as a carousel's timing. Everything a merchant reads is a block.

- A fixed part of the layout, like the header above a grid, is a static block:
  `{% content_for 'block', type: 'group', id: 'header' %}`. Merchants edit what's inside it but can't remove it.
  The section's preset and template list it with `"static": true`.
- The repeating items render with `{% content_for 'blocks' %}`. An item only that section uses is a private block,
  such as `_category-card` in Category grid or `_hero-slide` in Hero.
- Every section has a preset whose blocks show the design, so a merchant who adds it starts from the real layout.
- Shopify wraps each block in its own `<div class="shopify-block">`. Layout CSS targets the section's direct children
  (`.picks-grid > :nth-child(3)`), not the block's own root element.
- In a section, `section.blocks` lists only its theme blocks, without the static ones. Each one's `type` reads as
  `@theme` and its `settings` are empty, so a section can count its blocks with `section.blocks.size` but can't read
  them. What it needs from them comes from their rendered output.
- A section's `{% stylesheet %}` loads before the CSS files it links, so a rule that overrides a shared class repeats
  that class in its selector (`.home-section.why-us`).

The homepage sections are built this way: Hero, Featured picks, Category grid, Best sellers, Why us, Testimonials,
Brand logos and Journal highlights. Their shared shell and carousel dots are in `assets/section-home.css`. Only the
Hero's first slide can hold the page's level 1 heading; a later slide's level 1 heading renders as level 2.

So are the announcement bar and header in the header group, and the newsletter band and footer in the footer group.
The header's utility row links are `_utility-link` blocks; its logo, main menu, selectors and icons come from the
theme's logo, the section's menu and the store. The footer's
brand and contact columns are the static `_footer-brand` and `_footer-contact` blocks, and its menu columns are
`_footer-menu` blocks between them. Brand reads the logo and tagline from the theme's brand settings, and contact reads
Shopify's store details.

The FAQ page's questions are `_faq-item` blocks, shown through `ui-faq-item`, and its topic headings are `_faq-topic`
blocks. A topic heads the questions after it, up to the next topic, and each one adds a link to the row under the page
heading. The section captures the rendered blocks and builds the topic links from each heading's `data-faq-topic`
title and `id`. With structured data on, the page is a schema.org `FAQPage` in microdata and each question a
`Question` inside it. The page heading and the contact card stay section settings. The breadcrumbs above it are the
shared Breadcrumbs section, the template's first section.

The About page (`templates/page.about.json`) follows the About Us board in the Pen. Five of its sections are
chapters named after the calls of a bout, each opening with a static Phase heading: About hero (En garde), Principles
(Prêts), Timeline (Allez), Stats (Touché) and Closing (La belle). Our story, Clubs and Programs sit between them, and
Brand logos is the homepage section in its boxed layout. The hero is a full-bleed photo (a section setting) with the
header floating over it on wide screens, as on the homepage. It renders the breadcrumbs itself, so the template has
no Breadcrumbs section. Under its copy, the static `_bout-nav` holds a `_bout-link` per chapter; each links to its
section's id (`#our-story`, `#what-we-stand-for`, `#how-far-weve-come`, `#the-numbers`, `#work-with-us`).

Clubs are `_club` blocks, with the static `_clubs-callout` band under them; program cards are `_program` blocks,
timeline steps `_milestone` blocks and figures `_stat` blocks. A program card leads with its offer (prefix, figure and
detail); one with a badge, such as Coming soon, leads with its title on the muted fill. Principles are Feature blocks,
which the section stands icon over text, then the static warehouse photo beside how we operate. The story's photo is a
section setting, so it can use the full width. Stats, the callout and the closing panel are dark: their shared shell in
`assets/section-about.css` turns the roles light inside them, so the blocks need no dark variants. That shell also
sets the page's larger heading scale (Large for chapter headings, Medium beside a photo or in a panel) and the
`about-lead` statement under a phase heading.

The Contact page has two sets of blocks in different places, so each sits in a static block that renders its own
children: `_contact-topics` holds the `_contact-topic` cards above the form, shown through `ui-contact-intent-card`,
and `_contact-answers` holds the `_contact-answer` quick answers below it, shown through `ui-contact-quick-answer`,
with its heading and the link to the FAQ page. The page heading, the form and the direct contact column stay section
settings, and its breadcrumbs are the Breadcrumbs section too.

## Rules

- Keep each block small: one element and the settings real sections need. Reach for a group before adding layout
  settings to another block.
- A block a single parent uses is private: its file name starts with `_` and only that parent lists it.
- A block renders through the shared `ui-*` snippet for its element when one exists, and styles only with the
  [design tokens](design-tokens.md). Its CSS sits in its own `{% stylesheet %}`, which Shopify bundles once.
- The root element carries `{{ block.shopify_attributes }}`, so the theme editor can select the block.
- The schema's name, labels, options and default text are `t:` keys in `locales/en.default.schema.json`, under
  `blocks`. Labels shared across blocks, like size and alignment, sit under `blocks.all`. Every block has a preset.
- Blocks add no page gutter. The section around them puts its content on the gutter, as described in
  [page layout](shopify-page-layout.md).

## Stories

Each public block has stories in `stories/blocks/`, titled `Blocks/<name>`, and each section in a folder for its page
under `stories/sections/`, titled `Sections/<page>/<name>` (`Sections/Home/Hero`), which covers its private blocks. `block(type, { blocks })` and
`section(name, { blocks, staticBlocks })` from `stories/liquid.js` are their `render` functions. See
[Storybook](storybook.md).
