# Deployment checklist

Everything in this document requires a web console (GitHub, Cloudflare) and/or
an interactive CLI login (`wrangler login`). None of it can be automated from
this repo or by an agent. A human operator must run through these steps in
order, verifying each before moving to the next.

The repository is `dungphan/hoangchuong-web`.

---

## 1. Push the repository

```bash
git remote add origin git@github.com:dungphan/hoangchuong-web.git
git branch -M main
git push -u origin main
```

## 2. Create the Cloudflare Pages project

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
Git**, select `dungphan/hoangchuong-web`, and set:

| Setting | Value |
|---|---|
| Framework preset | Hugo |
| Build command | `hugo --gc --minify` |
| Build output directory | `public` |
| Env var `HUGO_VERSION` | `0.164.0` |
| Env var `HUGO_ENV` | `production` |

Under **Settings → Build**, confirm the **build image is the latest version**.
Older images cap which Hugo versions they will install, and `0.164.0` will
fail to fetch on an old one.

This pins Hugo to `0.164.0` for Cloudflare's build only. `scripts/test.sh`
(Step 9) runs the same build locally, so install a matching **Hugo extended**
binary on your machine too — e.g. `brew install hugo` — and confirm with
`hugo version` that the output contains `+extended`; a non-extended build
cannot produce the WebP images this site relies on and will not match what
Cloudflare builds.

Note also that Cloudflare Pages auto-installs the root `package.json`'s
dependencies (`decap-server` and its transitive packages) before every
build, even though the build command above never calls `npm install`
explicitly. This is harmless — nothing here is needed at Hugo build time —
but it means the build is not literally "no npm install step on Cloudflare,"
so it's worth knowing rather than discovering by surprise.

Wait for the first deploy, then note the assigned `https://<project>.pages.dev`
URL.

## 3. Verify the deployed site before touching auth

Run these only after the Pages project exists and has completed its first
deploy:

```bash
curl -sSI https://<project>.pages.dev/ | head -1
curl -sS https://<project>.pages.dev/projects/ | grep -o "Demo Project" | head -1
curl -sSI https://<project>.pages.dev/admin/ | head -1
```

Expected: `HTTP/2 200`, `Demo Project`, `HTTP/2 200`. The admin page will
render a login button that does not work yet — that is correct at this point.

## 4. Create the GitHub OAuth App

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:

- Application name: `Chuongk48 CMS`
- Homepage URL: `https://<project>.pages.dev`
- Authorization callback URL: a placeholder — the real Worker subdomain is
  not known until Step 5, but GitHub validates this field and rejects
  anything that isn't a parseable URL, so `<your-subdomain>` literally typed
  in will bounce at form submit. Enter a valid throwaway value instead, e.g.
  `https://example.com/callback`, or run `npx wrangler whoami` first to get
  your real `workers.dev` subdomain and use
  `https://chuongk48-decap-oauth.<real-subdomain>.workers.dev/callback`
  directly. Either way, return and correct this field in Step 6.

Copy the Client ID, then generate and copy a Client Secret. The secret is
used once, in Step 5, and must never be committed to this repository.

## 5. Deploy the worker

Edit `worker/wrangler.toml` with the real values:

```toml
[vars]
GITHUB_CLIENT_ID = "<the client id from step 4>"
SITE_ORIGIN = "https://<project>.pages.dev"
```

**`SITE_ORIGIN` must be scheme + host with no trailing slash — see the
warning below before setting this.**

Then:

```bash
cd worker
npm install                                    # installs the pinned wrangler (see worker/package.json); without
                                                # this, npx would fetch whatever version npm currently serves
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the secret; it is never written to disk
npx wrangler deploy
cd ..
```

Note the deployed `https://<worker>.<subdomain>.workers.dev` URL.

## 6. Correct the OAuth callback URL

Return to the GitHub OAuth App from Step 4 and set the Authorization callback
URL to the real Worker URL plus `/callback`. A mismatch here produces
GitHub's `redirect_uri_mismatch` error at login.

## 7. Verify the worker in isolation

```bash
curl -sSI "https://<worker>.<subdomain>.workers.dev/auth" | grep -Ei '^(HTTP|location|set-cookie)'
```

Expected: `HTTP/2 302`, a `location` pointing at
`github.com/login/oauth/authorize` carrying your real client ID, and a
`set-cookie` with `__Host-oauth_state=`, `HttpOnly`, and `Secure`. The
`__Host-` prefix is load-bearing — it's what makes the browser enforce
`Secure`, `Path=/`, and no `Domain=` on this cookie, which is the whole CSRF
defence. A cookie missing that prefix is not a passing result.

## 8. Point Decap at the worker, and fix the site's baseURL

In `static/admin/config.yml`, replace the remaining placeholder:

```yaml
backend:
  name: github
  repo: dungphan/hoangchuong-web
  branch: main
  base_url: https://<worker>.<subdomain>.workers.dev
  auth_endpoint: auth
```

In `hugo.toml`, set the real `baseURL` (this makes canonical and OpenGraph
URLs correct):

```toml
baseURL = "https://<project>.pages.dev/"
```

## 9. Run the tests, then commit and push

```bash
./scripts/test.sh
git add static/admin/config.yml worker/wrangler.toml hugo.toml
git commit -m "chore: wire Decap to the deployed OAuth worker"
git push
```

## 10. Verify login end to end

Wait for the Pages deploy, then in a browser:

1. Open `https://<project>.pages.dev/admin/`
2. Click **Login with GitHub** — a popup opens
3. Authorize the app; the popup closes and the CMS loads
4. Edit Demo Project's summary and publish
5. Confirm a new commit appears: `git fetch && git log origin/main --oneline -1`
6. Confirm the Pages build triggers and the change is live within ~60 seconds

If the popup closes with nothing happening, the cause is almost always
`SITE_ORIGIN` not exactly matching the site's origin. Check the browser
console on the `/admin` page for a `postMessage` origin mismatch.

## 11. Add collaborators

For each teammate: GitHub repo → **Settings → Collaborators** → add with
**Write** access. They then log in at `/admin` with their own GitHub
account; no other setup is required, and their edits are attributed to them
in the commit history.

## 12. Browser-only verification the automated test suite cannot perform

`scripts/test.sh` and `worker/test` cover everything that can be asserted
against built HTML and worker responses, but they cannot drive a browser.
A human must additionally, against the live site (or `npm run dev` +
`npm run cms` locally):

1. Open `/admin/` in a browser.
2. Create a new Projects entry through the CMS UI.
3. Upload an image via the **Cover image** field.
4. Save/publish, then confirm on disk (or via `git log` / the repo tree)
   that a page bundle was created at `content/projects/<slug>/index.md`
   with the uploaded image file sitting beside `index.md` in the same
   directory — not in a shared `static/images/uploads/` folder.

This confirms the `media_folder: ""` / `public_folder: ""` per-collection
override in `static/admin/config.yml` actually produces page-bundle-relative
images in practice, not just in config.

---

## Placeholder inventory

Every placeholder below must be replaced before the corresponding step will
work. (Confirmed present as of this writing via
`grep -rn "PLACEHOLDER" static/admin/config.yml worker/wrangler.toml`.)

| File | Line | Placeholder | Replace with |
|---|---|---|---|
| `worker/wrangler.toml` | 6 | `GITHUB_CLIENT_ID = "PLACEHOLDER_CLIENT_ID"` | The Client ID from the GitHub OAuth App (Step 4) |
| `worker/wrangler.toml` | 7 | `SITE_ORIGIN = "https://PLACEHOLDER.pages.dev"` | The real Cloudflare Pages origin, e.g. `https://<project>.pages.dev` — scheme + host, no trailing slash (see warning below) |
| `static/admin/config.yml` | 5 | `base_url: https://PLACEHOLDER_WORKER.workers.dev` | The deployed Worker URL, e.g. `https://<worker>.<subdomain>.workers.dev` |

Also update, though these are not literal `PLACEHOLDER` strings:

| File | Line | Current value | Replace with |
|---|---|---|---|
| `hugo.toml` | 1 | `baseURL = "https://example.com/"` | `baseURL = "https://<project>.pages.dev/"` |

The GitHub Client Secret is not a file placeholder at all — it is set once,
directly into Cloudflare's secret store, via `npx wrangler secret put
GITHUB_CLIENT_SECRET` in Step 5, and is never written to any file in this
repository.

---

## OAuth scope: `public_repo`, and what it costs

The Worker requests `scope=public_repo`, not `repo` (`worker/src/index.js`).

Classic OAuth Apps cannot be scoped to a single repository — the scope applies
to the whole account. `repo` is the only classic scope that reaches **private**
repositories, so requesting it would grant the CMS read/write over every private
repo on the account, plus org projects, invitations, team memberships, and
webhooks. The GitHub consent screen says so in plain language, and it is correct
to find that alarming for a personal portfolio site.

`public_repo` removes private-repo access entirely. It still grants write access
to *all* public repositories on the account, not just this one — that is the
floor for classic OAuth Apps. Genuine per-repository permissions require a
**GitHub App**, whose user-to-server tokens Decap's `github` backend does not
support; adopting one means building a custom auth path, not changing a setting.

**Consequence to remember:** if `dungphan/hoangchuong-web` is ever made
**private**, `public_repo` stops working and login breaks. The fix is to change
the scope back to `repo` in `worker/src/index.js`, update the assertion in
`worker/test/index.test.js`, and redeploy the Worker. A test pins the current
value, so an accidental regression to `repo` fails the suite rather than
silently widening the consent screen.

## Warning: `SITE_ORIGIN` is the single most likely failure point

`worker/wrangler.toml`'s `SITE_ORIGIN` must be **scheme + host only, with no
trailing slash** — e.g. `https://my-site.pages.dev`, not
`https://my-site.pages.dev/`.

The Worker validates this at request time (`worker/src/index.js`,
`isExactOrigin`) and returns a loud HTTP 500 on `/callback` if it's wrong,
rather than failing silently. But be aware of two sharp edges in that check:

- It also **rejects an explicitly-specified default port**, e.g.
  `https://my-site.pages.dev:443`, even though that is arguably "the same
  origin." The check is `new URL(value).origin === value`, and the `URL`
  API's `.origin` normalizes away a default port, so the round-trip fails
  for a value that spells the port out.
- The error message it returns only says: *"Worker misconfigured:
  SITE_ORIGIN must be an exact origin ... (no trailing slash or path)."*
  It does **not** mention ports. If you hit this 500 and you're sure there's
  no trailing slash or path, check for a stray `:443` or `:80` too — the
  message will misdirect you toward the wrong fix.

If OAuth login's popup silently closes with nothing happening (Step 10),
this mismatch is the most common cause — check the browser console on
`/admin` for a `postMessage` origin mismatch before looking anywhere else.
