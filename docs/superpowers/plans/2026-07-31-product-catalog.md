# Vietnamese Product Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the existing Hugo portfolio into a Vietnamese plastic-packaging catalogue with a 3-up product grid, a category sidebar, and pagination.

**Architecture:** No infrastructure changes. The Hugo/Decap/Cloudflare stack, the OAuth Worker, and `_partials/image.html` are untouched. This is a content-model and presentation change: sections are renamed to Vietnamese URLs, the `tags` taxonomy becomes a fixed `danh-muc` category taxonomy driving a sidebar, six product fields are added, and the grid gains pagination.

**Tech Stack:** Hugo extended 0.164.0, Decap CMS 3.15.1, Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-07-31-product-catalog-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Hugo extended 0.164.0 exactly.** `hugo version` must contain `+extended`.
- **The build must emit zero warnings.** `./scripts/test.sh` treats any `WARN` or `deprecat` line as a failure.
- **Hugo's current template lookup (v0.146+).** No `layouts/_default/`. `page.html` not `single.html`, `section.html` not `list.html`, `home.html` not `index.html`, partials in `layouts/_partials/`.
- **Config uses `locale`, not `languageCode`** (deprecated v0.158.0). **Data access uses `hugo.Data`, not `site.Data`** (deprecated v0.156.0).
- **All content is a page bundle.** Hugo cannot process images under `static/`.
- **`layouts/_partials/image.html` is the ONLY place that may call `.Resize`.** Do not modify it in this plan.
- **The CMS field is authoritative for images.** Never reintroduce `{{ .Params.X | default "X.*" }}` — Hugo's `default` treats `""` as unset, so the glob fires when an editor clears the field.
- **Existing front matter keys keep their English names** (`title`, `date`, `draft`, `summary`, `cover`, `gallery`, `weight`). Templates, tests and CMS config already agree on them and Hugo fails silently when they drift. New keys are also English **except** the taxonomy key, which Hugo forces to be the taxonomy's plural name — see Task 3.
- **Commit after every task**, Conventional Commits style.

### Verified Hugo behaviour (established by smoke test before this plan was written — do not re-derive)

- `[pagination] pagerSize = 12` in `hugo.toml` plus `{{ $p := .Paginate .Pages }}` yields `/san-pham/`, `/san-pham/page/2/`, …
- In `[taxonomies]`, the **key is singular and the value is plural, and the front matter key must be the plural**. `danh_muc = "danh-muc"` requires front matter `danh-muc:` and produces `/danh-muc/<term>/`.
- `index site.Taxonomies "danh-muc"` returns the term map. Dot notation cannot be used because of the hyphen.
- **Hugo generates term pages only for terms actually in use.** A category with zero products has no page — linking to it 404s. The sidebar must skip empty categories.
- `lang.FormatCurrency 0 "VND"` with `defaultContentLanguage = "vi"` renders `125.000 ₫`.

## File Structure

```
hugo.toml                          # + locale/vi, [taxonomies] danh_muc, [pagination] pagerSize
data/settings.yaml                 # Vietnamese nav, contact
data/danhmuc.yaml                  # NEW — ordered slug→label list for the 5 categories

content/
  _index.md                        # Vietnamese home copy
  gioi-thieu/index.md              # RENAMED from about/
  san-pham/                        # RENAMED from projects/
    _index.md
    <slug>/index.md + images

layouts/
  baseof.html                      # unchanged
  home.html                        # Vietnamese copy
  page.html                        # unchanged
  404.html                         # NEW
  taxonomy.html                    # /danh-muc/ index
  term.html                        # /danh-muc/<slug>/ — grid + sidebar
  san-pham/
    section.html                   # grid + sidebar + pagination
    page.html                      # detail: gallery, spec table, price
  _partials/
    head.html header.html footer.html image.html   # image.html untouched
    category-sidebar.html          # NEW — the only place taxonomy counts are read
    product-card.html              # RENAMED from project-card.html
    price.html                     # NEW — price or "Liên hệ", one place only

assets/css/main.css                # 3-up grid, sidebar layout, pagination
scripts/test.sh                    # assertions repointed + new ones
static/admin/config.yml            # Vietnamese labels, new fields, category select
```

**Responsibility boundaries.** `_partials/price.html` is the only place that decides between a formatted price and "Liên hệ", so the card and the detail page cannot disagree. `_partials/category-sidebar.html` is the only place that reads `site.Taxonomies`, so the section page and term pages cannot drift.

---

### Task 1: Rename sections to Vietnamese URLs

Pure rename. No new fields, no new templates, no visual change. Isolated so that a reviewer can verify the 42 existing assertions still genuinely assert.

