# Product catalogue: converting the portfolio to a Vietnamese packaging catalogue

**Date:** 2026-07-31
**Status:** Approved design, not yet implemented
**Supersedes the content model in:** `2026-07-31-hugo-decap-cloudflare-design.md`
(the infrastructure in that spec — Hugo, Decap, Cloudflare Pages, the OAuth
Worker — is unchanged and still current)

## Purpose

Reshape the existing Hugo site from a portfolio into a Vietnamese-language
product catalogue for plastic packaging, modelled on `nhuahongdong.com/san-pham/`:
an image-led product grid, a category sidebar, and pagination.

The site is a catalogue, not a shop. There is no cart, no checkout, and no
order processing.

## Reference

`https://nhuahongdong.com/san-pham/` — Vietnamese plastic packaging
manufacturer. Observed structure: 3 products per row, left sidebar of
categories, pagination across 10 pages of ~120 products, each card showing an
image and a product name.

This design departs from the reference in one respect: cards also show a price,
because the owner asked for prices.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Language | Vietnamese | Owner's market |
| URLs | Vietnamese (`/san-pham/`, `/danh-muc/`) | Matches the reference; better for Vietnamese search |
| Front matter keys | Stay English | Templates, tests, and CMS config already agree on them; Hugo fails silently when they drift |
| CMS labels | Vietnamese | Editing experience without touching the wiring |
| Category cardinality | Exactly one per product | Sidebar counts sum to the total; unambiguous breadcrumb |
| Category input | Fixed dropdown, not free text | A typo would silently create a phantom category in the primary navigation |
| Products per page | 12 | 4 rows of 3; matches the reference's 120/10 |
| Price | Optional; blank renders **Liên hệ** | Packaging is often quote-based; an empty cell looks broken |
| Commerce | Out of scope | Catalogue only |

## URLs

| Page | URL |
|---|---|
| Home | `/` |
| Product grid | `/san-pham/` |
| Product detail | `/san-pham/<slug>/` |
| Category listing | `/danh-muc/<slug>/` |
| About | `/gioi-thieu/` |

`content/projects/` is renamed to `content/san-pham/`; Hugo derives the section
URL from the directory name. `content/about/` becomes `content/gioi-thieu/`.

The live URLs change as a result. Nothing links to the current ones — the site
went live the same day with no traffic — so this is the cheapest possible moment
to make the change.

## Content model

### Product front matter

Keys are English and stable. Labels are what the CMS displays.

| Key | CMS label | Type | Required | Notes |
|---|---|---|---|---|
| `title` | Tên sản phẩm | string | yes | |
| `code` | Mã sản phẩm | string | no | new |
| `category` | Danh mục | select | yes | new — single value, drives the sidebar |
| `capacity` | Dung tích | string | no | new — e.g. `1000ml` |
| `material` | Chất liệu | select | no | new — PET / HDPE / PP / PVC |
| `neck` | Cổ chai | string | no | new — e.g. `24/410` |
| `price` | Giá | number | no | new — blank renders **Liên hệ** |
| `cover` | Ảnh chính | image | yes | existing |
| `gallery` | Thư viện ảnh | list of {image, caption} | no | existing |
| `summary` | Mô tả ngắn | text | no | existing |
| `weight` | Thứ tự hiển thị | number | no | existing |
| `draft` | Nháp | boolean | yes (default true) | existing |
| `date` | Ngày | datetime | yes | existing |
| body | Mô tả chi tiết | markdown | no | existing |

**Removed:** `client`, `year`, `external_url`, `tags`. These are portfolio
concepts with no meaning for packaging. `tags` is replaced by `category`.

`material` is a select rather than free text so the same material cannot be
spelled three ways across the catalogue.

`category` is a select for a stronger reason. The sidebar is the catalogue's
primary navigation, and it is built from whatever category values exist in the
content. With free text, one typo — `Chai PET` versus `Chai P.E.T` — silently
creates a phantom category holding a single product, and it stays in the
sidebar until a human notices. A fixed list makes that failure impossible.

The cost is explicit: adding a category becomes a config edit and a commit
rather than typing a new value in the CMS. For a set that changes about once a
year, that is the correct trade.

**The category list** (stored as the front matter value, displayed as the
label):

| Value | Label |
|---|---|
| `chai-pet` | Chai nhựa PET |
| `chai-hdpe` | Chai nhựa HDPE |
| `hu-nhua` | Hũ nhựa |
| `nap-voi` | Nắp & vòi |
| `can-nhua` | Can nhựa |

Storing a slug rather than the display label keeps `/danh-muc/<slug>/` URLs
stable if a label is ever reworded.

### Taxonomy

`[taxonomies] category = "danh-muc"` in `hugo.toml`, replacing `tag = "tags"`.
Because each product declares exactly one category, sidebar counts sum to the
product total.

Enabling a taxonomy without its templates makes Hugo emit
`WARN found no layout file ... for kind "taxonomy"`, which the harness treats as
a failure. The taxonomy change and its templates therefore land together, as
`tags` did.

## Layout

### Grid

Three products per row, collapsing to two on tablet and one on phone. This
replaces the current `auto-fill, minmax(17rem, 1fr)`, which yields a variable
column count.

Card contents: cover image, product name, and price — or **Liên hệ** when
`price` is blank. A grid where some cards show a number and others show nothing
reads as broken; "Liên hệ" is the standard Vietnamese convention and keeps rows
visually even.

### Sidebar

