# Hugo + Decap CMS Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portfolio/catalog website in Hugo, editable through Decap CMS in the browser by a small team, deployed to Cloudflare Pages on every push to `main`.

**Architecture:** The Git repository is the entire datastore — there is no runtime backend. Hugo builds static HTML from Markdown page bundles. Decap CMS is a browser app served from `/admin` that commits directly to the repo through the GitHub API. A single Cloudflare Worker exists only to hold the GitHub OAuth client secret and exchange an authorization code for a token during login.

**Tech Stack:** Hugo extended 0.164.0, Decap CMS 3.15.1, decap-server 3.10.0, Cloudflare Pages, Cloudflare Workers (wrangler 4.116.0), Node 26 (dev only).

**Spec:** `docs/superpowers/specs/2026-07-31-hugo-decap-cloudflare-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Hugo extended 0.164.0 exactly.** Verify with `hugo version` — the string must contain `+extended`. Non-extended builds cannot process WebP.
- **Config uses `locale`, not `languageCode`.** Hugo deprecated `languageCode` in v0.158.0; on 0.164 it emits a deprecation warning, which the harness treats as a failure.
- **Use Hugo's current template lookup system (v0.146+), never the legacy one.** No `layouts/_default/` directory. `page.html` not `single.html`. `section.html` not `list.html`. `home.html` not `index.html`. Partials live in `layouts/_partials/`, referenced as `{{ partial "name.html" . }}`.
- **`decap-cms` pinned to exactly `3.15.1`** in the admin script URL. Never a `^3` range — that script runs holding a repo write token.
- **The build must emit zero warnings.** `scripts/test.sh` treats any `WARN` or `deprecat` line in Hugo's output as a failure. This is the mechanism that catches accidental use of legacy template names.
- **All content is a page bundle** (`<slug>/index.md` with images beside it). Hugo cannot run image processing on files under `static/`.
- **Never commit the GitHub OAuth client secret.** It lives only in Worker secret storage via `wrangler secret put`.
- **The Worker must `postMessage` to an exact origin, never `*`,** and must verify the OAuth `state` on callback.
- **Commit after every task.** Conventional Commits style (`feat:`, `chore:`, `docs:`).

## File Structure

```
hugo.toml                       # site config; taxonomies, build settings
.gitignore                      # public/, resources/, node_modules/, .DS_Store
package.json                    # dev only: decap-server + npm scripts
scripts/test.sh                 # build + assert harness (the test suite)

archetypes/projects.md          # front matter template for new projects

assets/css/main.css             # single stylesheet, fingerprinted at build

content/
  _index.md                     # home: hero copy
  about/index.md                # about page
  projects/
    _index.md                   # catalog landing: title + intro
    <slug>/index.md + images    # one page bundle per catalog item

data/settings.yaml              # nav, social, SEO defaults — Decap-editable

layouts/
  baseof.html                   # HTML shell, defines "main" block
  home.html                     # landing page
  page.html                     # about + any standalone page
  taxonomy.html                 # /tags/ index
  term.html                     # /tags/<tag>/
  projects/
    section.html                # catalog grid
    page.html                   # project detail
  _partials/
    head.html                   # meta, OG tags, stylesheet link
    header.html                 # site nav from settings
    footer.html                 # social links from settings
    image.html                  # responsive WebP srcset — every image goes through this
    project-card.html           # one grid cell

static/admin/
  index.html                    # loads Decap from CDN, pinned
  config.yml                    # collections, fields, backend

worker/
  package.json                  # type: module
  wrangler.toml                 # name, vars, compatibility_date
  src/index.js                  # OAuth proxy: /auth and /callback
  test/index.test.js            # node:test unit tests
```

**Responsibility boundaries.** `_partials/image.html` is the only place that knows about resizing and WebP; every template that shows an image delegates to it. `data/settings.yaml` is the only place site chrome copy lives, so Decap can edit nav and social links without touching config. The Worker knows nothing about the site except its origin.

---

### Task 1: Repo scaffold and test harness

Establishes the build and the assertion harness every later task extends. Nothing renders yet beyond a homepage.

**Files:**
- Create: `.gitignore`, `hugo.toml`, `scripts/test.sh`, `layouts/baseof.html`, `layouts/home.html`, `content/_index.md`

**Interfaces:**
- Consumes: nothing
- Produces: `scripts/test.sh` with shell functions `pass`, `fail`, `assert_contains FILE STRING DESC`, `assert_matches FILE REGEX DESC`, `assert_not_contains FILE STRING DESC`, `assert_file PATH DESC`. Later tasks append assertions below the `# --- assertions ---` marker. `layouts/baseof.html` defines a `main` block that every other layout fills.

- [ ] **Step 1: Confirm the toolchain**

```bash
hugo version
```

Expected: `hugo v0.164.0+extended+withdeploy darwin/arm64`. If `+extended` is absent, stop and run `brew install hugo`.

- [ ] **Step 2: Write the test harness**

Create `scripts/test.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0
pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=1; }

assert_file() {
  if [ -f "$1" ]; then pass "$2"; else fail "$2 (missing file: $1)"; fi
}
assert_contains() {
  if [ -f "$1" ] && grep -qF -- "$2" "$1"; then pass "$3"; else fail "$3 (expected '$2' in $1)"; fi
}
assert_matches() {
  if [ -f "$1" ] && grep -qE -- "$2" "$1"; then pass "$3"; else fail "$3 (expected /$2/ in $1)"; fi
}
assert_not_contains() {
  if [ -f "$1" ] && grep -qF -- "$2" "$1"; then fail "$3 (unexpected '$2' in $1)"; else pass "$3"; fi
}

echo "==> Building"
BUILD_LOG=$(mktemp)
if ! hugo --gc --minify > "$BUILD_LOG" 2>&1; then
  cat "$BUILD_LOG"
  echo "BUILD FAILED"
  exit 1
fi
if grep -qiE 'WARN|deprecat' "$BUILD_LOG"; then
  echo "Build emitted warnings — these are failures:"
  grep -iE 'WARN|deprecat' "$BUILD_LOG"
  FAIL=1
else
  pass "build is clean (no warnings, no deprecations)"
fi

echo "==> Assertions"
# --- assertions ---
assert_file public/index.html "home page is generated"
assert_contains public/index.html "Chuongk48" "home page renders the site title"

echo
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32mALL PASS\033[0m\n'
else
  printf '\033[31mFAILURES\033[0m\n'
fi
exit $FAIL
```

