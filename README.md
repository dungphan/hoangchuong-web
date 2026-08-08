# Chuongk48

Product catalogue for HDPLAS — plastic bottles, jars, caps and jerrycans.
Hugo static site, Decap CMS for editing, Cloudflare Pages for hosting.

## Editing content

Go to `https://labcos-web.pages.dev/admin/` and log in with GitHub. Saving commits
to `main`; the site rebuilds automatically in about a minute.

New products are created as drafts. Untick **Nháp** (Draft) to publish.

## Local development

Requires **Hugo extended 0.164.0** installed locally — `npm install` only
provides `decap-server`, not Hugo itself, so `npm run dev` and `npm test`
fail with `hugo: command not found` on a clean machine without it.

Install the pinned release directly rather than via a package manager.
`brew install hugo` and most distro packages give you whatever version is
current, and `npm test` treats every Hugo warning and deprecation as a
failure — so a newer Hugo fails the suite on messages that say nothing about
this site's code:

```bash
# Linux x86-64; see https://github.com/gohugoio/hugo/releases for other platforms
curl -sSL -o hugo.tar.gz \
  https://github.com/gohugoio/hugo/releases/download/v0.164.0/hugo_extended_0.164.0_linux-amd64.tar.gz
tar xzf hugo.tar.gz hugo && sudo mv hugo /usr/local/bin/
```

Confirm with `hugo version`; the output must contain both `0.164.0` and
`+extended` — a non-extended build cannot produce the WebP images this site
relies on.

```bash
npm install
npm run dev     # hugo server at :1313, drafts visible
npm run cms     # decap-server — enables /admin with no login
npm test        # build + assertions; any Hugo warning fails the run
```

Open `http://localhost:1313/admin/` with both running to edit against your
working copy without touching GitHub.

## Structure

- `content/san-pham/<slug>/index.md` — one page bundle per product, images beside it
- `data/settings.yaml` — nav, social links, SEO defaults
- `layouts/_partials/image.html` — every image renders through this
- `worker/` — Cloudflare Worker holding the GitHub OAuth secret

## Constraints

- Hugo **extended** 0.164.0, pinned via `HUGO_VERSION` on Cloudflare
- Layouts use Hugo's v0.146+ lookup rules — no `_default/`, no `single.html`
- Images must live inside a page bundle; Hugo cannot process `static/`
- `decap-cms` is pinned to an exact version, never a range