A list of categories with product counts, e.g. `Chai PET (24)`. Rendered by a
single partial used by both `/san-pham/` and `/danh-muc/<slug>/`, so the two
pages cannot drift apart.

On mobile the sidebar moves above the grid rather than being hidden. On a
packaging site the category list is the primary navigation, not a secondary
filter.

### Pagination

Hugo's built-in paginator, 12 per page. Category listings paginate on the same
setting.

### Detail page

Gallery, a specification table (mã, dung tích, chất liệu, cổ chai), price or
Liên hệ, and a contact prompt drawn from `data/settings.yaml`. Every optional
field stays wrapped in `{{ with }}` so absence omits the row rather than
rendering an empty one.

### Navigation

Trang chủ / Sản phẩm / Giới thiệu / Liên hệ, edited in `data/settings.yaml`
exactly as now.

### 404

`layouts/404.html` is added. Unmatched URLs currently return the homepage with
HTTP 200 — verified against the live site with `/this-does-not-exist-xyz/` —
because Cloudflare Pages falls back to `index.html` when a site ships no 404
page. Left alone, search engines index unlimited duplicate homepages.

## Migration

### Fixtures that must survive

Three pieces of seed content are load-bearing test fixtures. They are **moved**
with the rename, never recreated, so what they protect stays protected:

| Fixture | Protects |
|---|---|
| `content/projects/hidden-draft/` | Drafts are excluded from production builds |
| `shot-02.jpg` (300×168) | The anti-upscaling guard in `_partials/image.html` |
| `content/about/portrait.jpg` | An empty CMS image field renders no image |

### Seed content

`demo-project` is replaced by two Vietnamese demo products — one with a price,
one without — so the Liên hệ branch is exercised by a real page rather than a
synthetic fixture. Both carry a category so the sidebar has something to count.

### Assertions

Every assertion referencing `public/projects/…` is repointed to
`public/san-pham/…`. There are 37 assertions today, and they are the reason the
original build caught seven real defects. They are moved deliberately, one at a
time — a bulk find-and-replace that leaves an assertion pointing at a path Hugo
no longer produces yields a green-but-meaningless suite.

## Catalogue search

Added 2026-08-01, replacing the original "site search — out of scope" ruling.
That ruling assumed browsing. It does not survive product codes: nobody
browses a catalogue to find `HD-601` when they already know the code.

**Placement.** One input above the grid on `/san-pham/`, filtering the grid in
place. No results page, no URL state.

**Matched fields.** Title, mã, dung tích, chất liệu, cổ chai. Not the summary
or body — with no relevance ranking, full-text matching returns a wall of
loosely-related products in arbitrary order.

**Index.** Hugo emits `/san-pham/index.json` from `.Pages` — every product,
not the paginator's twelve. `HD-601` is on grid page 2, so an index built from
the visible DOM would miss the exact case that motivated the feature.

Each entry carries its card's **rendered HTML** from `product-card.html`. A
search result is therefore the same markup as a grid card by construction:
image pipeline, price-or-Liên hệ, and summary stay in one place rather than
being reimplemented in JavaScript and drifting.

**Matching rules.**

| Rule | Reason |
|---|---|
| Accent-insensitive (`chai nhua` → **Chai nhựa**) | Vietnamese users routinely type unaccented |
| `đ`/`Đ` mapped explicitly | NFD does not decompose it; without this every `đ` product stops matching its unaccented spelling |
| Word-prefix, not substring | `hu` sits inside `nhua`, so substring matching returned every Chai nhựa when searching Hũ nhựa |
| Punctuation-stripped match for digit-bearing tokens only | `hd601` and `24410` find `HD-601` and `24/410`; restricting it to digits stops `pe` matching every `HDPE` |
| All tokens must match | `chai 500ml` narrows rather than widening |

**Degradation.** The box is rendered `hidden` and revealed by the script. The
grid and its pagination stay fully server-rendered, so without JavaScript the
catalogue works exactly as before rather than presenting a dead input.

**Testing.** The matcher is pure and unit-tested in `scripts/search-test.mjs`
under Node. This is not optional: accent folding and code punctuation are
runtime behaviour, and a search box that renders perfectly while matching
nothing would satisfy every grep assertion in `scripts/test.sh`.

## Risks and mitigations

**Hugo does not validate front matter.** Six new keys (`code`, `category`,
`capacity`, `material`, `neck`, `price`) must match across CMS config, template
reads, and seed content. A mismatch renders blank with no build error. The same
three-way comparison performed during the original build runs again and is
reported explicitly.

**Silent assertion decay during the rename.** Covered above: assertions move
individually, and the suite must be observed failing against the old paths
before the rename is judged complete.

**Taxonomy warning.** Covered above: `category` and its templates land together.

**The CMS image field stays authoritative.** No `{{ .Params.X | default "X.*" }}`
glob fallback is reintroduced. Clearing an image field in the CMS must remove
the image.

## New assertions

- Grid renders 3 per row
- Sidebar lists every category with a correct count
- Pagination appears once there are more than 12 products
- A priced product renders its price
- An unpriced product renders **Liên hệ**
- A category page lists only that category's products
- An unmatched URL returns 404, not the homepage
- Drafts remain excluded (moved)
- Sub-800px images are still not upscaled (moved)

## Out of scope

- Cart, checkout, order processing, stock levels
- A contact *form* — there is no server to receive submissions. The contact
  prompt is the email and phone in `data/settings.yaml`.
- Multi-language (Vietnamese only)
- Two-level category nesting — reconsider past ~100 products
- Custom domain
