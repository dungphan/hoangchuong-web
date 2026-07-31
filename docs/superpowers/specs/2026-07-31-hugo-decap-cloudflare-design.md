# Portfolio site: Hugo + Decap CMS on Cloudflare

**Date:** 2026-07-31
**Status:** Approved design, not yet implemented

## Purpose

A portfolio/catalog website whose content is edited through a browser-based CMS by
a small team, with no server to operate and no database to back up. Content lives
as Markdown in a Git repository; publishing is a commit.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Static site generator | Hugo extended v0.164.0 | Chosen by the project owner |
| Host | Cloudflare Pages | Consolidates with the OAuth Worker on one account |
| CMS | Decap CMS 3.15.1, GitHub backend | Git-based, no CMS server to run |
| Auth | Cloudflare Worker OAuth proxy | Required: GitHub OAuth needs a server-side secret |
| Editors | Owner + 2-5 teammates, GitHub accounts | Repo collaborators |
| Publish mode | Direct commit to `main` | Fastest loop; `draft` flag covers work-in-progress |
| Media | Hugo page bundles | Only path that keeps Hugo's image processing available |

### Pinned versions

Current as of 2026-07-31. Every one is pinned exactly, not by range.

| Component | Version | Pinned where |
|---|---|---|
| Hugo (extended) | 0.164.0 | `HUGO_VERSION` in Cloudflare Pages build env; matched locally |
| `decap-cms` | 3.15.1 | exact URL in `static/admin/index.html` |
| `decap-server` | 3.10.0 | devDependency, for `local_backend` editing |
| Node | 26.x | local only; not needed by the Cloudflare build |

Node is a development convenience (it runs `decap-server`). The production build
is Hugo alone, with no npm install step on Cloudflare.

## Architecture

Three deployable pieces, one repository. The repository is the source of truth;
there is no runtime backend.

```
GitHub repo
   |
   +-- Hugo site source ------> Cloudflare Pages ----> <site>.pages.dev
   |      + static/admin/                              /admin  (Decap UI)
   |
   +-- worker/ ---------------> Cloudflare Worker ---> <worker>.workers.dev
                                 (OAuth proxy only)
```

### Edit flow

1. Editor opens `/admin` — static files Hugo copies from `static/admin/`.
2. Decap opens the Worker's `/auth` in a popup.
3. Worker redirects to GitHub's OAuth consent screen (`scope=public_repo`, random `state`).
4. GitHub redirects to the Worker's `/callback` with a code.
5. Worker verifies `state`, exchanges the code for a token server-side using the
   client secret, and returns an HTML page that `postMessage`s the token to the
   opener, then closes.
6. Decap commits Markdown and images directly to `main` via the GitHub API.
7. The commit triggers a Cloudflare Pages build (`hugo --gc --minify`), live in ~30s.

The Worker exists solely to hold the GitHub OAuth client secret. It is not in the
request path of the site; it runs only during login.

### Domains

Build and ship on `*.pages.dev` and `*.workers.dev`. A custom domain is attached
later by updating exactly two values: the GitHub OAuth App callback URL, and
`base_url` in the Decap config. Not owning a domain blocks nothing.

## Content model

### On disk

```
content/
  _index.md                  # home — hero copy
  about/index.md
  projects/
    _index.md                # catalog landing — title + intro
    acme-rebrand/
      index.md               # front matter + body
      cover.jpg
      shot-01.jpg
data/
  settings.yaml              # nav, social links, SEO defaults
```

Every content item is a **page bundle** (a directory containing `index.md` plus
its images). This is required, not stylistic: Hugo can only run image processing
on page resources or files under `assets/`, never on `static/`. Bundles also let
Decap store relative image paths that resolve identically in the CMS preview and
on the built site.

### Decap collections

**`projects`** — folder collection over `content/projects`, with
`path: "{{slug}}/index"`, `media_folder: ""`, `public_folder: ""` so uploads land
inside the bundle.

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `date` | datetime | yes | default sort key |
| `draft` | boolean | yes (default true) | Hugo excludes drafts from production builds |
| `summary` | text | yes | grid card excerpt |
| `cover` | image | yes | grid thumbnail and detail hero |
| `gallery` | list of {image, caption} | no | detail page |
| `tags` | list of string | no | grid filtering |
| `client` | string | no | |
| `year` | number | no | |
| `external_url` | string | no | outbound link |
| `weight` | number | no | manual ordering; Hugo sorts weight then date |
| body | markdown | no | write-up |