Then make it executable:

```bash
chmod +x scripts/test.sh
```

- [ ] **Step 3: Run it to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL — Hugo errors because there is no `hugo.toml`, so the script exits with `BUILD FAILED`.

- [ ] **Step 4: Create the config**

Create `hugo.toml`:

```toml
baseURL = "https://example.com/"
locale = "en-us"
title = "Chuongk48"
enableRobotsTXT = true

# Taxonomies are switched on in Task 5, together with their templates.
# Leaving them enabled without templates makes Hugo emit a WARN, which
# scripts/test.sh treats as a failure.
disableKinds = ["taxonomy", "term"]

[markup.goldmark.renderer]
  unsafe = false

[minify]
  disableHTML = false
```

- [ ] **Step 5: Create the gitignore**

Create `.gitignore`:

```gitignore
public/
resources/
.hugo_build.lock
node_modules/
.DS_Store
.wrangler/
.dev.vars
```

- [ ] **Step 6: Create the base layout**

Create `layouts/baseof.html`:

```html
<!doctype html>
<html lang="en">
<head>
{{ block "head" . }}{{ end }}
</head>
<body>
  <main id="content">
    {{ block "main" . }}{{ end }}
  </main>
</body>
</html>
```

- [ ] **Step 7: Create the home layout and content**

Create `layouts/home.html`:

```html
{{ define "head" }}<title>{{ site.Title }}</title>{{ end }}
{{ define "main" }}
<h1>{{ site.Title }}</h1>
{{ .Content }}
{{ end }}
```

Create `content/_index.md`:

```markdown
---
title: Home
---
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: PASS — "build is clean", "home page is generated", "home page renders the site title".

- [ ] **Step 9: Commit**

```bash
git add .gitignore hugo.toml scripts/ layouts/ content/
git commit -m "feat: scaffold Hugo site with build assertion harness"
```

---

### Task 2: Site chrome from editable settings

Moves nav, social links, and SEO defaults into `data/settings.yaml` so Decap can edit them later without touching config.

**Files:**
- Create: `data/settings.yaml`, `assets/css/main.css`, `layouts/_partials/head.html`, `layouts/_partials/header.html`, `layouts/_partials/footer.html`
- Modify: `layouts/baseof.html`, `layouts/home.html`, `scripts/test.sh`

**Interfaces:**
- Consumes: `baseof.html`'s `head` and `main` blocks from Task 1.
- Produces: `site.Data.settings` with keys `site_title` (string), `description` (string), `nav` (list of `{label, url}`), `social` (list of `{platform, url}`), `contact_email` (string), `og_image` (string path). Partial `head.html` takes the page as context (`.`). Task 7 exposes exactly these keys through Decap.

- [ ] **Step 1: Write the failing assertions**

In `scripts/test.sh`, replace the two lines below `# --- assertions ---` with:

```bash
assert_file public/index.html "home page is generated"
assert_contains public/index.html "Chuongk48" "home page renders the site title"
assert_matches public/index.html '<meta name=.?description' "head emits a description meta tag"
assert_matches public/index.html '<meta property=.?og:title' "head emits OpenGraph title"
assert_matches public/index.html 'rel=.?canonical' "head emits a canonical link"
assert_matches public/index.html '<link rel=.?stylesheet.? href=./css/main\.[a-f0-9]+\.css' "stylesheet is fingerprinted"
assert_contains public/index.html "Projects" "header renders nav from settings"
assert_contains public/index.html "mailto:" "footer renders the contact email"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on the description meta, OpenGraph, canonical, stylesheet, nav, and mailto assertions.

- [ ] **Step 3: Create the settings data file**

Create `data/settings.yaml`:

```yaml
site_title: Chuongk48
description: Selected work and projects.
og_image: ""
contact_email: hello@example.com
nav:
  - label: Projects
    url: /projects/
  - label: About
    url: /about/
social:
  - platform: GitHub
    url: https://github.com/
```

- [ ] **Step 4: Create the stylesheet**

Create `assets/css/main.css`:

```css
:root {
  --ink: #16161a;
  --muted: #6b7280;
  --bg: #ffffff;
  --rule: #e5e7eb;
  --max: 68rem;
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #ededf0; --muted: #9ca3af; --bg: #101014; --rule: #2a2a32; }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
}
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; }
.wrap { max-width: var(--max); margin: 0 auto; padding: 0 1.25rem; }
.site-header, .site-footer { border-bottom: 1px solid var(--rule); }
.site-footer { border-bottom: 0; border-top: 1px solid var(--rule); margin-top: 4rem; }
.site-header .wrap, .site-footer .wrap {
  display: flex; gap: 1.5rem; align-items: baseline;
  justify-content: space-between; padding-top: 1.25rem; padding-bottom: 1.25rem;
}
.site-header nav a { margin-left: 1.25rem; text-decoration: none; }
.site-header nav a:hover { text-decoration: underline; }
.grid {
  display: grid; gap: 2rem;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  padding: 2rem 0;
}
.card h2 { font-size: 1.05rem; margin: 0.75rem 0 0.25rem; }
.card p { color: var(--muted); margin: 0; font-size: 0.925rem; }
.card a { text-decoration: none; }
.tags { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0; margin: 0.75rem 0 0; }
.tags a { font-size: 0.8rem; color: var(--muted); }
.meta { display: flex; gap: 1.5rem; color: var(--muted); font-size: 0.9rem; }
.meta dt { font-weight: 600; }
.meta dd { margin: 0; }
figure { margin: 2rem 0; }
figcaption { color: var(--muted); font-size: 0.875rem; margin-top: 0.5rem; }
```

- [ ] **Step 5: Create the head partial**

Create `layouts/_partials/head.html`:

```html
{{- $s := site.Data.settings -}}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ if .IsHome }}{{ $s.site_title }}{{ else }}{{ .Title }} — {{ $s.site_title }}{{ end }}</title>
<meta name="description" content="{{ with .Description }}{{ . }}{{ else }}{{ $s.description }}{{ end }}">
<link rel="canonical" href="{{ .Permalink }}">
<meta property="og:title" content="{{ if .IsHome }}{{ $s.site_title }}{{ else }}{{ .Title }}{{ end }}">
<meta property="og:type" content="{{ if .IsPage }}article{{ else }}website{{ end }}">
<meta property="og:url" content="{{ .Permalink }}">
{{- with $s.og_image }}
<meta property="og:image" content="{{ . | absURL }}">
{{- end }}
{{- with resources.Get "css/main.css" }}
  {{- $css := . | minify | fingerprint -}}
  <link rel="stylesheet" href="{{ $css.RelPermalink }}" integrity="{{ $css.Data.Integrity }}">
{{- end }}
```

- [ ] **Step 6: Create the header and footer partials**

Create `layouts/_partials/header.html`:

```html
{{- $s := site.Data.settings -}}
<header class="site-header">
  <div class="wrap">
    <a href="{{ "/" | relURL }}"><strong>{{ $s.site_title }}</strong></a>
    <nav>
      {{- range $s.nav }}
      <a href="{{ .url | relURL }}">{{ .label }}</a>
      {{- end }}
    </nav>
  </div>