**Files:**
- Rename: `content/projects/` → `content/san-pham/`, `content/about/` → `content/gioi-thieu/`
- Rename: `layouts/projects/` → `layouts/san-pham/`
- Modify: `scripts/test.sh`, `data/settings.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: URLs `/san-pham/`, `/san-pham/<slug>/`, `/gioi-thieu/`. Task 3 adds `/danh-muc/`. All later tasks assert against `public/san-pham/…`.

- [ ] **Step 1: Confirm the starting state**

```bash
./scripts/test.sh 2>&1 | tail -2
grep -c '^assert' scripts/test.sh
```

Expected: `ALL PASS`, and `42`. If not 42, stop and report — the plan's assertion arithmetic assumes it.

- [ ] **Step 2: Rename with git mv so history follows**

```bash
git mv content/projects content/san-pham
git mv content/about content/gioi-thieu
git mv layouts/projects layouts/san-pham
```

`git mv` matters: these directories carry three load-bearing test fixtures (`hidden-draft/`, `shot-02.jpg` at 300×168, `portrait.jpg`). Moving rather than recreating keeps what they protect intact.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./scripts/test.sh`
Expected: many FAILs — every assertion naming `public/projects/…` or `public/about/…` now points at a path Hugo no longer produces. This is the red state that proves the assertions were real.

Record the exact count of failures.

- [ ] **Step 4: Repoint the assertions**

In `scripts/test.sh`, replace each occurrence individually — read each line and confirm the new path is one Hugo actually produces:

- `public/projects/index.html` → `public/san-pham/index.html`
- `public/projects/demo-project/index.html` → `public/san-pham/demo-project/index.html`
- `public/projects/hidden-draft` → `public/san-pham/hidden-draft`
- `public/about/index.html` → `public/gioi-thieu/index.html`

Do NOT use a blanket `sed`. An assertion left pointing at a non-existent path passes vacuously for `assert_not_contains` (it returns pass when the file is missing) and would silently stop protecting anything.

- [ ] **Step 5: Update the nav**

In `data/settings.yaml`, change the nav URLs (labels stay English until Task 5):

```yaml
nav:
  - label: Products
    url: /san-pham/
  - label: About
    url: /gioi-thieu/
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: `ALL PASS`, 42 assertions, zero warnings.

- [ ] **Step 7: Confirm the fixtures survived**

```bash
ls content/san-pham/hidden-draft/index.md
ls content/gioi-thieu/portrait.jpg
hugo --gc --minify --cleanDestinationDir >/dev/null 2>&1
grep -o 'width=.\?300.\? height=.\?168' public/san-pham/demo-project/index.html
```

Expected: both files listed, and the 300×168 dimensions present (the anti-upscaling fixture still renders through the image partial).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: rename sections to Vietnamese URLs (/san-pham/, /gioi-thieu/)"
```

---

### Task 2: Product fields and the price partial

Adds the six new fields and the Liên hệ branch. Still using the old `tags` taxonomy — Task 3 swaps it.

**Files:**
- Create: `layouts/_partials/price.html`
- Modify: `layouts/san-pham/page.html`, `layouts/_partials/project-card.html`, `content/san-pham/demo-project/index.md`, `hugo.toml`, `scripts/test.sh`
- Create: `content/san-pham/chai-pet-500ml/index.md` + image

**Interfaces:**
- Consumes: `partial "image.html"` with dict keys `img` (required), `alt`, `sizes`, `loading` — unchanged from the original build.
- Produces: `partial "price.html"` taking a **page** as context (`.`); renders a formatted price from `.Params.price`, or `Liên hệ` when it is absent/zero. Front matter keys `code`, `capacity`, `material`, `neck`, `price`. Task 6 exposes exactly these names through Decap.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

```bash
assert_contains public/san-pham/demo-project/index.html "125.000" "priced product renders a formatted price"
assert_contains public/san-pham/demo-project/index.html "PET" "detail renders the material"
assert_contains public/san-pham/demo-project/index.html "24/410" "detail renders the neck size"
assert_contains public/san-pham/demo-project/index.html "500ml" "detail renders the capacity"
assert_contains public/san-pham/demo-project/index.html "HD-500" "detail renders the product code"
assert_contains public/san-pham/chai-pet-500ml/index.html "Liên hệ" "unpriced product renders Liên hệ"
assert_not_contains public/san-pham/chai-pet-500ml/index.html "0 ₫" "unpriced product does not render a zero price"
assert_contains public/san-pham/index.html "Liên hệ" "grid card shows Liên hệ for unpriced products"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on all eight.

- [ ] **Step 3: Set the locale so currency formats as Vietnamese**

In `hugo.toml`, change `locale = "en-us"` to:

```toml
locale = "vi"
defaultContentLanguage = "vi"
```

`lang.FormatCurrency` derives its separators from this. Without it, `125000` renders as `125,000` (English) rather than `125.000` (Vietnamese).

- [ ] **Step 4: Create the price partial**

Create `layouts/_partials/price.html`:

```html
{{- with .Params.price -}}
  <span class="price">{{ lang.FormatCurrency 0 "VND" . }}</span>
{{- else -}}
  <span class="price price-contact">Liên hệ</span>
{{- end -}}
```

`with`/`else` treats an absent field, an empty string, and `0` alike — all render Liên hệ. That is deliberate: a genuinely free product is not a case this catalogue has, and `0 ₫` on a card reads as a bug.

- [ ] **Step 5: Add the fields to the seed product**

Replace the front matter of `content/san-pham/demo-project/index.md`, keeping the existing body and the `gallery` entries that reference `shot-01.jpg` and `shot-02.jpg`:

```markdown
---
title: Hũ nhựa PET 1000ML
date: 2026-07-31
draft: false
summary: Hũ nhựa PET dung tích 1000ml, nắp vặn kín, dùng cho thực phẩm khô.
cover: cover.jpg
gallery:
  - image: shot-01.jpg
    caption: Mặt trước
  - image: shot-02.jpg
    caption: Chi tiết nắp
