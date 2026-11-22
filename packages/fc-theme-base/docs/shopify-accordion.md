# Accordion

`snippets/ui-accordion.liquid` is the one disclosure that shows and hides content in place. Filter groups and FAQ
items render it, so they all open and close the same way.

- It's a native `<details>`, so it works without JavaScript and with the keyboard.
- `assets/motion.js` animates it: the content grows from no height and fades in, and shrinks and fades out. A click
  while it moves turns it around. Reduced motion opens and closes at once.
- The summary row ends in a chevron that turns over, or a plus that turns to minus (`indicator: 'plus'`).
- Callers pass the summary and content as HTML, plus classes and attributes for the details element, such as
  schema.org microdata.

While it closes, the details keeps `open` and has `data-closing`, so style an open state with
`[open]:not([data-closing])`. Put spacing between the summary and the content on the content's padding, which the
motion animates, not on a margin, which would jump.
