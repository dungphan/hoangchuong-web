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
  assert.ok(cookie.startsWith('__Host-oauth_state='), 'state cookie must use the __Host- prefix (finding 4)')
  assert.ok(cookie.includes(`__Host-oauth_state=${state}`), 'cookie must carry the same state')
  assert.ok(cookie.includes('HttpOnly'), 'state cookie must be HttpOnly')
  assert.ok(cookie.includes('Secure'), 'state cookie must be Secure')
})

test('/callback rejects a mismatched state', async () => {
  const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
    headers: { cookie: '__Host-oauth_state=bbbb' },
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
      headers: { cookie: '__Host-oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)

    const body = await res.text()
    assert.ok(body.includes('https://example.pages.dev'), 'must name the exact site origin')
    assert.ok(!body.includes('"*"'), 'must never postMessage to a wildcard origin')
    assert.ok(!body.includes("'*'"), 'must never postMessage to a wildcard origin')
    assert.ok(body.includes('gho_testtoken'), 'must deliver the token')

    const cookie = res.headers.get('set-cookie')
    assert.ok(cookie, 'a successful callback must clear the state cookie (finding 8)')
    assert.ok(cookie.includes('__Host-oauth_state=;'), 'must clear the same cookie name it set')
    assert.ok(cookie.includes('Max-Age=0'), 'must expire the cookie immediately')
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
      headers: { cookie: '__Host-oauth_state=aaaa' },
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

// --- Security review fix round 1: regression coverage for findings 1-4 and 6 ---

test('/callback fails loudly, not silently, when SITE_ORIGIN is not an exact origin (finding 3)', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ access_token: 'gho_testtoken' }), {
      headers: { 'content-type': 'application/json' },
    })
  try {
    const misconfigured = { ...env, SITE_ORIGIN: 'https://example.pages.dev/' } // trailing slash
    const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
      headers: { cookie: '__Host-oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, misconfigured)
    assert.equal(res.status, 500, 'must fail loudly instead of delivering a postMessage that can never match')
    assert.match(await res.text(), /SITE_ORIGIN/)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('/callback escapes "<" in the delivered token so it cannot close the <script> block (finding 1)', async () => {
  const realFetch = globalThis.fetch
  const evilToken = 'gho_ok</script><img src=x onerror=alert(1)>'
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ access_token: evilToken }), {
      headers: { 'content-type': 'application/json' },
    })
  try {
    const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
      headers: { cookie: '__Host-oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)

    const body = await res.text()
    assert.ok(!body.includes('</script><img'), 'must never let the token break out of the <script> element')
    assert.ok(body.includes('\\u003c/script'), 'must escape "<" to its \\u unicode escape inside the script literal')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('/callback HTML-escapes a GitHub error field before rendering it (finding 2)', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: '<img src=x onerror=alert(1)>' }), {
      headers: { 'content-type': 'application/json' },
    })
  try {
    const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
      headers: { cookie: '__Host-oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 502)

    const body = await res.text()
    assert.ok(!body.includes('<img src=x onerror'), 'must not render the GitHub error field as live HTML')
    assert.ok(body.includes('&lt;img src=x onerror=alert(1)&gt;'), 'must HTML-escape the error field')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('/callback HTML-escapes a non-JSON GitHub reply reflected via the parse-error message (finding 2)', async () => {
  const realFetch = globalThis.fetch
  // A non-JSON upstream body makes res.json() throw; Node/V8 quotes a prefix
  // of the offending body verbatim inside the SyntaxError message, and that
  // message is reflected into the 502 page via errorPage(`... ${err.message}`).
  globalThis.fetch = async () =>
    new Response('<script>alert(1)</script> not json', {
      headers: { 'content-type': 'application/json' },
    })
  try {
    const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
      headers: { cookie: '__Host-oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 502)

    const body = await res.text()
    assert.ok(!body.includes('<script>al'), 'must not reflect the raw upstream snippet as live HTML')
    assert.ok(body.includes('&lt;script&gt;al'), 'must HTML-escape the reflected parse-error message')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('/callback handles a literal GitHub JSON response of null without crashing (finding 6)', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('null', { headers: { 'content-type': 'application/json' } })
  try {
    const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
      headers: { cookie: '__Host-oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 502, 'a null response body must surface as a clean 502, not an uncaught 500')
    assert.match(await res.text(), /no access token returned/)
  } finally {
    globalThis.fetch = realFetch
  }
})

// --- Security review fix round 1: finding 5 — mutation-pinning tests ---
// Mutation testing found three properties that survived (were not caught by)
// the original six tests. Each test below was verified to go RED when its
// specific mutation is applied — see task-8-report.md for the exact
// mutate-run-restore transcript.

test('mutation pin: /callback reads the exact cookie name, not one it is a suffix of (finding 5)', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ access_token: 'gho_testtoken' }), {
      headers: { 'content-type': 'application/json' },
    })
  try {
    // A cookie whose name merely ENDS WITH "__Host-oauth_state" must not be
    // picked up in place of the real one. readCookie's regex anchors the
    // match to `(?:^|;\s*)name=`; without that anchor, String.match finds
    // the leftmost occurrence of "name=" anywhere, including mid-string
    // inside "x__Host-oauth_state=wrong-state".
    const req = new Request('https://auth.example.dev/callback?code=abc&state=right-state', {
      headers: { cookie: 'x__Host-oauth_state=wrong-state; __Host-oauth_state=right-state' },
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200, 'must read the anchored cookie value ("right-state"), not the suffix match ("wrong-state")')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('mutation pin: embedded script only delivers the token to the exact site origin (finding 5)', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ access_token: 'gho_testtoken' }), {
      headers: { 'content-type': 'application/json' },
    })
  try {
    const req = new Request('https://auth.example.dev/callback?code=abc&state=aaaa', {
      headers: { cookie: '__Host-oauth_state=aaaa' },
    })
    const res = await worker.fetch(req, env)
    const body = await res.text()

    const scriptMatch = body.match(/<script>([\s\S]*?)<\/script>/)
    assert.ok(scriptMatch, 'response must embed a <script> block')

    // Run the extracted script against a fake `window`. If `origin` were
    // built via raw string concatenation instead of JSON.stringify (the
    // third finding-5 mutant), "https://example.pages.dev" contains "//",
    // which opens a JS line comment and makes the generated script fail to
    // parse at all — so merely reaching the assertions below already pins
    // that JSON.stringify is used, not string concatenation.
    const calls = []
    const timeouts = []
    let handlers = []
    const fakeWindow = {
      opener: { postMessage: (msg, origin) => calls.push([msg, origin]) },
      addEventListener: (_type, handler) => {
        handlers.push(handler)
      },
      removeEventListener: (_type, handler) => {
        handlers = handlers.filter((h) => h !== handler)
      },
      setTimeout: (fn, ms) => timeouts.push([fn, ms]),
    }
    // Mimics a real EventTarget: dispatching invokes only handlers currently
    // registered, so a handler removed via removeEventListener stops firing —
    // this is what lets the "no double delivery" assertion below be a
    // genuine behavioral check rather than calling a stale function reference.
    function dispatch(event) {
      for (const handler of handlers.slice()) handler(event)
    }

    new Function('window', scriptMatch[1])(fakeWindow)

    assert.equal(calls.length, 1, 'only the initial "authorizing:github" announce fires synchronously')
    assert.equal(handlers.length, 1, 'exactly one message listener must be registered')

    // A message from an untrusted origin must be ignored, not delivered.
    dispatch({ origin: 'https://evil.example' })
    assert.equal(calls.length, 1, 'a message from an untrusted origin must not trigger delivery of the token')

    // A message from the real site origin (the CMS window replying) does deliver.
    dispatch({ origin: 'https://example.pages.dev' })
    assert.equal(calls.length, 2, 'a message from the exact site origin must deliver the token')
    assert.equal(calls[1][1], 'https://example.pages.dev', 'must postMessage to the exact origin, JSON-encoded correctly')
    assert.ok(calls[1][0].includes('gho_testtoken'))

    // A second reply must not cause a duplicate delivery (finding 7: listener cleanup).
    dispatch({ origin: 'https://example.pages.dev' })
    assert.equal(calls.length, 2, 'must not deliver twice once already delivered')
  } finally {
    globalThis.fetch = realFetch
  }
})