tags:
  - branding
  - print
code: HD-500
capacity: 500ml
material: PET
neck: 24/410
price: 125000
weight: 10
---

Hũ nhựa PET trong suốt, an toàn thực phẩm, phù hợp đóng gói hạt, bột và thực phẩm khô.
```

`tags` stays for now so Task 1's tag assertions keep passing; Task 3 removes it.

- [ ] **Step 6: Create the second seed product, without a price**

```bash
mkdir -p content/san-pham/chai-pet-500ml
sips -s format jpeg -Z 1800 /System/Library/CoreServices/DefaultDesktop.heic --out content/san-pham/chai-pet-500ml/cover.jpg
```

Create `content/san-pham/chai-pet-500ml/index.md`:

```markdown
---
title: Chai nhựa PET 500ML cổ 24/410
date: 2026-07-30
draft: false
summary: Chai PET 500ml, cổ 24/410, phù hợp đóng gói mỹ phẩm và dung dịch.
cover: cover.jpg
tags:
  - branding
code: HD-501
capacity: 500ml
material: PET
neck: 24/410
weight: 20
---

Chai nhựa PET trong suốt, thành dày đều, tương thích với nắp bơm và nắp xịt cổ 24/410.
```

No `price` key at all — this is the Liên hệ case.

- [ ] **Step 7: Render the specs and price on the detail page**

In `layouts/san-pham/page.html`, replace the `<dl class="meta">` block (which currently renders `client` and `year`) and the `external_url` paragraph with:

```html
  {{ partial "price.html" . }}
  <dl class="specs">
    {{- with .Params.code }}<div><dt>Mã sản phẩm</dt><dd>{{ . }}</dd></div>{{ end }}
    {{- with .Params.capacity }}<div><dt>Dung tích</dt><dd>{{ . }}</dd></div>{{ end }}
    {{- with .Params.material }}<div><dt>Chất liệu</dt><dd>{{ . }}</dd></div>{{ end }}
    {{- with .Params.neck }}<div><dt>Cổ chai</dt><dd>{{ . }}</dd></div>{{ end }}
  </dl>
```

Every row is `with`-guarded, so a product missing a spec omits the row rather than rendering an empty `<dd>`.

- [ ] **Step 8: Add the price to the card**

In `layouts/_partials/project-card.html`, insert immediately after the `<h2>{{ $p.Title }}</h2>` line, still inside the `<a>`:

```html
    {{ partial "price.html" $p }}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: `ALL PASS`, 50 assertions, zero warnings.

Then confirm the formatting by eye:

```bash
grep -o '<span class=price>[^<]*' public/san-pham/demo-project/index.html
```

Expected: `125.000 ₫` — dot separator, not comma. A comma means `locale` did not take.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: product spec fields and price/Liên hệ partial"
```

---

### Task 3: Category taxonomy and sidebar

Replaces `tags` with `danh-muc` and adds the sidebar. The taxonomy config and its templates land in the **same commit** — enabling a taxonomy without templates emits `WARN found no layout file … for kind "taxonomy"`, which fails the harness.

**Files:**
- Create: `data/danhmuc.yaml`, `layouts/_partials/category-sidebar.html`
- Modify: `hugo.toml`, `layouts/taxonomy.html`, `layouts/term.html`, `layouts/san-pham/section.html`, `layouts/_partials/project-card.html`, both product `index.md` files, `scripts/test.sh`

**Interfaces:**
- Consumes: `partial "product-card.html"` (still named `project-card.html` until Task 4).
- Produces: `hugo.Data.danhmuc` — an **ordered list** of `{slug, label}`. `partial "category-sidebar.html"` taking a page as context; renders only categories that have at least one product. Front matter key **`danh-muc`** (hyphenated — Hugo requires the taxonomy's plural name).

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

```bash
assert_file public/danh-muc/chai-pet/index.html "category term page is generated"
assert_contains public/san-pham/index.html "Chai nhựa PET" "sidebar renders the category label"
assert_contains public/san-pham/index.html "/danh-muc/chai-pet/" "sidebar links to the category"
assert_not_contains public/san-pham/index.html "/danh-muc/can-nhua/" "sidebar does not link an empty category"
assert_contains public/danh-muc/chai-pet/index.html "Chai nhựa PET 500ML" "term page lists its own products"
assert_not_contains public/danh-muc/hu-nhua/index.html "Chai nhựa PET 500ML" "term page excludes other categories' products"
```

The fourth assertion is the important one: Hugo generates term pages only for categories in use, so linking an empty category produces a 404.

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on all six.

- [ ] **Step 3: Create the category list**

Create `data/danhmuc.yaml`. Order here is the sidebar's display order:

```yaml
- slug: chai-pet
  label: Chai nhựa PET
