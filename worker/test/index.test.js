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
