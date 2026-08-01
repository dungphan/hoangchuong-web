/*
  Catalogue search. Filters the product grid in place against the JSON index
  at /san-pham/index.json.

  The pure functions below are exported and unit-tested by
  scripts/search-test.mjs; the DOM wiring only runs in a browser. Keeping the
  matching logic pure is deliberate — accent folding and code punctuation are
  where this kind of search actually breaks, and neither is observable from
  the built HTML that scripts/test.sh greps.
*/

/*
  Fold text for accent-insensitive comparison, so "chai nhua" finds
  "Chai nhựa".

  NFD splits an accented letter into base + combining mark, which the range
  below then strips. Vietnamese đ/Đ is the exception: it is a distinct letter,
  not a composition, so NFD leaves it untouched and it must be mapped by hand.
  Miss that and every product with "đ" silently stops matching its unaccented
  spelling.
*/
export function fold(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/*
  Reduce to letters and digits only, so a code typed as "hd601" or "HD 601"
  still finds "HD-601", and "24410" finds a "24/410" neck.
*/
export function codeKey(text) {
  return fold(text).replace(/[^a-z0-9]/g, '');
}

/*
  Every whitespace-separated token must match, so "chai 500ml" narrows rather
  than widening.

  A token matches when some WORD of the haystack starts with it — not on a
  plain substring. Substring matching is too loose in Vietnamese: "hu" is
  inside "nhua", so searching for Hũ nhựa also returned every Chai nhựa.

  Tokens containing a digit additionally match against the
  punctuation-stripped form, which is what makes "hd601" and "24410" find
  "HD-601" and "24/410". That path is limited to digit-bearing tokens on
  purpose — applied to letters it would undo the precision above, since
  "pe" appears inside "hdpe".
*/
export function matchesQuery(haystack, query) {
  const tokens = String(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const words = fold(haystack).split(/[^a-z0-9]+/).filter(Boolean);
  const keyed = codeKey(haystack);
  return tokens.every((token) => {
    const t = fold(token);
    if (words.some((w) => w.startsWith(t))) return true;
    return /[0-9]/.test(token) && keyed.includes(codeKey(token));
  });
}

/*
  Returns null for a blank query to mean "not searching" — distinct from an
  empty array, which means "searched and found nothing". The caller restores
  the paginated grid on null and shows the empty state on [].
*/
export function filterItems(items, query) {
  if (String(query).trim() === '') return null;
  return items.filter((item) => matchesQuery(item.s, query));
}

function init() {
  const form = document.getElementById('product-search');
  const input = document.getElementById('product-search-input');
  const grid = document.getElementById('product-grid');
  const status = document.getElementById('product-search-status');
  if (!form || !input || !grid || !status) return;

  // Rendered server-side, revealed only once the script that drives it runs.
  form.hidden = false;

  const pager = document.querySelector('.pagination');
  const originalGrid = grid.innerHTML;
  let items = null;
  let loading = null;

  function load() {
    if (items) return Promise.resolve(items);
    if (!loading) {
      loading = fetch('/san-pham/index.json')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((data) => {
          items = data.items || [];
          return items;
        })
        .catch(() => {
          loading = null;
          status.textContent = 'Không tải được dữ liệu tìm kiếm.';
          return null;
        });
    }
    return loading;
  }

  function render(query) {
    const matched = items ? filterItems(items, query) : null;

    if (matched === null) {
      grid.innerHTML = originalGrid;
      status.textContent = '';
      if (pager) pager.hidden = false;
      return;
    }

    if (pager) pager.hidden = true;

    if (matched.length === 0) {
      grid.innerHTML = '';
      // textContent, not innerHTML — query is user input.
      status.textContent = 'Không tìm thấy sản phẩm nào phù hợp.';
      return;
    }

    grid.innerHTML = matched.map((item) => item.h).join('');
    status.textContent = `${matched.length} sản phẩm`;
  }

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const query = input.value;
      // Fetch on first use only, so visitors who never search pay nothing.
      load().then(() => render(query));
    }, 120);
  });

  // Enter must not navigate: filtering already happened as they typed.
  form.addEventListener('submit', (e) => e.preventDefault());
}

if (typeof document !== 'undefined') init();