- slug: chai-hdpe
  label: Chai nhựa HDPE
- slug: hu-nhua
  label: Hũ nhựa
- slug: nap-voi
  label: Nắp & vòi
- slug: can-nhua
  label: Can nhựa
```

- [ ] **Step 4: Swap the taxonomy**

In `hugo.toml`, replace the `[taxonomies]` block:

```toml
[taxonomies]
  danh_muc = "danh-muc"
```

The key is the singular and the value the plural; the **front matter key must be the plural**, `danh-muc`. Declaring only this one also suppresses Hugo's default `tags` and `categories` taxonomies, so no stale `/tags/` tree is produced.

- [ ] **Step 5: Move the products onto categories**

In `content/san-pham/demo-project/index.md`, delete the `tags:` block and add:

```yaml
danh-muc: hu-nhua
```

In `content/san-pham/chai-pet-500ml/index.md`, delete the `tags:` block and add:

```yaml
danh-muc: chai-pet
```

- [ ] **Step 6: Create the sidebar partial**

Create `layouts/_partials/category-sidebar.html`:

```html
{{- $terms := index site.Taxonomies "danh-muc" -}}
<aside class="sidebar">
  <h2>Danh mục sản phẩm</h2>
  <ul>
    {{- range hugo.Data.danhmuc }}
      {{- $slug := .slug }}
      {{- $label := .label }}
      {{- with index $terms $slug }}
      <li>
        <a href="{{ (printf "/danh-muc/%s/" $slug) | relURL }}">{{ $label }} <span class="count">({{ len .Pages }})</span></a>
      </li>
      {{- end }}
    {{- end }}
  </ul>
</aside>
```

Iterating `hugo.Data.danhmuc` fixes the display order; the inner `with index $terms $slug` is what skips categories with no products, because Hugo creates no term page for them and the link would 404.

- [ ] **Step 7: Rewrite the taxonomy and term templates**

Replace `layouts/taxonomy.html`:

```html
{{ define "main" }}
<h1>Danh mục sản phẩm</h1>
{{ partial "category-sidebar.html" . }}
{{ end }}
```

Replace `layouts/term.html`:

```html
{{ define "main" }}
<div class="catalogue">
  {{ partial "category-sidebar.html" . }}
  <div class="catalogue-main">
    <h1>{{ $slug := .Page.File.BaseFileName | default .Title }}{{ range hugo.Data.danhmuc }}{{ if eq .slug $.Title }}{{ .label }}{{ end }}{{ end }}</h1>
    <div class="grid">
      {{- range .Pages }}
        {{ partial "project-card.html" . }}
      {{- end }}
    </div>
  </div>
</div>
{{ end }}
```

The heading loop maps the term's slug back to its Vietnamese label, because Hugo otherwise title-cases the slug into `Chai-Pet`.

- [ ] **Step 8: Add the sidebar to the product grid**

Replace `layouts/san-pham/section.html`:

```html
{{ define "main" }}
<h1>{{ .Title }}</h1>
{{ with .Params.intro }}<p>{{ . }}</p>{{ end }}
<div class="catalogue">
  {{ partial "category-sidebar.html" . }}
  <div class="catalogue-main">
    <div class="grid">
      {{- range .Pages }}
        {{ partial "project-card.html" . }}
      {{- end }}
    </div>
  </div>
</div>
{{ end }}
```

- [ ] **Step 9: Remove tag links from the card**

In `layouts/_partials/project-card.html`, delete the entire `{{- with $p.Params.tags }} … {{- end }}` block. Tags no longer exist.

- [ ] **Step 10: Repoint the old tag assertions**

Four assertions from the original build reference `/tags/`. Delete these four lines from `scripts/test.sh` — the taxonomy they test no longer exists, and the six new assertions from Step 1 cover its replacement:

```
assert_file public/tags/index.html …
assert_file public/tags/branding/index.html …
assert_contains public/tags/branding/index.html …
assert_contains public/san-pham/index.html "/tags/branding/" …
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: `ALL PASS`, 52 assertions, **zero warnings**. A `WARN … kind "taxonomy"` here means the templates and the config did not land together.

