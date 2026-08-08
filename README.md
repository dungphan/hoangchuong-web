# Chuongk48

Portfolio site. Hugo static site, Decap CMS for editing, Cloudflare Pages for hosting.

## Editing content

Go to `https://labcos-web.pages.dev/admin/` and log in with GitHub. Saving commits
to `main`; the site rebuilds automatically in about a minute.

New projects are created as drafts. Untick **Draft** to publish.

## Local development

Requires **Hugo extended 0.164.0** installed locally (e.g. `brew install
hugo`) — `npm install` only provides `decap-server`, not Hugo itself, so
`npm run dev` and `npm test` fail with `hugo: command not found` on a clean
machine without it. Confirm with `hugo version`; the output must contain
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

- `content/projects/<slug>/index.md` — one page bundle per project, images beside it
- `data/settings.yaml` — nav, social links, SEO defaults
- `layouts/_partials/image.html` — every image renders through this
- `worker/` — Cloudflare Worker holding the GitHub OAuth secret

## Constraints

- Hugo **extended** 0.164.0, pinned via `HUGO_VERSION` on Cloudflare
- Layouts use Hugo's v0.146+ lookup rules — no `_default/`, no `single.html`
- Images must live inside a page bundle; Hugo cannot process `static/`
- `decap-cms` is pinned to an exact version, never a range
