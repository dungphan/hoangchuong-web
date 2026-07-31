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

echo
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32mALL PASS\033[0m\n'
else
  printf '\033[31mFAILURES\033[0m\n'
fi
exit $FAIL