Then confirm no stale tree remains:

```bash
ls public/tags 2>&1
```

Expected: `No such file or directory`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: danh-muc category taxonomy with sidebar, replacing tags"
```

---

### Task 4: Three-up grid, pagination, and the card rename

**Files:**
- Rename: `layouts/_partials/project-card.html` → `layouts/_partials/product-card.html`
- Modify: `hugo.toml`, `layouts/san-pham/section.html`, `layouts/term.html`, `assets/css/main.css`, `scripts/test.sh`

**Interfaces:**
- Consumes: `partial "category-sidebar.html"`, `partial "price.html"`, `partial "image.html"`.
- Produces: `partial "product-card.html"` (renamed). Pagination at `/san-pham/page/N/`.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

The stylesheet is fingerprinted, so its path must be resolved at runtime. The
assignment must come **before** the assertion that uses it, and the variable
must be referenced with `$` — `assert_matches assets_css …` would pass the
literal string `assets_css` as a filename, and since the helper begins
`[ -f "$1" ]` that assertion could never pass.

```bash
assets_css=$(ls public/css/main.min.*.css 2>/dev/null | head -1)
assert_matches "$assets_css" 'grid-template-columns: *repeat\(3, *1fr\)' "grid is three columns"
assert_file public/san-pham/page/2/index.html "pagination generates a second page"
assert_contains public/san-pham/index.html "catalogue-main" "grid page uses the catalogue layout"
```

The regex tolerates zero-or-more spaces because Hugo's minifier emits
`grid-template-columns:repeat(3,1fr)` without them.

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on the three-column and page-2 assertions.

- [ ] **Step 3: Rename the card partial**

```bash
git mv layouts/_partials/project-card.html layouts/_partials/product-card.html
```

Update both call sites — in `layouts/san-pham/section.html` and `layouts/term.html`, change `{{ partial "project-card.html" . }}` to `{{ partial "product-card.html" . }}`.

- [ ] **Step 4: Enable pagination**

In `hugo.toml`, add:

```toml
[pagination]
  pagerSize = 12
```

- [ ] **Step 5: Paginate both listings**

In `layouts/san-pham/section.html`, replace `{{- range .Pages }}` with a paginated range and add the pager below the grid:

```html
    <div class="grid">
      {{- $paginator := .Paginate .Pages }}
      {{- range $paginator.Pages }}
        {{ partial "product-card.html" . }}
      {{- end }}
    </div>
    {{ template "_internal/pagination.html" . }}
```

Apply the identical change in `layouts/term.html`, so category listings paginate on the same setting.

- [ ] **Step 6: Add enough seed products to exercise pagination**

Twelve per page means a second page needs at least thirteen products. Generate eleven filler products so the total reaches thirteen:

```bash
for i in $(seq -w 1 11); do
  d="content/san-pham/san-pham-$i"
  mkdir -p "$d"
  sips -s format jpeg -Z 1200 /System/Library/CoreServices/DefaultDesktop.heic --out "$d/cover.jpg" >/dev/null 2>&1
  cat > "$d/index.md" <<EOF
---
title: Chai nhựa HDPE mẫu $i
date: 2026-07-$(printf '%02d' $((i + 10)))
draft: false
summary: Sản phẩm mẫu để kiểm tra phân trang.
cover: cover.jpg
danh-muc: chai-hdpe
code: HD-6$i
capacity: 250ml
material: HDPE
neck: 24/410
weight: 100
---

Sản phẩm mẫu.
EOF
done
```

These are placeholder catalogue entries you will replace through the CMS. They are real content, not test fixtures — deleting them later is safe.

- [ ] **Step 7: Rewrite the grid CSS**

In `assets/css/main.css`, replace the `.grid` rule with:

```css
.catalogue { display: grid; grid-template-columns: 15rem 1fr; gap: 2.5rem; align-items: start; padding: 2rem 0; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
.sidebar h2 { font-size: 1rem; margin: 0 0 0.75rem; }
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar li { margin: 0 0 0.5rem; }
.sidebar a { text-decoration: none; font-size: 0.95rem; }
.sidebar a:hover { text-decoration: underline; }
.sidebar .count { color: var(--muted); font-size: 0.85rem; }
.price { display: block; font-weight: 600; margin-top: 0.25rem; }
.price-contact { color: var(--muted); font-weight: 500; }
.specs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem 1.5rem; margin: 1.5rem 0; }
.specs dt { color: var(--muted); font-size: 0.85rem; }
.specs dd { margin: 0; }
.pagination { display: flex; gap: 0.5rem; list-style: none; padding: 2rem 0 0; }
.pagination a, .pagination span { padding: 0.4rem 0.75rem; border: 1px solid var(--rule); border-radius: 4px; text-decoration: none; }
.pagination .active a { background: var(--ink); color: var(--bg); }

