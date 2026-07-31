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
