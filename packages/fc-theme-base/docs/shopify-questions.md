# Shopify Questions

A question and its answer are written once, as a Question entry, and linked from every place that asks it. Editing
the entry changes the answer everywhere it shows.

- **Question** (`question` metaobject): the question as plain text and the answer as rich text. Answers can hold
  paragraphs and links.
- **FAQ topic** (`faq_topic` metaobject): a title over a list of Question entries, in display order.

| Where it shows | Field | Lists |
| --- | --- | --- |
| Product page's Questions | Product `custom.questions` | Question entries |
| Collection buying guide | Collection `custom.questions` | Question entries |
| FAQ page | Page `custom.faq_topics` | FAQ topic entries |
| Contact page's quick answers | Page `custom.questions` | Question entries |

The FAQ page links one row per topic under its heading, and each topic heads its questions with the first one open.
The FAQ page and buying guide mark their questions up as a schema.org `FAQPage`; the FAQ page does so only while
structured data is on. A place with no linked entries leaves its questions out.

Questions are managed under Content > Metaobjects in Shopify admin, and linked from the product, collection or page's
metafields. The theme editor doesn't hold question text.

The content pack defines both metaobjects and the fields, creates the store's current questions from
`content/questions-source.json`, and links them to the FAQ page, the Contact page and the clothing collections. See
[content installation](shopify-content-installation.md).