@media (max-width: 60rem) {
  .catalogue { grid-template-columns: 1fr; }
  .grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 34rem) {
  .grid { grid-template-columns: 1fr; }
}
```

The sidebar precedes the grid in the DOM, so on narrow screens it stacks above the products — which is what a catalogue wants, since the category list is the primary navigation.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: `ALL PASS`, 55 assertions, zero warnings.

Then confirm the split:

```bash
grep -c 'class=card' public/san-pham/index.html
grep -c 'class=card' public/san-pham/page/2/index.html
```

Expected: `12` then `1` (13 products total).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: three-up grid, sidebar layout and pagination"
```

---

### Task 5: Vietnamese site chrome and the 404 page

**Files:**
- Modify: `data/settings.yaml`, `content/_index.md`, `content/gioi-thieu/index.md`, `content/san-pham/_index.md`, `layouts/home.html`
- Create: `layouts/404.html`
- Modify: `scripts/test.sh`

**Interfaces:**
- Consumes: `hugo.Data.settings` keys `site_title`, `description`, `og_image`, `contact_email`, `nav[].label`, `nav[].url`, `social[].platform`, `social[].url` — unchanged from the original build.
- Produces: adds `phone` to `data/settings.yaml`. Task 6 exposes it through Decap.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

```bash
assert_file public/404.html "404 page is generated"
assert_contains public/404.html "Không tìm thấy" "404 page is in Vietnamese"
assert_contains public/index.html "Sản phẩm" "nav is in Vietnamese"
assert_contains public/index.html "HDPLAS" "home renders the Vietnamese site title"
assert_contains public/gioi-thieu/index.html "Giới thiệu" "about page is in Vietnamese"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on all five.

- [ ] **Step 3: Rewrite the settings**

Replace `data/settings.yaml`:

```yaml
site_title: HDPLAS
description: Chuyên sản xuất chai, hũ, nắp và can nhựa PET, HDPE cho thực phẩm, mỹ phẩm và dược phẩm.
og_image: ""
contact_email: sales@example.com
phone: "0900 000 000"
nav:
  - label: Trang chủ
    url: /
  - label: Sản phẩm
    url: /san-pham/
  - label: Giới thiệu
    url: /gioi-thieu/
social:
  - platform: Facebook
    url: https://facebook.com/
```

Replace `sales@example.com` and the phone with the real ones when you have them; they are editable in the CMS after Task 6.

- [ ] **Step 4: Add the phone to the footer**

In `layouts/_partials/footer.html`, insert before the `{{- range $s.social }}` line:

```html
      {{- with $s.phone }}
      <a href="tel:{{ replace . " " "" }}">{{ . }}</a>
      {{- end }}
```

- [ ] **Step 5: Rewrite the page content**

Replace `content/_index.md`:

```markdown
---
title: Trang chủ
hero_heading: Bao bì nhựa cho thực phẩm, mỹ phẩm và dược phẩm
hero_subheading: Chai, hũ, nắp và can nhựa PET, HDPE — sản xuất theo yêu cầu, số lượng lớn.
hero_image: hero.jpg
---
```

Replace `content/san-pham/_index.md`:

```markdown
---
title: Sản phẩm
intro: Danh mục chai, hũ, nắp và can nhựa. Liên hệ để nhận báo giá theo số lượng.
---
```

Replace `content/gioi-thieu/index.md`, keeping `portrait: ""` exactly as it is — it is the fixture proving an empty CMS image field renders nothing:

```markdown
---
title: Giới thiệu
portrait: ""
---

Chúng tôi sản xuất bao bì nhựa PET và HDPE cho ngành thực phẩm, mỹ phẩm và dược phẩm, phục vụ khách hàng trong và ngoài nước.
```

- [ ] **Step 6: Create the 404 page**

Create `layouts/404.html`:

```html
{{ define "main" }}
<article class="notfound">
  <h1>Không tìm thấy trang</h1>
  <p>Trang bạn tìm không tồn tại hoặc đã được chuyển.</p>
  <p><a href="{{ "/san-pham/" | relURL }}">Xem danh mục sản phẩm</a></p>
</article>
{{ end }}
```

Cloudflare Pages serves `/404.html` with a real 404 status for unmatched routes. Without this file it falls back to `index.html` with HTTP 200, which was verified against the live site and would let search engines index unlimited duplicate homepages.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: `ALL PASS`, 60 assertions, zero warnings.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Vietnamese site chrome and 404 page"
```

