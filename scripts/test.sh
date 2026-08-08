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

# A running `hugo server` rewrites public/ with unminified markup and a
# livereload script injected. Every assertion that greps minified output then
# fails at once, which reads as a catastrophic regression rather than a stray
# background process. Name it instead.
# Checked by process, not by inspecting public/: the server overwrites our
# build asynchronously, so a file check here races and usually reads our own
# output. pgrep is deterministic.
if pgrep -f 'hugo server' > /dev/null 2>&1; then
  echo "A hugo server is running. It rewrites public/ with unminified output and a"
  echo "livereload script, so every assertion that greps minified markup fails at once."
  echo "Stop it first:  pkill -f 'hugo server'"
  exit 1
fi

echo "==> Building"
BUILD_LOG=$(mktemp)
# --cleanDestinationDir is load-bearing: Hugo does not purge public/ between
# builds, so a directory left behind by an earlier `hugo server -D` or `-D`
# build survives into a production build. Without this flag the
# "draft project is excluded" assertion tests accumulated disk state rather
# than what this build actually produced, and false-fails.
if ! hugo --gc --minify --cleanDestinationDir > "$BUILD_LOG" 2>&1; then
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
assert_contains public/index.html "HDPLAS" "home page renders the site title"
assert_contains public/index.html '<html lang=vi>' "html lang is Vietnamese, not the Hugo default en"
assert_matches public/index.html '<meta name=.?description' "head emits a description meta tag"
assert_matches public/index.html '<meta property=.?og:title' "head emits OpenGraph title"
assert_matches public/index.html 'rel=.?canonical' "head emits a canonical link"
assert_matches public/index.html '<link rel=.?stylesheet.? href=.?/css/main\.min\.[a-f0-9]+\.css' "stylesheet is fingerprinted"
assert_contains public/index.html "Trang chủ" "header renders nav from settings"
assert_contains public/index.html "mailto:" "footer renders the contact email"
assert_contains public/index.html "tel:" "footer renders the phone number"
assert_matches public/index.html 'srcset=' "image partial emits a srcset"
assert_matches public/index.html '\.webp' "image partial converts to WebP"
assert_matches public/index.html 'width=.?[0-9]+.? height=.?[0-9]+' "image partial emits intrinsic dimensions"
assert_contains public/index.html 'decoding=async' "image partial sets async decoding"

assert_file public/san-pham/index.html "projects grid is generated"
assert_contains public/san-pham/index.html '<h2>Hũ nhựa PET 1000ML</h2>' "grid lists the demo project"
assert_contains public/san-pham/index.html "Hũ nhựa PET dung tích 1000ml" "grid renders the summary"
assert_file public/san-pham/demo-project/index.html "project detail page is generated"
assert_contains public/san-pham/demo-project/index.html '<figcaption>Mặt trước</figcaption>' "detail renders gallery captions"
assert_matches public/san-pham/demo-project/index.html 'width=.?300.? height=.?168' "image partial does not upscale a sub-800px source (regression)"
assert_no_draft() { if [ -d public/san-pham/hidden-draft ]; then fail "draft project is excluded from build"; else pass "draft project is excluded from build"; fi; }
assert_no_draft

assert_file public/danh-muc/chai-pet/index.html "category term page is generated"
assert_contains public/san-pham/index.html "Chai nhựa PET <span class=count>" "sidebar renders the category label"
assert_contains public/san-pham/index.html "Chai nhựa HDPE <span class=count>(11)" "sidebar renders the correct product count per category"
assert_contains public/san-pham/index.html "/danh-muc/chai-pet/" "sidebar links to the category"
assert_not_contains public/san-pham/index.html "/danh-muc/can-nhua/" "sidebar does not link an empty category"
assert_contains public/danh-muc/chai-pet/index.html '<h2>Chai nhựa PET 500ML cổ 24/410</h2>' "term page lists its own products"
assert_file public/danh-muc/hu-nhua/index.html "hu-nhua term page is generated"
assert_not_contains public/danh-muc/hu-nhua/index.html "Chai nhựa PET 500ML" "term page excludes other categories' products"

assert_file public/gioi-thieu/index.html "about page is generated"
assert_contains public/gioi-thieu/index.html "<h1>Giới thiệu</h1>" "about page renders its title"
assert_contains public/gioi-thieu/index.html "Chúng tôi sản xuất bao bì nhựa PET và HDPE" "about page renders body content"

# --- CMS-field-wins regression (content/gioi-thieu has portrait: "" AND a portrait.jpg
# sitting in its bundle; an empty/absent field must win over any glob fallback) ---
assert_not_contains public/gioi-thieu/index.html "<img" "empty portrait field renders no image, even though content/gioi-thieu/portrait.jpg exists in the bundle"
assert_file content/gioi-thieu/portrait.jpg "regression fixture: portrait.jpg is present in the about bundle"

