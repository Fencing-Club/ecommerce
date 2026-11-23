# Product specs

Every fact a product can carry, where it's stored and where the theme shows it. The product page's sections and spec
rows show only when their field is set, so a product with less data gets a shorter page, never an empty row. An unset
field means unknown, not no.

Prefer Shopify's own data first: product fields, then category fields, then `custom` fields only for what Shopify has
no field for.

## Product fields

| Spec | Source | Shows |
| --- | --- | --- |
| Name | Title | Everywhere the product appears, and as the Overview heading. |
| Description | Description | Overview text. |
| Photos and videos | Media | Gallery, photo viewer, Overview photo. |
| Brand | Vendor | Brand link above the title, cards, Brand filter. |
| Category | Category | Picks which category fields the product has. |
| Size, color, hand | Variant options | Option pickers and the Size, Color and Hand filters. |
| Price and sale price | Variant price and compare-at price | `ui-price` everywhere. |
| Weight | Variant shipping weight | The Weight spec row, as a range when sizes differ. |

## Category fields

Choosing a product's category in Shopify adds that category's fields under the `shopify` namespace, with values from
Shopify's taxonomy. The fencing categories sit under Sporting Goods > Athletics > Fencing. Each field's key is its
taxonomy handle with hyphens. Shopify adds fields over time, so the product's **Category metafields** in admin are the
full list.

| Spec | Field | Fencing categories |
| --- | --- | --- |
| Material | `shopify.gear-material`, `shopify.handwear-material`, `shopify.material` | Jackets and lamés, gloves and cuffs, other protective gear. |
| Hand | `shopify.handedness`, `shopify.hand`, `shopify.hand-side` | Jackets, gloves, weapons. |
| Gender | `shopify.target-gender` | Jackets, gloves, chest protectors. |
| Age group | `shopify.age-group` | Protective gear, training aids, practice swords. |
| Color | `shopify.color-pattern` | All. |
| Weapon | `shopify.fencing-discipline`, `shopify.compatible-fencing-weapon`, `shopify.fencing-weapon-type` | All; jackets, lamés and gloves; training aids. |
| Certification | `shopify.sports-governing-body-certification`, `shopify.fencing-certification` | All; weapons. |
| Mask build | `shopify.lining-type`, `shopify.mask-bib-type` | Masks. |
| Weapon build | `shopify.grip-type`, `shopify.point-type`, `shopify.epee-point-type`, `shopify.wiring-configuration` | Weapons and blades. |
| Blade size | `shopify.weapon-size`, `shopify.blade-size-number`, `shopify.epee-blade-size`, `shopify.blade-size-category` | Foils, foil blades, épées, sabres. |
| Connectors | `shopify.fencing-connector-type`, `shopify.body-cord-connector-style` | Scoring equipment, body cords. |

The Specs table shows protection and FIE approval first, then the product's filled category fields in this order
(color is left to the swatches), then weight, closure and Pairs with. Shopify has no fencing category field for
protection rating, closure or care, so those are custom fields below. Weapon, gender and FIE status also
have custom fields because the filters and protection badge already use their reviewed values.

## Custom fields

Product fields in the `custom` namespace. Built means the theme reads it today; Designed means the
[product page design](shopify-product-page.md) uses it and the theme doesn't read it yet. Entry fields are read by
key: a Product feature has `image`, `heading` and `text`; a Question has `question` and a rich text `answer`. A
Question is written once, so any page that asks it links to the same entry.

| Field | Type | Shows | State |
| --- | --- | --- | --- |
| `custom.subtitle` | Single line text | The line under the title on the product page and in quick view. | Built |
| `custom.protection_rating` | Single line text: 350N, 800N or 1600N | Protection badge, Safety Level filter, Protection spec row. | Built |
| `custom.fie_status` | Single line text: FIE or Non-FIE | Protection badge, FIE filter, FIE approved spec row. | Built |
| `custom.weapon` | List of single line text: Foil, Epee, Saber | Weapon filter. | Built |
| `custom.gender` | Single line text: Mens, Womens, Kids, Unisex | Gender filter. | Built |
| `custom.skill_level` | Single line text: Beginner, Intermediate, Advanced | Skill Level filter. | Built |
| `custom.size_chart` | Size chart entry | Size guide panel, with how to measure and fit tips. | Built |
| `custom.closure` | Single line text, such as Back zip with collar strap | Closure spec row. | Built |
| `custom.features` | List of Product feature entries: photo, heading, text | Overview feature cards. | Built |
| `custom.care_symbols` | List of single line text: wash-cold, line-dry, no-bleach, no-tumble-dry, no-iron, no-dry-clean | Care symbols, each with what it means. | Built |
| `custom.care_note` | Multi-line text | Note under the care symbols. | Built |
| `custom.questions` | List of Question entries | Questions. A list set per product type for products without their own is designed, not built. | Built |
| `custom.guides` | List of blog posts | From the Journal. Without it, posts tagged with the product type. | Designed |

Filters only appear once a field is turned on in **Search & Discovery > Filters**; see
[collection filters](shopify-collection-filters.md). The old `custom.safety_level` mixes ratings with approval labels
and isn't used.

## Other sources

- **Pairs with** uses the complementary products set in the Search & Discovery app, which also feed Shopify's
  complementary recommendations.
- **Disclosures** come from `shopify.disclosure`; see [product page](shopify-product-page.md).
- **Reviews** and the star rating come from the reviews app.
- **You might also like** is Shopify's related product recommendations.

## Parked

The protection explainer, a What 350N means panel beside Specs with a link to the product's higher-rated version, is
parked as **Component/Protection Explainer** in the Pen's product component library. Building it would need a
Protection level entry per rating and a `custom.upgrade_product` product reference.

## Adding a spec

Use a product or category field when Shopify has one. Otherwise add a `custom` definition with storefront read
access to the content pack's builder (`content/build-migration.mjs`), add its row here, and render it in the Specs
table only when set.