---

### Task 6: Decap CMS schema

The highest-risk task. Hugo does not validate front matter — a CMS field name that does not match what the templates read renders **blank with no build error**.

**Files:**
- Modify: `static/admin/config.yml`, `scripts/test.sh`

**Interfaces:**
- Consumes: every front matter key established in Tasks 2, 3 and 5.
- Produces: a CMS whose field names match the templates exactly.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

```bash
assert_contains public/admin/config.yml "content/san-pham" "CMS points at the renamed section"
assert_contains public/admin/config.yml "danh-muc" "CMS exposes the category field"
assert_contains public/admin/config.yml "Liên hệ" "CMS documents the blank-price behaviour"
assert_not_contains public/admin/config.yml "content/projects" "CMS has no stale projects path"
assert_not_contains public/admin/config.yml "external_url" "CMS no longer exposes portfolio fields"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on the first three and the two not-contains checks.

- [ ] **Step 3: Rewrite the products collection**

In `static/admin/config.yml`, replace the `projects` collection wholesale:

```yaml
  - name: san-pham
    label: Sản phẩm
    label_singular: Sản phẩm
    folder: content/san-pham
    path: "{{slug}}/index"
    media_folder: ""
    public_folder: ""
    create: true
    slug: "{{slug}}"
    summary: "{{title}}"
    sortable_fields: [weight, date, title]
    view_filters:
      - label: Bản nháp
        field: draft
        pattern: true
    fields:
      - { label: Tên sản phẩm, name: title, widget: string }
      - { label: Ngày, name: date, widget: datetime }
      - { label: Nháp, name: draft, widget: boolean, default: true }
      - label: Danh mục
        name: danh-muc
        widget: select
        options:
          - { label: Chai nhựa PET, value: chai-pet }
          - { label: Chai nhựa HDPE, value: chai-hdpe }
          - { label: Hũ nhựa, value: hu-nhua }
          - { label: Nắp & vòi, value: nap-voi }
          - { label: Can nhựa, value: can-nhua }
      - { label: Mã sản phẩm, name: code, widget: string, required: false }
      - { label: Mô tả ngắn, name: summary, widget: text }
      - { label: Ảnh chính, name: cover, widget: image }
      - label: Thư viện ảnh
        name: gallery
        widget: list
        required: false
        fields:
          - { label: Ảnh, name: image, widget: image }
          - { label: Chú thích, name: caption, widget: string, required: false }
      - { label: Dung tích, name: capacity, widget: string, required: false, hint: "Ví dụ 500ml" }
      - label: Chất liệu
        name: material
        widget: select
        required: false
        options: [PET, HDPE, PP, PVC]
      - { label: Cổ chai, name: neck, widget: string, required: false, hint: "Ví dụ 24/410" }
      - { label: Giá, name: price, widget: number, required: false, value_type: int, hint: "Để trống sẽ hiển thị Liên hệ" }
      - { label: Thứ tự hiển thị, name: weight, widget: number, required: false, value_type: int }
      - { label: Mô tả chi tiết, name: body, widget: markdown, required: false }
```

The `danh-muc` field name is hyphenated deliberately — Hugo requires the taxonomy's plural name as the front matter key. The select values are slugs, so `/danh-muc/<slug>/` URLs survive a label rewording.

- [ ] **Step 4: Update the pages and settings collections**

Replace the `pages` collection's file paths and labels:

```yaml
  - name: pages
    label: Trang
    files:
      - name: home
        label: Trang chủ
        file: content/_index.md
        media_folder: ""
        public_folder: ""
        fields:
          - { label: Tiêu đề, name: title, widget: string }
          - { label: Tiêu đề chính, name: hero_heading, widget: string }
          - { label: Mô tả phụ, name: hero_subheading, widget: text, required: false }
          - { label: Ảnh bìa, name: hero_image, widget: image, required: false }
          - { label: Nội dung, name: body, widget: markdown, required: false }
      - name: about
        label: Giới thiệu
        file: content/gioi-thieu/index.md
        media_folder: ""
        public_folder: ""
        fields:
          - { label: Tiêu đề, name: title, widget: string }
          - { label: Ảnh, name: portrait, widget: image, required: false }
          - { label: Nội dung, name: body, widget: markdown, required: false }
      - name: products_landing
        label: Trang sản phẩm
        file: content/san-pham/_index.md
        fields:
          - { label: Tiêu đề, name: title, widget: string }
          - { label: Giới thiệu, name: intro, widget: text, required: false }