assert_file public/admin/index.html "admin page is published"
assert_file public/admin/config.yml "admin config is published"
assert_contains public/admin/index.html "decap-cms@3.15.1" "Decap is pinned to an exact version"
# The admin page is Hugo-rendered rather than static for one reason: the
# preview pane needs the real stylesheet and its name is fingerprinted. Serve
# it from static/ again and the preview silently goes back to unstyled.
assert_matches public/admin/index.html 'registerPreviewStyle\("/css/main\.min\.[a-f0-9]+\.css"\)' "preview pane loads the fingerprinted site stylesheet"
assert_contains public/admin/index.html 'registerPreviewTemplate("san-pham"' "products have a custom preview, not Decap's field dump"
assert_contains public/admin/index.html '"chai-hdpe":"Chai nhựa HDPE"' "preview knows the category labels"
# The map existing is not the same as the map being used: with the lookup
# deleted the preview still shipped the table and printed the raw slug.
assert_matches public/admin/index.html 'DANH_MUC\[[a-zA-Z_$]+\("danh-muc"\)\]' "preview actually looks the label up, rather than printing the slug"
assert_contains public/admin/index.html "<title>Quản trị nội dung" "admin page title is Vietnamese"
assert_not_contains public/admin/index.html "decap-cms@^3" "Decap is not loaded from a floating range"
# CMS field-name contract: Hugo never validates front matter against this file,
# so a renamed field silently renders blank in production. Each product field
# and settings key gets its own assertion tied to the CMS `name:` it must keep.
assert_contains public/admin/config.yml "name: title" "CMS config exposes the title field"
assert_contains public/admin/config.yml "name: date" "CMS config exposes the date field"
assert_contains public/admin/config.yml "name: draft" "CMS config exposes the draft field"
assert_contains public/admin/config.yml "name: danh-muc" "CMS config exposes the danh-muc field"
assert_contains public/admin/config.yml "name: code" "CMS config exposes the code field"
assert_contains public/admin/config.yml "name: summary" "CMS config exposes the summary field"
assert_contains public/admin/config.yml "name: cover" "CMS config exposes the cover field"
assert_contains public/admin/config.yml "name: gallery" "CMS config exposes the gallery field"
assert_contains public/admin/config.yml "name: image" "CMS config exposes the gallery image field"
assert_contains public/admin/config.yml "name: caption" "CMS config exposes the gallery caption field"
assert_contains public/admin/config.yml "name: capacity" "CMS config exposes the capacity field"
assert_contains public/admin/config.yml "name: material" "CMS config exposes the material field"
assert_contains public/admin/config.yml "name: neck" "CMS config exposes the neck field"
assert_contains public/admin/config.yml "name: price" "CMS config exposes the price field"
assert_contains public/admin/config.yml "name: weight" "CMS config exposes the weight field"
assert_contains public/admin/config.yml "name: body" "CMS config exposes the body field"
assert_contains public/admin/config.yml "name: site_title" "CMS config exposes the site_title setting"
assert_contains public/admin/config.yml "name: description" "CMS config exposes the description setting"
assert_contains public/admin/config.yml "name: og_image" "CMS config exposes the og_image setting"
assert_contains public/admin/config.yml "name: contact_email" "CMS config exposes the contact_email setting"
assert_contains public/admin/config.yml "name: phone" "CMS config exposes the phone setting"
assert_contains public/admin/config.yml "name: nav" "CMS config exposes the nav setting"
assert_contains public/admin/config.yml "name: social" "CMS config exposes the social setting"
assert_contains public/admin/config.yml "name: label" "CMS config exposes the nav label field"
assert_contains public/admin/config.yml "name: url" "CMS config exposes the nav/social url field"
assert_contains public/admin/config.yml "name: platform" "CMS config exposes the social platform field"
assert_contains public/admin/config.yml "local_backend" "local backend is enabled for offline editing"
assert_contains public/admin/config.yml "content/san-pham" "CMS points at the renamed section"
assert_contains public/admin/config.yml "danh-muc" "CMS exposes the category field"
assert_contains public/admin/config.yml "Liên hệ" "CMS documents the blank-price behaviour"
assert_not_contains public/admin/config.yml "content/projects" "CMS has no stale projects path"
assert_not_contains public/admin/config.yml "external_url" "CMS no longer exposes portfolio fields"