</header>
```

Create `layouts/_partials/footer.html`:

```html
{{- $s := site.Data.settings -}}
<footer class="site-footer">
  <div class="wrap">
    <small>&copy; {{ now.Year }} {{ $s.site_title }}</small>
    <nav>
      {{- with $s.contact_email }}
      <a href="mailto:{{ . }}">Email</a>
      {{- end }}
      {{- range $s.social }}
      <a href="{{ .url }}" rel="noopener noreferrer" target="_blank">{{ .platform }}</a>
      {{- end }}
    </nav>
  </div>
</footer>
```

- [ ] **Step 7: Wire the partials into the base layout**

Replace the entire contents of `layouts/baseof.html`:

```html
<!doctype html>
<html lang="en">
<head>
{{ partial "head.html" . }}
</head>
<body>
  {{ partial "header.html" . }}
  <main id="content" class="wrap">
    {{ block "main" . }}{{ end }}
  </main>
  {{ partial "footer.html" . }}
</body>
</html>
```

Replace the entire contents of `layouts/home.html` (the `head` block is now owned by the partial):

```html
{{ define "main" }}
<h1>{{ site.Data.settings.site_title }}</h1>
{{ .Content }}
{{ end }}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: PASS on all eight assertions, build still clean.

- [ ] **Step 9: Commit**

```bash
git add data/ assets/ layouts/ scripts/test.sh
git commit -m "feat: site chrome driven by editable settings data file"
```

---

### Task 3: Responsive image partial

The single place in the codebase that knows about resizing and WebP. Verified during design: a 452 KB JPEG becomes 40 KB at 800w.

**Files:**
- Create: `layouts/_partials/image.html`
- Modify: `content/_index.md`, `layouts/home.html`, `scripts/test.sh`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `partial "image.html"` taking a dict with keys `img` (a Hugo image resource, **required**), `alt` (string, default `""`), `sizes` (string, default `"100vw"`), `loading` (string, default `"lazy"`). Emits a complete `<img>` with `srcset`, intrinsic `width`/`height`, and `decoding="async"`. Tasks 4, 5, and 6 call this and never call `.Resize` themselves.

- [ ] **Step 1: Write the failing assertions**

Append below the existing assertions in `scripts/test.sh`:

```bash
assert_matches public/index.html 'srcset=' "image partial emits a srcset"
assert_matches public/index.html '\.webp' "image partial converts to WebP"
assert_matches public/index.html 'width=.?[0-9]+.? height=.?[0-9]+' "image partial emits intrinsic dimensions"
assert_contains public/index.html 'decoding=async' "image partial sets async decoding"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on all four new assertions — no image is rendered yet.

- [ ] **Step 3: Create the image partial**

Create `layouts/_partials/image.html`:

```html
{{- $img := .img -}}
{{- $alt := .alt | default "" -}}
{{- $sizes := .sizes | default "100vw" -}}
{{- $loading := .loading | default "lazy" -}}
{{- if $img -}}
  {{- $srcset := slice -}}
  {{- range (slice 400 800 1200 1600) -}}
    {{- if ge $img.Width . -}}
      {{- $r := $img.Resize (printf "%dx webp q80" .) -}}
      {{- $srcset = $srcset | append (printf "%s %dw" $r.RelPermalink .) -}}
    {{- end -}}
  {{- end -}}
  {{- $base := $img.Resize "800x webp q80" -}}
  <img src="{{ $base.RelPermalink }}"
    {{- with $srcset }} srcset="{{ delimit . ", " }}" sizes="{{ $sizes }}"{{ end }}
    width="{{ $base.Width }}" height="{{ $base.Height }}"
    alt="{{ $alt }}" loading="{{ $loading }}" decoding="async">
{{- end -}}
```

The `ge $img.Width .` guard prevents upscaling: a 900px source produces 400w and 800w entries only.

- [ ] **Step 4: Add a hero image to the homepage**

Generate a placeholder so the homepage exercises the partial:

```bash
sips -s format jpeg -Z 2000 /System/Library/CoreServices/DefaultDesktop.heic --out content/hero.jpg
```

Replace `content/_index.md`:

```markdown
---
title: Home
hero_heading: Selected work
hero_subheading: Design and build projects from recent years.
hero_image: hero.jpg
---
```

Replace `layouts/home.html`:

```html
{{ define "main" }}
<h1>{{ with .Params.hero_heading }}{{ . }}{{ else }}{{ site.Data.settings.site_title }}{{ end }}</h1>
{{ with .Params.hero_subheading }}<p>{{ . }}</p>{{ end }}
{{ with .Resources.GetMatch (.Params.hero_image | default "hero.*") }}
  {{ partial "image.html" (dict "img" . "alt" $.Params.hero_heading "loading" "eager" "sizes" "(max-width: 68rem) 100vw, 68rem") }}
{{ end }}
{{ .Content }}
{{ end }}
```

`content/_index.md` is the home branch bundle, so `content/hero.jpg` is one of its page resources.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: PASS on all assertions. Confirm the size reduction is real:

```bash
ls -la content/hero.jpg && ls -la public/*.webp
```

Expected: source ~450 KB, the 800w WebP well under 100 KB.

- [ ] **Step 6: Commit**

```bash
git add layouts/ content/ scripts/test.sh
git commit -m "feat: responsive WebP image partial with srcset"
```

---

### Task 4: Projects collection — grid and detail

The core of the site. One page bundle per catalog item, a grid, and a detail page.

**Files:**
- Create: `archetypes/projects.md`, `content/projects/_index.md`, `content/projects/demo-project/index.md`, `layouts/projects/section.html`, `layouts/projects/page.html`, `layouts/_partials/project-card.html`
- Modify: `scripts/test.sh`

**Interfaces:**
- Consumes: `partial "image.html"` (Task 3) with its `img`/`alt`/`sizes`/`loading` dict keys.
- Produces: the project front matter contract — `title`, `date`, `draft`, `summary`, `cover`, `gallery` (list of `{image, caption}`), `tags`, `client`, `year`, `external_url`, `weight`. Task 5 reads `tags`. Task 7 exposes every one of these fields through Decap using **exactly these names**.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

```bash
assert_file public/projects/index.html "projects grid is generated"
assert_contains public/projects/index.html "Demo Project" "grid lists the demo project"
assert_contains public/projects/index.html "A short summary" "grid renders the summary"
assert_file public/projects/demo-project/index.html "project detail page is generated"
assert_contains public/projects/demo-project/index.html "Acme Corp" "detail renders the client field"
assert_contains public/projects/demo-project/index.html "2026" "detail renders the year field"
assert_matches public/projects/demo-project/index.html 'rel=.?noopener' "external link is rel-protected"
assert_contains public/projects/demo-project/index.html "A caption" "detail renders gallery captions"
assert_no_draft() { if [ -d public/projects/hidden-draft ]; then fail "draft project is excluded from build"; else pass "draft project is excluded from build"; fi; }
assert_no_draft
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL — `public/projects/index.html` does not exist.

- [ ] **Step 3: Create the archetype and section content**

Create `archetypes/projects.md`:

```markdown
---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
draft: true
summary: ""
cover: ""
gallery: []
tags: []
client: ""
year: {{ now.Year }}
external_url: ""
weight: 0
---
```

Create `content/projects/_index.md`:

```markdown
---
title: Projects
intro: Selected work from recent years.
---
```

- [ ] **Step 4: Create the seed project bundle**

```bash
mkdir -p content/projects/demo-project content/projects/hidden-draft
sips -s format jpeg -Z 2000 /System/Library/CoreServices/DefaultDesktop.heic --out content/projects/demo-project/cover.jpg
sips -s format jpeg -Z 1600 /System/Library/CoreServices/DefaultDesktop.heic --out content/projects/demo-project/shot-01.jpg
```

Create `content/projects/demo-project/index.md`:

```markdown
---
title: Demo Project
date: 2026-07-31
draft: false
summary: A short summary shown on the grid card.
cover: cover.jpg
gallery:
  - image: shot-01.jpg
    caption: A caption for the first gallery image.
tags:
  - branding
  - print
client: Acme Corp
year: 2026
external_url: https://example.com/
weight: 10
---

The project write-up goes here.
```

Create `content/projects/hidden-draft/index.md` — this exists solely to prove drafts are excluded:

```markdown
---
title: Hidden Draft
date: 2026-07-31
draft: true
summary: Should never appear in a production build.
---
```

- [ ] **Step 5: Create the card partial**

Create `layouts/_partials/project-card.html`:

```html
{{- $p := . -}}
<article class="card">
  <a href="{{ $p.RelPermalink }}">
    {{- with $p.Resources.GetMatch ($p.Params.cover | default "cover.*") }}
      {{ partial "image.html" (dict "img" . "alt" $p.Title "sizes" "(max-width: 40rem) 100vw, 17rem") }}
    {{- end }}
    <h2>{{ $p.Title }}</h2>
  </a>
  {{- with $p.Params.summary }}<p>{{ . }}</p>{{ end }}
</article>
```

- [ ] **Step 6: Create the grid and detail layouts**

Create `layouts/projects/section.html`:

```html
{{ define "main" }}
<h1>{{ .Title }}</h1>
{{ with .Params.intro }}<p>{{ . }}</p>{{ end }}
{{ .Content }}
<div class="grid">
  {{ range .Pages }}
    {{ partial "project-card.html" . }}
  {{ end }}
</div>
{{ end }}
```

`.Pages` uses Hugo's default ordering — weight first, then date descending — which is exactly the spec's rule. Do not add an explicit sort.

Create `layouts/projects/page.html`:

```html
{{ define "main" }}
<article>
  <h1>{{ .Title }}</h1>
  <dl class="meta">
    {{- with .Params.client }}<div><dt>Client</dt><dd>{{ . }}</dd></div>{{ end }}
    {{- with .Params.year }}<div><dt>Year</dt><dd>{{ . }}</dd></div>{{ end }}
  </dl>
  {{- with .Params.external_url }}
  <p><a href="{{ . }}" rel="noopener noreferrer" target="_blank">Visit project &rarr;</a></p>
  {{- end }}

  {{- with .Resources.GetMatch (.Params.cover | default "cover.*") }}
    {{ partial "image.html" (dict "img" . "alt" $.Title "loading" "eager" "sizes" "(max-width: 68rem) 100vw, 68rem") }}
  {{- end }}

  <div class="body">{{ .Content }}</div>

  {{- with .Params.gallery }}
  <div class="gallery">
    {{- range . }}
      {{- $item := . }}
      {{- with $.Resources.GetMatch $item.image }}
      <figure>
        {{ partial "image.html" (dict "img" . "alt" ($item.caption | default $.Title) "sizes" "(max-width: 44rem) 100vw, 44rem") }}
        {{- with $item.caption }}<figcaption>{{ . }}</figcaption>{{ end }}
      </figure>
      {{- end }}
    {{- end }}
  </div>
  {{- end }}
</article>
{{ end }}
```

Every optional field is wrapped in `{{ with }}`, so a missing value omits the element rather than rendering an empty one. This is the mitigation for Hugo not validating front matter.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: PASS on all assertions, including "draft project is excluded from build".

Then confirm drafts *do* appear in preview mode:

```bash
hugo --gc -D -d /tmp/hugo-draft-check >/dev/null 2>&1 && ls /tmp/hugo-draft-check/projects/
```

Expected: `hidden-draft` present. Then `rm -rf /tmp/hugo-draft-check`.

- [ ] **Step 8: Commit**

```bash
git add archetypes/ content/ layouts/ scripts/test.sh
git commit -m "feat: projects collection with grid and detail pages"
```

---

### Task 5: Tag taxonomy

Switches on the `tags` taxonomy and its templates together, so the build never passes through a warning state.

**Files:**
- Create: `layouts/taxonomy.html`, `layouts/term.html`
- Modify: `hugo.toml`, `layouts/_partials/project-card.html`, `scripts/test.sh`

**Interfaces:**
- Consumes: the `tags` front matter field (Task 4), `partial "project-card.html"` (Task 4).
- Produces: term pages at `/tags/<urlized-tag>/`.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

```bash
assert_file public/tags/index.html "tag index page is generated"
assert_file public/tags/branding/index.html "tag term page is generated"
assert_contains public/tags/branding/index.html "Demo Project" "term page lists tagged projects"
assert_contains public/projects/index.html "/tags/branding/" "grid card links to tag pages"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on all four — taxonomies are disabled in `hugo.toml`.

- [ ] **Step 3: Enable the tags taxonomy**

In `hugo.toml`, delete the `disableKinds` line and its two comment lines, then add:

```toml
[taxonomies]
  tag = "tags"
```

Declaring only `tag` also suppresses Hugo's default `categories` taxonomy, so no unused `/categories/` tree is generated.

- [ ] **Step 4: Create the taxonomy templates**

Create `layouts/taxonomy.html`:

```html
{{ define "main" }}
<h1>{{ .Title }}</h1>
<ul class="tags">
  {{- range .Pages }}
  <li><a href="{{ .RelPermalink }}">{{ .Title }} ({{ len .Pages }})</a></li>
  {{- end }}
</ul>
{{ end }}
```

Create `layouts/term.html`:

```html
{{ define "main" }}
<h1>Tagged &ldquo;{{ .Title }}&rdquo;</h1>
<div class="grid">
  {{- range .Pages }}
    {{ partial "project-card.html" . }}
  {{- end }}
</div>
{{ end }}
```

- [ ] **Step 5: Link tags from the grid card**

In `layouts/_partials/project-card.html`, insert before the closing `</article>`:

```html
  {{- with $p.Params.tags }}
  <ul class="tags">
    {{- range . }}
    <li><a href="{{ (printf "/tags/%s/" (urlize .)) | relURL }}">{{ . }}</a></li>
    {{- end }}
  </ul>
  {{- end }}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: PASS on all assertions, and critically the build stays clean — enabling taxonomies without these two templates is exactly what produces `WARN found no layout file for "html" for kind "taxonomy"`.

- [ ] **Step 7: Commit**

```bash
git add hugo.toml layouts/ scripts/test.sh
git commit -m "feat: tag taxonomy with index and term pages"
```

---

### Task 6: About page

**Files:**
- Create: `content/about/index.md`, `layouts/page.html`
- Modify: `scripts/test.sh`

**Interfaces:**
- Consumes: `partial "image.html"` (Task 3).
- Produces: `layouts/page.html`, which renders any standalone page. Task 7 exposes `content/about/index.md` as a Decap singleton with fields `title`, `portrait`, and body.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

```bash
assert_file public/about/index.html "about page is generated"
assert_contains public/about/index.html "About" "about page renders its title"
assert_contains public/about/index.html "studio based in" "about page renders body content"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL — `public/about/index.html` does not exist.

- [ ] **Step 3: Create the page layout**

Create `layouts/page.html`:

```html
{{ define "main" }}
<article>
  <h1>{{ .Title }}</h1>
  {{- with .Resources.GetMatch (.Params.portrait | default "portrait.*") }}
    {{ partial "image.html" (dict "img" . "alt" $.Title "sizes" "(max-width: 30rem) 100vw, 30rem") }}
  {{- end }}
  <div class="body">{{ .Content }}</div>
</article>
{{ end }}
```

- [ ] **Step 4: Create the about content**

```bash
mkdir -p content/about
```

Create `content/about/index.md`:

```markdown
---
title: About
portrait: ""
---

A small studio based in Ho Chi Minh City, working on brand and print projects.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: PASS on all assertions.

- [ ] **Step 6: Commit**

```bash
git add content/about/ layouts/page.html scripts/test.sh
git commit -m "feat: about page"
```

---

### Task 7: Decap CMS admin

Adds the CMS UI and its schema. After this task the entire content model is editable locally with **no OAuth, no GitHub, and no deploy** — which is what makes a later login problem unambiguously a Worker problem.

**Files:**
- Create: `static/admin/index.html`, `static/admin/config.yml`, `package.json`
- Modify: `scripts/test.sh`

**Interfaces:**
- Consumes: the project front matter contract from Task 4 and the settings keys from Task 2. **Every field name below must match those tasks exactly** — a mismatch renders blank with no build error.
- Produces: a working `/admin` route. Task 8 fills in `base_url`; Task 9 fills in `repo`.

- [ ] **Step 1: Write the failing assertions**

Append to `scripts/test.sh`:

```bash
assert_file public/admin/index.html "admin page is published"
assert_file public/admin/config.yml "admin config is published"
assert_contains public/admin/index.html "decap-cms@3.15.1" "Decap is pinned to an exact version"
assert_not_contains public/admin/index.html "decap-cms@^3" "Decap is not loaded from a floating range"
assert_contains public/admin/config.yml "external_url" "config exposes every project field"
assert_contains public/admin/config.yml "local_backend" "local backend is enabled for offline editing"
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh`
Expected: FAIL on all six.

- [ ] **Step 3: Create the admin entry point**

Create `static/admin/index.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Content Manager</title>
</head>
<body>
  <script src="https://unpkg.com/decap-cms@3.15.1/dist/decap-cms.js"></script>
</body>
</html>
```

The version is pinned exactly. This script runs holding a GitHub token with repo write access; a `^3` range would auto-adopt any future publish.

- [ ] **Step 4: Create the CMS schema**

Create `static/admin/config.yml`. `PLACEHOLDER_OWNER/PLACEHOLDER_REPO` and the `base_url` are filled in during Tasks 8 and 9:

```yaml
backend:
  name: github
  repo: PLACEHOLDER_OWNER/PLACEHOLDER_REPO
  branch: main
  base_url: https://PLACEHOLDER_WORKER.workers.dev
  auth_endpoint: auth

local_backend: true

media_folder: static/images/uploads
public_folder: /images/uploads

collections:
  - name: projects
    label: Projects
    label_singular: Project
    folder: content/projects
    path: "{{slug}}/index"
    media_folder: ""
    public_folder: ""
    create: true
    slug: "{{slug}}"
    summary: "{{title}} — {{year}}"
    sortable_fields: [weight, date, title]
    view_filters:
      - label: Drafts only
        field: draft
        pattern: true
    fields:
      - { label: Title, name: title, widget: string }
      - { label: Date, name: date, widget: datetime }
      - { label: Draft, name: draft, widget: boolean, default: true }
      - { label: Summary, name: summary, widget: text }
      - { label: Cover image, name: cover, widget: image }
      - label: Gallery
        name: gallery
        widget: list
        required: false
        fields:
          - { label: Image, name: image, widget: image }
          - { label: Caption, name: caption, widget: string, required: false }
      - { label: Tags, name: tags, widget: list, required: false }
      - { label: Client, name: client, widget: string, required: false }
      - { label: Year, name: year, widget: number, required: false, value_type: int }
      - { label: External URL, name: external_url, widget: string, required: false }
      - { label: Order weight, name: weight, widget: number, required: false, value_type: int }
      - { label: Body, name: body, widget: markdown, required: false }

  - name: pages
    label: Pages
    files:
      - name: home
        label: Home page
        file: content/_index.md
        media_folder: ""
        public_folder: ""
        fields:
          - { label: Title, name: title, widget: string }
          - { label: Hero heading, name: hero_heading, widget: string }
          - { label: Hero subheading, name: hero_subheading, widget: text, required: false }
          - { label: Hero image, name: hero_image, widget: image, required: false }
          - { label: Body, name: body, widget: markdown, required: false }
      - name: about
        label: About page
        file: content/about/index.md
        media_folder: ""
        public_folder: ""
        fields:
          - { label: Title, name: title, widget: string }
          - { label: Portrait, name: portrait, widget: image, required: false }
          - { label: Body, name: body, widget: markdown, required: false }
      - name: projects_landing
        label: Projects landing
        file: content/projects/_index.md
        fields:
          - { label: Title, name: title, widget: string }
          - { label: Intro, name: intro, widget: text, required: false }

  - name: settings
    label: Settings
    files:
      - name: site
        label: Site settings
        file: data/settings.yaml
        fields:
          - { label: Site title, name: site_title, widget: string }
          - { label: Description, name: description, widget: text }
          - { label: Default share image, name: og_image, widget: image, required: false }
          - { label: Contact email, name: contact_email, widget: string, required: false }
          - label: Navigation
            name: nav
            widget: list
            fields:
              - { label: Label, name: label, widget: string }
              - { label: URL, name: url, widget: string }
          - label: Social links
            name: social
            widget: list
            required: false
            fields:
              - { label: Platform, name: platform, widget: string }
              - { label: URL, name: url, widget: string }
```

`path: "{{slug}}/index"` makes Decap create the page bundle directory. `media_folder: ""` puts uploads inside that bundle, so Hugo can process them and the stored path is a bare filename like `cover.jpg` — exactly what `.Resources.GetMatch` expects. The `settings` collection deliberately omits the override so its images use the global `static/images/uploads`; a data file is not a page bundle.

- [ ] **Step 5: Add the local editing dependency**

Create `package.json`:

```json
{
  "name": "chuongk48-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "hugo server -D",
    "cms": "decap-server",
    "test": "./scripts/test.sh"
  },
  "devDependencies": {
    "decap-server": "3.10.0"
  }
}
```

Then install:

```bash
npm install
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `./scripts/test.sh`
Expected: PASS on all six new assertions.

- [ ] **Step 7: Verify the CMS end to end, locally**

In one terminal:

```bash
npx decap-server
```

In another:

```bash
hugo server -D
```

Open `http://localhost:1313/admin/`. Confirm each of these by hand:

1. It opens straight into the CMS with no login prompt — that is `local_backend` working.
2. Projects, Pages, and Settings all appear in the sidebar.
3. Open Demo Project. Every field from Task 4 is present and populated.
4. Create a new project, upload an image to Cover, and save.
5. Confirm on disk that a page bundle was created:

```bash
ls content/projects/
```

Expected: a new directory containing `index.md` and the uploaded image side by side. **If the image landed anywhere else, the `media_folder`/`path` settings are wrong — fix before continuing.**

6. Delete the test project directory, then re-run `./scripts/test.sh`.

- [ ] **Step 8: Commit**

```bash
git add static/admin/ package.json package-lock.json scripts/test.sh
git commit -m "feat: Decap CMS admin with local backend for offline editing"
```

---

### Task 8: Cloudflare Worker OAuth proxy

Roughly 100 lines whose only job is holding the client secret. The two security properties below are the highest-consequence lines in the project.

**Files:**
- Create: `worker/package.json`, `worker/wrangler.toml`, `worker/src/index.js`, `worker/test/index.test.js`

**Interfaces:**
- Consumes: nothing from the Hugo site.
- Produces: `GET /auth` → 302 to GitHub with a `state` cookie; `GET /callback` → HTML that `postMessage`s `authorization:github:success:{"token":...,"provider":"github"}` to `env.SITE_ORIGIN`. Requires env `GITHUB_CLIENT_ID`, `SITE_ORIGIN` (vars) and `GITHUB_CLIENT_SECRET` (secret). Task 9 points Decap's `base_url` at this Worker.

- [ ] **Step 1: Scaffold the worker package**

```bash
mkdir -p worker/src worker/test
```

Create `worker/package.json`:

```json
{
  "name": "decap-oauth-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "4.116.0"
  }
}
```

Then: `cd worker && npm install && cd ..`

- [ ] **Step 2: Write the failing tests**

Create `worker/test/index.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const env = {
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  SITE_ORIGIN: 'https://example.pages.dev',
}

test('/auth redirects to GitHub and sets a state cookie', async () => {
  const res = await worker.fetch(new Request('https://auth.example.dev/auth'), env)
  assert.equal(res.status, 302)

  const loc = new URL(res.headers.get('location'))
  assert.equal(loc.origin + loc.pathname, 'https://github.com/login/oauth/authorize')
  assert.equal(loc.searchParams.get('client_id'), 'test-client-id')
  assert.equal(loc.searchParams.get('scope'), 'repo')

  const state = loc.searchParams.get('state')
  assert.match(state, /^[0-9a-f]{32}$/, 'state must be 128 bits of hex')

  const cookie = res.headers.get('set-cookie')
  assert.ok(cookie.includes(`oauth_state=${state}`), 'cookie must carry the same state')
  assert.ok(cookie.includes('HttpOnly'), 'state cookie must be HttpOnly')
  assert.ok(cookie.includes('Secure'), 'state cookie must be Secure')
})

test('/callback rejects a mismatched state', async () => {
  const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
    headers: { cookie: 'oauth_state=bbbb' },
  })
  const res = await worker.fetch(req, env)
  assert.equal(res.status, 400)
})

test('/callback rejects a missing state cookie', async () => {
  const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa')
  const res = await worker.fetch(req, env)
  assert.equal(res.status, 400)
})

test('/callback posts the token to an exact origin, never a wildcard', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ access_token: 'gho_testtoken' }), {
      headers: { 'content-type': 'application/json' },
    })
  try {
    const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
      headers: { cookie: 'oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)

    const body = await res.text()
    assert.ok(body.includes('https://example.pages.dev'), 'must name the exact site origin')
    assert.ok(!body.includes('"*"'), 'must never postMessage to a wildcard origin')
    assert.ok(!body.includes("'*'"), 'must never postMessage to a wildcard origin')
    assert.ok(body.includes('gho_testtoken'), 'must deliver the token')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('/callback surfaces a GitHub error instead of hanging silently', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'bad_verification_code' }), {
      headers: { 'content-type': 'application/json' },
    })
  try {
    const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
      headers: { cookie: 'oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 502)
    assert.match(await res.text(), /bad_verification_code/)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('unknown routes 404', async () => {
  const res = await worker.fetch(new Request('https://auth.example.dev/nope'), env)
  assert.equal(res.status, 404)
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd worker && npm test`
Expected: FAIL — `Cannot find module '../src/index.js'`.

- [ ] **Step 4: Implement the worker**

Create `worker/src/index.js`:

```js
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token'

function page(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html;charset=UTF-8', 'cache-control': 'no-store' },
  })
}

function errorPage(message, status) {
  return page(
    `<!doctype html><meta charset="utf-8"><title>Login failed</title>
<body style="font:16px/1.5 system-ui;padding:2rem;max-width:34rem">
<h1>Login failed</h1><p>${message}</p>
<p>Close this window and try again.</p></body>`,
    status,
  )
}

function randomState() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? match[1] : null
}

// Decap's handshake: the popup announces itself, the CMS window replies,
// then the popup delivers the token. Every postMessage names an exact
// origin — a wildcard would hand a repo-write token to any page that can
// open this popup.
function successPage(token, siteOrigin) {
  const payload = JSON.stringify(JSON.stringify({ token, provider: 'github' }))
  const origin = JSON.stringify(siteOrigin)
  return page(`<!doctype html><meta charset="utf-8"><title>Signing in…</title>
<body><p>Signing in…</p><script>
(function () {
  var origin = ${origin};
  var message = 'authorization:github:success:' + ${payload};
  function deliver() {
    if (window.opener) window.opener.postMessage(message, origin);
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return;
    deliver();
  }, false);
  if (window.opener) window.opener.postMessage('authorizing:github', origin);
})();
</script></body>`)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/auth') {
      const state = randomState()
      const target = new URL(GITHUB_AUTHORIZE)
      target.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
      target.searchParams.set('scope', 'repo')
      target.searchParams.set('state', state)
      target.searchParams.set('redirect_uri', `${url.origin}/callback`)

      return new Response(null, {
        status: 302,
        headers: {
          location: target.toString(),
          'set-cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
          'cache-control': 'no-store',
        },
      })
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const expected = readCookie(request, 'oauth_state')

      if (!code || !state || !expected || state !== expected) {
        return errorPage('Invalid or expired OAuth state.', 400)
      }

      let data
      try {
        const res = await fetch(GITHUB_TOKEN, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': 'decap-oauth-worker',
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: `${url.origin}/callback`,
          }),
        })
        data = await res.json()
      } catch (err) {
        return errorPage(`Could not reach GitHub: ${err.message}`, 502)
      }

      if (data.error || !data.access_token) {
        return errorPage(`GitHub rejected the request: ${data.error || 'no access token returned'}`, 502)
      }

      return successPage(data.access_token, env.SITE_ORIGIN)
    }

    return new Response('Not found', { status: 404 })
  },
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd worker && npm test`
Expected: PASS — all six tests.

- [ ] **Step 6: Create the wrangler config**

Create `worker/wrangler.toml`. Both values are corrected in Task 9 once the real URLs exist:

```toml
name = "chuongk48-decap-oauth"
main = "src/index.js"
compatibility_date = "2026-07-01"

[vars]
GITHUB_CLIENT_ID = "PLACEHOLDER_CLIENT_ID"
SITE_ORIGIN = "https://PLACEHOLDER.pages.dev"
```

`GITHUB_CLIENT_SECRET` is deliberately absent — it is set via `wrangler secret put` in Task 9 and must never appear in this file.

- [ ] **Step 7: Commit**

```bash
git add worker/
git commit -m "feat: Cloudflare Worker OAuth proxy for Decap with state and origin checks"
```

---

### Task 9: Deploy and wire everything together

The only task with manual console steps. Each is verified before moving on.

**Files:**
- Modify: `static/admin/config.yml`, `worker/wrangler.toml`, `hugo.toml`
- Create: `README.md`

**Interfaces:**
- Consumes: the Worker from Task 8, the admin config from Task 7.
- Produces: a live site and a working login.

- [ ] **Step 1: Create the GitHub repository and push**

```bash
git remote add origin git@github.com:<OWNER>/<REPO>.git
git branch -M main
git push -u origin main
```

Note the resulting `<OWNER>/<REPO>` — it is needed twice below.

- [ ] **Step 2: Create the Cloudflare Pages project**

In the Cloudflare dashboard: Workers & Pages → Create → Pages → Connect to Git, and select the repo. Set:

- Framework preset: **Hugo**
- Build command: `hugo --gc --minify`
- Build output directory: `public`
- Environment variables: `HUGO_VERSION` = `0.164.0`, `HUGO_ENV` = `production`

Under Settings → Build, confirm the **build image is the latest version**. Older images cap which Hugo versions they will install, and 0.164.0 will fail to fetch on an old one.

Wait for the first deploy, then note the assigned `https://<project>.pages.dev` URL.

- [ ] **Step 3: Verify the deployed site before touching auth**

```bash
curl -sSI https://<project>.pages.dev/ | head -1
curl -sS https://<project>.pages.dev/projects/ | grep -o "Demo Project" | head -1
curl -sSI https://<project>.pages.dev/admin/ | head -1
```

Expected: `HTTP/2 200`, `Demo Project`, `HTTP/2 200`. The admin page will render a login button that does not work yet — that is correct at this point.

- [ ] **Step 4: Create the GitHub OAuth App**

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App:

- Application name: `Chuongk48 CMS`
- Homepage URL: `https://<project>.pages.dev`
- Authorization callback URL: `https://chuongk48-decap-oauth.<your-subdomain>.workers.dev/callback`

The Worker subdomain is not known until Step 5, so use a placeholder now and **return to correct this field in Step 6**. Copy the Client ID, then generate and copy a Client Secret.

- [ ] **Step 5: Deploy the worker**

Update `worker/wrangler.toml` with the real values:

```toml
[vars]
GITHUB_CLIENT_ID = "<the client id from step 4>"
SITE_ORIGIN = "https://<project>.pages.dev"
```

`SITE_ORIGIN` must be scheme + host with **no trailing slash** — it is compared against `e.origin`, which never has one.

Then:

```bash
cd worker
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the secret; it is never written to disk
npx wrangler deploy
cd ..
```

Note the deployed `https://<worker>.<subdomain>.workers.dev` URL.

- [ ] **Step 6: Correct the OAuth callback URL**

Return to the GitHub OAuth App from Step 4 and set the Authorization callback URL to the real Worker URL plus `/callback`. A mismatch here produces GitHub's `redirect_uri_mismatch` error at login.

- [ ] **Step 7: Verify the worker in isolation**

```bash
curl -sSI "https://<worker>.<subdomain>.workers.dev/auth" | grep -Ei '^(HTTP|location|set-cookie)'
```

Expected: `HTTP/2 302`, a `location` pointing at `github.com/login/oauth/authorize` carrying your real client ID, and a `set-cookie` with `oauth_state=`, `HttpOnly`, and `Secure`.

- [ ] **Step 8: Point Decap at the worker**

In `static/admin/config.yml`, replace the three placeholders:

```yaml
backend:
  name: github
  repo: <OWNER>/<REPO>
  branch: main
  base_url: https://<worker>.<subdomain>.workers.dev
  auth_endpoint: auth
```

In `hugo.toml`, set the real `baseURL` (this makes canonical and OpenGraph URLs correct):

```toml
baseURL = "https://<project>.pages.dev/"
```

- [ ] **Step 9: Run the tests, then commit and push**

```bash
./scripts/test.sh
git add static/admin/config.yml worker/wrangler.toml hugo.toml
git commit -m "chore: wire Decap to the deployed OAuth worker"
git push
```

- [ ] **Step 10: Verify login end to end**

Wait for the Pages deploy, then in a browser:

1. Open `https://<project>.pages.dev/admin/`
2. Click **Login with GitHub** — a popup opens
3. Authorize the app; the popup closes and the CMS loads
4. Edit Demo Project's summary and publish
5. Confirm a new commit appears: `git fetch && git log origin/main --oneline -1`
6. Confirm the Pages build triggers and the change is live within ~60 seconds

If the popup closes with nothing happening, the cause is almost always `SITE_ORIGIN` not exactly matching the site's origin. Check the browser console on the `/admin` page for a `postMessage` origin mismatch.

- [ ] **Step 11: Add collaborators**

For each teammate: GitHub repo → Settings → Collaborators → add with **Write** access. They then log in at `/admin` with their own GitHub account; no other setup is required, and their edits are attributed to them in the commit history.

- [ ] **Step 12: Write the README**

Create `README.md`:

````markdown
# Chuongk48

Portfolio site. Hugo static site, Decap CMS for editing, Cloudflare Pages for hosting.

## Editing content

Go to `https://<project>.pages.dev/admin/` and log in with GitHub. Saving commits
to `main`; the site rebuilds automatically in about a minute.

New projects are created as drafts. Untick **Draft** to publish.

## Local development

```bash
npm install
npm run dev     # hugo server at :1313, drafts visible
npm run cms     # decap-server — enables /admin with no login
npm test        # build + assertions; any Hugo warning fails the run
```

Open `http://localhost:1313/admin/` with both running to edit against your
working copy without touching GitHub.

## Structure

- `content/projects/<slug>/index.md` — one page bundle per project, images beside it
- `data/settings.yaml` — nav, social links, SEO defaults
- `layouts/_partials/image.html` — every image renders through this
- `worker/` — Cloudflare Worker holding the GitHub OAuth secret

## Constraints

- Hugo **extended** 0.164.0, pinned via `HUGO_VERSION` on Cloudflare
- Layouts use Hugo's v0.146+ lookup rules — no `_default/`, no `single.html`
- Images must live inside a page bundle; Hugo cannot process `static/`
- `decap-cms` is pinned to an exact version, never a range
````

- [ ] **Step 13: Commit**

```bash
git add README.md
git commit -m "docs: usage and local development"
git push
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: architecture → Tasks 1, 8, 9; pinned versions → Global Constraints, Tasks 7, 8, 9; content model on disk → Tasks 3, 4, 6; Decap collections → Task 7; templates → Tasks 1–6; `postMessage` origin and `state` → Task 8 (with tests asserting both); Decap CDN pin → Task 7 (asserted); secrets → Task 9 Step 5; build-failure behavior → Cloudflare default, noted in Task 9; verification sequence → the five spec steps appear as Task 7 Step 7, Task 9 Steps 3, 7, 10.

**Deviation from the spec, deliberate.** The spec lists `layouts/section.html` implicitly under "seven files"; this plan uses `layouts/projects/section.html` and adds `taxonomy.html`, `term.html`, and `project-card.html`. The taxonomy templates are not optional — a smoke test during design confirmed that enabling `tags` without them makes Hugo emit `WARN found no layout file for "html" for kind "taxonomy"`, which the harness treats as a failure. Task 1 therefore ships with taxonomies disabled and Task 5 turns them on together with their templates, so the build is never warning-producing.

**Type consistency.** The project field names in Task 4's front matter, Task 4's templates, and Task 7's Decap config are identical: `title`, `date`, `draft`, `summary`, `cover`, `gallery[].image`, `gallery[].caption`, `tags`, `client`, `year`, `external_url`, `weight`. Settings keys in Task 2's data file, Task 2's partials, and Task 7's settings collection are identical: `site_title`, `description`, `og_image`, `contact_email`, `nav[].label`, `nav[].url`, `social[].platform`, `social[].url`. `partial "image.html"` is called with the same four dict keys (`img`, `alt`, `sizes`, `loading`) in Tasks 3, 4, and 6.

**Known gap, accepted.** `scripts/test.sh` asserts on built HTML rather than unit-testing templates, because Hugo has no template unit-test facility. The Worker, which is ordinary JavaScript, does get real unit tests.