```

And the settings collection, adding `phone`:

```yaml
  - name: settings
    label: Cài đặt
    files:
      - name: site
        label: Thông tin chung
        file: data/settings.yaml
        fields:
          - { label: Tên website, name: site_title, widget: string }
          - { label: Mô tả, name: description, widget: text }
          - { label: Ảnh chia sẻ mặc định, name: og_image, widget: image, required: false }
          - { label: Email liên hệ, name: contact_email, widget: string, required: false }
          - { label: Số điện thoại, name: phone, widget: string, required: false }
          - label: Menu
            name: nav
            widget: list
            fields:
              - { label: Nhãn, name: label, widget: string }
              - { label: Đường dẫn, name: url, widget: string }
          - label: Mạng xã hội
            name: social
            widget: list
            required: false
            fields:
              - { label: Nền tảng, name: platform, widget: string }
              - { label: Đường dẫn, name: url, widget: string }
```

- [ ] **Step 5: Verify the field-name contract by hand**

This is the step that matters. Run:

```bash
grep -oE '\.Params\.[a-zA-Z_-]+' layouts/ -r | sed 's/.*\.Params\.//' | sort -u
grep -oE 'name: [a-zA-Z_-]+' static/admin/config.yml | sed 's/name: //' | sort -u
```

Compare the two lists by eye. Every name a template reads must be offered by the CMS, and every CMS field must be one a template reads or Hugo consumes natively (`title`, `date`, `draft`, `weight`, `body`). Record the comparison in your report. A mismatch renders blank with no build error — this is the single most damaging defect this task can ship.

Also confirm the category values agree with the data file:

```bash
grep -oE 'value: [a-z-]+' static/admin/config.yml | sed 's/value: //' | sort
grep -oE 'slug: [a-z-]+' data/danhmuc.yaml | sed 's/slug: //' | sort
```

These two lists must be identical. If they diverge, the sidebar silently omits a category editors can select.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: `ALL PASS`, 65 assertions, zero warnings.

- [ ] **Step 7: Verify the CMS locally**

```bash
npx decap-server &
hugo server -D
```

Open `http://localhost:1313/admin/`. Confirm by hand, and report:

1. The sidebar shows Sản phẩm, Trang, Cài đặt.
2. Opening a product shows every field populated, with Vietnamese labels.
3. Danh mục is a dropdown of five options, not a text box.
4. Creating a product and uploading an Ảnh chính writes the image **beside** `index.md`:

```bash
ls content/san-pham/
```

Expected: a new directory containing `index.md` and the image together. **If the image lands in `static/images/uploads/` instead, stop — the per-collection `media_folder` override is wrong.**

5. Delete the test product, stop both servers, and re-run `./scripts/test.sh`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Vietnamese Decap schema for the product catalogue"
```

---

## Self-Review

**Spec coverage.** Vietnamese URLs → Task 1. Product fields and price/Liên hệ → Task 2. Category taxonomy, fixed list, sidebar skipping empty categories → Task 3. Three-up grid and pagination → Task 4. Vietnamese chrome and the 404 page → Task 5. CMS schema and the field-name contract → Task 6. Fixture preservation → Task 1 Steps 2 and 7. Assertion repointing → Task 1 Steps 3–4.

**Deviation from the spec, deliberate and necessary.** The spec calls the category front matter key `category`, on the principle that keys stay English. The smoke test proved Hugo requires the taxonomy's **plural** name as the front matter key, so it must be `danh-muc`. The spec's English-key rule exists to protect the *existing* verified keys (`cover`, `gallery`, `weight`); a new key that Hugo's own mechanics dictate is a different case. The slug values remain stable regardless of label changes.

**A second spec deviation.** The spec's sidebar shows "every category with a correct count". Hugo generates term pages only for categories in use, so rendering an empty category would produce a dead link. The sidebar therefore shows only non-empty categories, and Task 3 Step 1 asserts precisely this.

**Type consistency.** Front matter keys are identical across Tasks 2, 3, 5 and 6: `title`, `date`, `draft`, `summary`, `cover`, `gallery[].image`, `gallery[].caption`, `danh-muc`, `code`, `capacity`, `material`, `neck`, `price`, `weight`. Settings keys are identical across Task 5 and Task 6: `site_title`, `description`, `og_image`, `contact_email`, `phone`, `nav[].label`, `nav[].url`, `social[].platform`, `social[].url`. `partial "price.html"` takes a page in both call sites (Task 2 Steps 7 and 8). `partial "product-card.html"` is called from `san-pham/section.html` and `term.html` after the Task 4 rename.

**Assertion arithmetic.** 42 at start → +8 (Task 2) → +6 −4 (Task 3) → +3 (Task 4) → +5 (Task 5) → +5 (Task 6) = 65.

**Known gap, accepted.** Nothing verifies that the Decap `danh-muc` select options stay in sync with `data/danhmuc.yaml` beyond Task 6 Step 5's manual comparison. Automating it would mean parsing YAML in the shell harness; the manual check plus the sidebar's visible omission of a missing category is judged sufficient at five categories.
