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
assert_contains public/index.html "Chuongk48" "home page renders the site title"
assert_matches public/index.html '<meta name=.?description' "head emits a description meta tag"
assert_matches public/index.html '<meta property=.?og:title' "head emits OpenGraph title"
assert_matches public/index.html 'rel=.?canonical' "head emits a canonical link"
assert_matches public/index.html '<link rel=.?stylesheet.? href=.?/css/main\.min\.[a-f0-9]+\.css' "stylesheet is fingerprinted"
assert_contains public/index.html "Projects" "header renders nav from settings"
assert_contains public/index.html "mailto:" "footer renders the contact email"
assert_matches public/index.html 'srcset=' "image partial emits a srcset"
assert_matches public/index.html '\.webp' "image partial converts to WebP"
assert_matches public/index.html 'width=.?[0-9]+.? height=.?[0-9]+' "image partial emits intrinsic dimensions"
assert_contains public/index.html 'decoding=async' "image partial sets async decoding"

assert_file public/san-pham/index.html "projects grid is generated"
assert_contains public/san-pham/index.html "Demo Project" "grid lists the demo project"
assert_contains public/san-pham/index.html "A short summary" "grid renders the summary"
assert_file public/san-pham/demo-project/index.html "project detail page is generated"
assert_contains public/san-pham/demo-project/index.html "Acme Corp" "detail renders the client field"
assert_matches public/san-pham/demo-project/index.html '<dt>Year</dt><dd>[0-9]{4}</dd>' "detail renders the year field"
assert_matches public/san-pham/demo-project/index.html 'rel=.?noopener' "external link is rel-protected"
assert_contains public/san-pham/demo-project/index.html "A caption" "detail renders gallery captions"
assert_matches public/san-pham/demo-project/index.html 'width=.?300.? height=.?168' "image partial does not upscale a sub-800px source (regression)"
assert_no_draft() { if [ -d public/san-pham/hidden-draft ]; then fail "draft project is excluded from build"; else pass "draft project is excluded from build"; fi; }
assert_no_draft

assert_file public/tags/index.html "tag index page is generated"
assert_file public/tags/branding/index.html "tag term page is generated"
assert_contains public/tags/branding/index.html "Demo Project" "term page lists tagged projects"
assert_contains public/san-pham/index.html "/tags/branding/" "grid card links to tag pages"

assert_file public/gioi-thieu/index.html "about page is generated"
assert_contains public/gioi-thieu/index.html "About" "about page renders its title"
assert_contains public/gioi-thieu/index.html "studio based in" "about page renders body content"

# --- CMS-field-wins regression (content/gioi-thieu has portrait: "" AND a portrait.jpg
# sitting in its bundle; an empty/absent field must win over any glob fallback) ---
assert_not_contains public/gioi-thieu/index.html "<img" "empty portrait field renders no image, even though content/gioi-thieu/portrait.jpg exists in the bundle"
assert_file content/gioi-thieu/portrait.jpg "regression fixture: portrait.jpg is present in the about bundle"

assert_file public/admin/index.html "admin page is published"
assert_file public/admin/config.yml "admin config is published"
assert_contains public/admin/index.html "decap-cms@3.15.1" "Decap is pinned to an exact version"
assert_not_contains public/admin/index.html "decap-cms@^3" "Decap is not loaded from a floating range"
assert_contains public/admin/config.yml "external_url" "config exposes every project field"
assert_contains public/admin/config.yml "local_backend" "local backend is enabled for offline editing"

echo
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32mALL PASS\033[0m\n'
else
  printf '\033[31mFAILURES\033[0m\n'
fi
exit $FAIL