assert_contains public/san-pham/demo-project/index.html "125.000" "priced product renders a formatted price"
assert_contains public/san-pham/demo-project/index.html "<dt>Chất liệu</dt><dd>PET" "detail renders the material"
assert_contains public/san-pham/demo-project/index.html "24/410" "detail renders the neck size"
assert_contains public/san-pham/demo-project/index.html "1000ml" "detail renders the capacity"
assert_contains public/san-pham/demo-project/index.html "HD-1000" "detail renders the product code"
assert_contains public/san-pham/demo-project/index.html '<div class=contact-prompt><p>Liên hệ để nhận báo giá:</p>' "detail page renders a contact prompt"
assert_contains public/san-pham/demo-project/index.html '<a href=mailto:sales@example.com>sales@example.com</a>' "contact prompt links the settings email"
assert_contains public/san-pham/demo-project/index.html '<a href=tel:0900000000>0900 000 000</a></div>' "contact prompt links the settings phone"
assert_contains public/san-pham/chai-pet-500ml/index.html "Liên hệ" "unpriced product renders Liên hệ"
assert_not_contains public/san-pham/chai-pet-500ml/index.html "0 ₫" "unpriced product does not render a zero price"
# Anchored to the price element, not the bare word: "Liên hệ" also appears in
# the section intro copy, so a plain substring passed even with the price
# partial deleted from the card.
assert_contains public/san-pham/index.html '<span class="price price-contact">Liên hệ</span>' "grid card shows Liên hệ for unpriced products"
assert_contains public/san-pham/index.html '<span class=code>HD-1000</span>' "card leads with the product code"
assert_contains public/san-pham/index.html '<span class=spec>500ml · PET · 24/410</span>' "card spec line joins capacity, material and neck"

# --- design system ---
# Fonts are self-hosted so the site makes no third-party request, and the
# Vietnamese subset is not optional: without it every ộ ữ ế ị falls back.
assert_file public/fonts/be-vietnam-pro-400-vietnamese.woff2 "Vietnamese font subset is published"
assert_file public/fonts/be-vietnam-pro-800-latin.woff2 "display weight is published"
assert_file public/fonts/ibm-plex-mono-500-vietnamese.woff2 "mono Vietnamese subset is published"
assert_contains public/index.html '<p class=eyebrow>Nhà sản xuất bao bì nhựa</p>' "home hero carries its eyebrow"
assert_contains public/index.html '<span class="v data">1000ml</span>' "hero dimension callout states a real capacity"
assert_contains public/index.html '<span class="v data">24/410 · 28/410</span>' "capability strip states the standard neck sizes"
assert_contains public/index.html '<ul class=cat-list>' "home lists the product categories"

# --- theme toggle ---
# The initial theme must be applied by a synchronous inline script in <head>.
# Move it to a deferred script and every navigation flashes the system theme
# before switching, for anyone who chose the non-system option.
assert_contains public/index.html '<script>try{var t=localStorage.getItem("theme")' "theme is applied inline in head, before first paint"
assert_contains public/index.html 'class=theme-toggle id=theme-toggle hidden' "toggle renders hidden, so it never appears without the script that drives it"
assert_contains public/index.html 'aria-label="Đổi giao diện sáng/tối"' "toggle has a Vietnamese accessible name"
assert_matches public/index.html '<script type=module src=/js/theme\.min\.[a-f0-9]+\.js' "theme script is fingerprinted and loaded as a module"
assert_contains public/san-pham/index.html 'id=theme-toggle' "toggle is site-wide, not only on the home page"

assets_css=$(ls public/css/main.min.*.css 2>/dev/null | head -1)
# search.js sets pager.hidden = true. .pagination sets display:flex, which beat
# the UA's [hidden]{display:none}, so a search matching one product still
# showed the full pager underneath it and read as "search did nothing".
assert_contains "$assets_css" '[hidden]{display:none!important}' "the hidden attribute beats our own display rules"
# Anchored to the variable block: ':root[data-theme=dark]' alone also matches
# the toggle's own icon rules, so it passed with the palette override deleted.
assert_contains "$assets_css" ':root[data-theme=dark]{--ink:' "an explicit dark choice applies the palette regardless of the system"
assert_contains "$assets_css" ':root:not([data-theme=light])' "an explicit light choice wins over a dark system preference"
# The flush grid drew its gridlines as a background behind a 1px gap, so any
# row short of three showed dead cells — which is most search results.
assert_contains "$assets_css" '.card{background:var(--paper);border:1px solid var(--line)' "cards carry their own border, so a short row leaves no dead cells"
assert_not_contains "$assets_css" '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px' "grid no longer paints gridlines behind empty cells"
assert_contains "$assets_css" "Be Vietnam Pro" "CSS declares the Vietnamese display face"
assert_contains "$assets_css" "IBM Plex Mono" "CSS declares the mono face used for spec data"
assert_contains "$assets_css" "U+1EA0-1EF9" "font declares the Vietnamese unicode range"
assert_contains "$assets_css" "/fonts/be-vietnam-pro-400-vietnamese.woff2" "CSS points at the self-hosted font, not a third-party host"
assert_not_contains "$assets_css" "fonts.gstatic.com" "no third-party font request"
assert_matches "$assets_css" 'grid-template-columns: *repeat\(3, *1fr\)' "grid is three columns"
assert_file public/san-pham/page/2/index.html "pagination generates a second page"
assert_contains public/san-pham/index.html "catalogue-main" "grid page uses the catalogue layout"

