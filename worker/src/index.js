const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token'

// __Host- is a structural guarantee, not just a naming convention: a browser
// refuses to set this cookie unless the response was Secure, had Path=/, and
// carried no Domain attribute. That forecloses a sibling host on the same
// parent domain planting a same-named, wider-scoped cookie that sorts ahead
// of ours and gets picked up as if it were legitimate (login-CSRF).
const STATE_COOKIE = '__Host-oauth_state'

function page(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  })
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ))
}

function errorPage(message, status) {
  return page(
    `<!doctype html><meta charset="utf-8"><title>Login failed</title>
<body style="font:16px/1.5 system-ui;padding:2rem;max-width:34rem">
<h1>Login failed</h1><p>${escapeHtml(message)}</p>
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

// SITE_ORIGIN is hand-set in wrangler.toml (Task 9), not derived from a URL
// API, so a trailing slash or stray path is an easy typo. If it doesn't
// round-trip through `new URL(...).origin` unchanged, the popup's `e.origin
// !== origin` compare will never match the real browser Origin header and
// the login silently hangs with no diagnostic. Fail loudly instead.
function isExactOrigin(value) {
  try {
    return typeof value === 'string' && value !== '' && new URL(value).origin === value
  } catch {
    return false
  }
}

// A string embedded inside a <script> block via JSON.stringify is safe from
// breaking *out* of its JS string literal (quotes/backslashes/newlines are
// escaped), but JSON.stringify does not escape `<`. A token or origin value
// containing `</script>` still closes the element early — the HTML
// tokenizer leaves script-data state on the literal bytes `</script`
// regardless of what JS-level string they sit inside. Escaping `<` to its
// \u unicode escape is enough: it can no longer form that closing sequence.
function scriptSafeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

// Decap's handshake: the popup announces itself, the CMS window replies,
// then the popup delivers the token. Every postMessage names an exact
// origin — a wildcard would hand a repo-write token to any page that can
// open this popup.
function successPage(token, siteOrigin) {
  const payload = scriptSafeJson(JSON.stringify({ token, provider: 'github' }))
  const origin = scriptSafeJson(siteOrigin)
  return page(
    `<!doctype html><meta charset="utf-8"><title>Signing in…</title>
<body><p>Signing in…</p><script>
(function () {
  var origin = ${origin};
  var message = 'authorization:github:success:' + ${payload};
  var delivered = false;
  function onMessage(e) {
    if (e.origin !== origin) return;
    if (delivered) return;
    delivered = true;
    window.removeEventListener('message', onMessage, false);
    if (window.opener) window.opener.postMessage(message, origin);
  }
  window.addEventListener('message', onMessage, false);
  // Safety net: if the CMS window never replies, stop listening rather than
  // leaving the handler (and its closure over the token) alive indefinitely.
  window.setTimeout(function () {
    window.removeEventListener('message', onMessage, false);
  }, 10000);
  if (window.opener) window.opener.postMessage('authorizing:github', origin);
})();
</script></body>`,
    200,
    // The state cookie has done its job; clear it so it can't be replayed.
    { 'set-cookie': `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` },
  )
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
          'set-cookie': `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
          'cache-control': 'no-store',
        },
      })
    }

    if (url.pathname === '/callback') {
      if (!isExactOrigin(env.SITE_ORIGIN)) {
        return errorPage(
          'Worker misconfigured: SITE_ORIGIN must be an exact origin, e.g. "https://example.pages.dev" (no trailing slash or path).',
          500,
        )
      }

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const expected = readCookie(request, STATE_COOKIE)

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

      if (!data || typeof data !== 'object' || data.error || !data.access_token) {
        const detail = data && typeof data === 'object' ? data.error : undefined
        return errorPage(`GitHub rejected the request: ${detail || 'no access token returned'}`, 502)
      }

      return successPage(data.access_token, env.SITE_ORIGIN)
    }

    return new Response('Not found', { status: 404 })
  },
}