**`pages`** — `files` collection of three singletons: home (`content/_index.md`),
about (`content/about/index.md`), catalog landing (`content/projects/_index.md`).
Fixed paths with no create or delete, so the homepage cannot be removed from the CMS.

**`settings`** — single file `data/settings.yaml`, read in templates as
`.Site.Data.settings`. Holds nav links, social links, contact email, default OG
image. Kept out of `hugo.toml` deliberately: Decap edits YAML reliably, and a
malformed config file fails the build harder than a malformed data file.

### Templates

Hugo v0.146 replaced the old template lookup system, and this project targets
0.164, so layouts use the current convention throughout: no `_default/`
directory, `single.html` becomes `page.html`, `list.html` becomes `section.html`,
`index.html` becomes `home.html`, and partials move under `_partials/`.

```
layouts/
  baseof.html                # shell
  home.html                  # landing page
  page.html                  # about, and any standalone page
  projects/
    section.html             # catalog grid
    page.html                # project detail
  _partials/
    head.html
    header.html
    footer.html
    image.html               # see below
```

The legacy names still resolve in 0.164 but emit deprecation warnings, so a new
site should not be written against them.

`_partials/image.html` earns its keep: it takes a page resource and emits a
resized, WebP, `srcset`-bearing `<img>`. Every cover and gallery image renders
through it, so Hugo's image-pipeline verbosity is written once rather than
repeated across templates.

## Risks and mitigations

**Hugo does not validate front matter.** If Decap writes `external_url` and a
template reads `.Params.url`, the result is a silently blank element with no build
error. The field table above is the single source of truth for field names.
Templates guard every optional field with `{{ with }}` so absence degrades cleanly
instead of emitting empty attributes.

**Hugo version drift.** Hugo v0.146 replaced the template lookup system wholesale.
`HUGO_VERSION=0.164.0` is pinned in the Cloudflare build environment and matched
locally, so a host-side upgrade cannot silently change which template files are
resolved. Cloudflare Pages must also be set to its latest build image; older
images cap the Hugo versions they will install.

**`postMessage` origin.** The Worker must target the exact site origin, never `*`.
With `*`, any page able to open the `/auth` popup receives a GitHub token carrying
write access to the repository. This is the highest-consequence line in the
project, and most copy-paste Worker snippets published online get it wrong.

**OAuth `state`.** Must be verified on callback, not merely generated, or the
login flow is CSRF-able.

**Decap CDN pin.** `static/admin/index.html` loads
`https://unpkg.com/decap-cms@3.15.1/dist/decap-cms.js` — an exact version, never a
`^3` range. That script executes with a repo write token in scope; a floating
range would auto-adopt a broken or compromised publish into the admin panel with
no action on our part.

**Secrets.** The GitHub OAuth client secret exists only in Worker secret storage
via `wrangler secret put`. Never committed. Client ID is public and may live in
config.

## Error handling

- Build failure — Cloudflare continues serving the last good deploy. A bad commit
  fails to update the site; it does not take it down.
- OAuth failure — the Worker returns a readable error page rather than a popup
  that closes silently, which is otherwise Decap's most confusing failure mode.
- Missing optional field or image — `{{ with }}` guards omit the element.

## Verification

Each step is checkable before the next exists.

1. `hugo server -D` renders home, grid, and a seeded project locally.
2. `npx decap-server` with `local_backend: true` — full CMS editing against the
   working copy, with no OAuth, no deploy, and no GitHub involvement. The entire
   content model is validated here.
3. `hugo --gc --minify` exits 0.
4. Push to a branch — Cloudflare preview deploy renders correctly.
5. Worker deployed — end-to-end login from `/admin`; confirm a commit lands and
   triggers a rebuild.

Step 2 is load-bearing: it proves the content model before any auth plumbing
exists, so a later login problem is unambiguously the Worker and not the schema.

## Out of scope

- Custom domain purchase and DNS (attachable later; two values change).
- Non-technical editors without GitHub accounts (would require Netlify Identity
  or a separate auth layer).
- Editorial workflow / PR-based review (rejected in favour of direct commit).
- Search, i18n, analytics, contact form backend.