# --- catalogue search ---
assert_file public/san-pham/index.json "search index is generated"
if python3 -c "import json; json.load(open('public/san-pham/index.json'))" 2>/dev/null; then
  pass "search index is valid JSON"
else
  fail "search index is valid JSON"
fi
assert_contains public/san-pham/index.json "HD-601" "search index carries the product code"
assert_contains public/san-pham/index.json "24/410" "search index carries the neck size"
assert_contains public/san-pham/index.json "250ml" "search index carries the capacity"
assert_contains public/san-pham/index.json "HDPE" "search index carries the material"
# The index is built from .Pages, not the paginator. Switching it to
# $paginator.Pages would silently make every product past the first page
# unsearchable — including HD-601, which lives on page 2.
assert_contains public/san-pham/index.json "Chai nhựa HDPE mẫu 01" "search index reaches products beyond grid page 1"
assert_not_contains public/san-pham/index.html "Chai nhựa HDPE mẫu 01" "that product is genuinely absent from page 1, so the assertion above is load-bearing"
# Results are injected as rendered cards, so a result cannot drift from a grid card.
assert_contains public/san-pham/index.json "price price-contact" "indexed cards carry the rendered price markup"
assert_contains public/san-pham/index.json "srcset=" "indexed cards carry the processed image"
assert_contains public/san-pham/index.html "id=product-search class=product-search role=search hidden" "search box renders hidden, so it never appears without the script that drives it"
assert_contains public/san-pham/index.html "id=product-grid" "grid is addressable by the search script"
assert_contains public/san-pham/index.html "Tìm theo tên hoặc mã sản phẩm" "search box has a Vietnamese placeholder"
assert_matches public/san-pham/index.html '<script type=module src=/js/search\.min\.[a-f0-9]+\.js' "search script is fingerprinted and loaded as a module"
assert_not_contains public/index.html "product-search" "search box is scoped to the catalogue, not injected site-wide"
# Accent folding, đ handling and code punctuation are runtime behaviour that no
# amount of grepping the built HTML can observe: a search box that renders
# perfectly and matches nothing would satisfy every assertion above.
SEARCH_LOG=$(mktemp)
if ! command -v node > /dev/null 2>&1; then
  fail "search matcher unit tests (node not found — the matcher cannot be verified)"
elif node scripts/search-test.mjs > "$SEARCH_LOG" 2>&1; then
  pass "search matcher unit tests ($(grep -c PASS "$SEARCH_LOG") assertions)"
else
  fail "search matcher unit tests"
  cat "$SEARCH_LOG"
fi

# Same reasoning for the toggle: whether a click flips away from the theme
# actually on screen depends on the system preference, which built HTML cannot
# show.
THEME_LOG=$(mktemp)
if ! command -v node > /dev/null 2>&1; then
  fail "theme toggle unit tests (node not found — the toggle cannot be verified)"
elif node scripts/theme-test.mjs > "$THEME_LOG" 2>&1; then
  pass "theme toggle unit tests ($(grep -c PASS "$THEME_LOG") assertions)"
else
  fail "theme toggle unit tests"
  cat "$THEME_LOG"
fi

assert_file public/404.html "404 page is generated"
assert_contains public/404.html "Không tìm thấy" "404 page is in Vietnamese"
assert_contains public/index.html "Sản phẩm" "nav is in Vietnamese"
assert_contains public/index.html "HDPLAS" "home renders the Vietnamese site title"
assert_contains public/gioi-thieu/index.html '<meta property="og:title" content="Giới thiệu">' "about page is in Vietnamese"

# robots.txt is generated from layouts/robots.txt, not served from static/.
# The Sitemap line is absolute by necessity — the spec gives crawlers no base
# to resolve a relative path against — so it silently encodes baseURL, and a
# stale baseURL points every crawler at the previous domain. Pinning the real
# host here makes that a test failure rather than a slow SEO leak.
assert_file public/robots.txt "robots.txt is generated"
assert_contains public/robots.txt "Sitemap: https://labcos-web.pages.dev/sitemap.xml" "robots.txt points crawlers at the sitemap on the current domain"
assert_contains public/robots.txt "Disallow: /admin/" "robots.txt keeps the CMS login page out of the index"
assert_file public/sitemap.xml "the sitemap that robots.txt advertises actually exists"

echo
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32mALL PASS\033[0m\n'
else
  printf '\033[31mFAILURES\033[0m\n'
fi
exit $FAIL
