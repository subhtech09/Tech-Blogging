# The Intelligence Stack

A static tech blog about **data architecture, data engineering and AI engineering**,
built with [Jekyll](https://jekyllrb.com/) and hosted on **Azure Static Web Apps**.

Live URL: **https://purple-cliff-09b300910.5.azurestaticapps.net/**

- Light mint-green and sky-blue palette with automatic light and dark mode
- Articles are Markdown files; architecture diagrams are plain `.jpg` files
- Click-to-enlarge diagram viewer (fit to screen, actual size, drag to pan)
- Reading progress bar, code copy buttons, heading links
- Comments on every article (Azure Cosmos DB, moderated) and per-article view counts (GoatCounter)
- Topic pages, tags, client-side full-text search, RSS feed, sitemap, SEO and social cards
- No build step on your side — GitHub Actions builds and deploys the site on every push

---

## 1. Publish the site

The site is hosted on **Azure Static Web Apps** (Free plan), connected to
`https://github.com/subhtech09/Tech-Blogging` (branch `main`).

Every `git push` to `main` runs the workflow in `.github/workflows/`: it builds
the site with Jekyll (Ruby 3.3), then deploys `_site` and the comments API in
`api/` to Azure. The **Actions** tab shows each run; when it is green the
site is live.

> **Custom domain?** Add it in the Static Web App (**Custom domains**), then set
> `url` in `_config.yml` to the new address. Keep `baseurl: ""`.

---

## 2. Write a new article

### Option A — in the browser (`/write/`)

Sign in as admin (the pen icon appears in the header) and open **`/write/`**.

- Fill in the title, description, topic and tags, then write in the editor:
  Heading 2–4, bold, italic, underline, strikethrough, highlight, theme text
  colours, lists, quotes, note/tip/warning boxes, code blocks, tables, links.
- **Images:** paste or drag them straight into the text (screenshots, copied
  images, files, or content copied from a web page). Big images are resized
  in the browser before upload. Select an image to add a caption or alt text.
- **Save draft** (or Ctrl+S) stores the draft in Cosmos DB and its images in
  Blob Storage. Drafts are listed on the left; nothing is public yet.
- **Publish** commits the post to `_posts/` and its images to
  `assets/images/posts/<slug>/` in one commit; the deploy workflow puts it live
  in about 3 minutes. Publishing the same draft again updates the article (the
  URL slug is fixed after the first publish).
- Deleting a draft does not unpublish its article.

API settings for writing (Static Web Apps → **Environment variables**):

| Setting | Value |
|---|---|
| `COSMOS_DRAFTS_CONTAINER` | Drafts container (default `draft_articles`, partition key **`/id`**) |
| `STORAGE_CONNECTION_STRING` | Storage account connection string |
| `STORAGE_CONTAINER` | Private container for draft images (default `images`) |
| `GITHUB_TOKEN` | Fine-grained token for this repo only, *Contents: read and write* |
| `GITHUB_REPO` / `GITHUB_BRANCH` | Defaults `subhtech09/Tech-Blogging` / `main` |

The editor is bundled into `assets/js/editor.bundle.js` from `tools/editor/`.
After changing `tools/editor/src/index.js`, run `npm install && npm run build`
in that folder and commit the new bundle.

### Option B — helper script (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File tools\new-post.ps1 -Title "Streaming joins in practice" -Topic data-engineering
```

This creates `_posts/2026-10-09-streaming-joins-in-practice.md` from the
template and an empty diagram folder `assets/images/posts/streaming-joins-in-practice/`.

### Option C — by hand

1. Copy `_templates/post.md` to `_posts/YYYY-MM-DD-your-slug.md`.
2. Create the folder `assets/images/posts/your-slug/` for its diagrams.

The **slug** is the part of the file name after the date. It becomes the URL
(`/blog/your-slug/`) and the name of the diagram folder.

### Front matter

```yaml
---
title: "Designing a Lakehouse with the Medallion Architecture"
description: "One or two sentences — shown under the title, on cards, in search and social previews."
category: data-architecture        # data-architecture | data-engineering | ai-engineering
tags: [lakehouse, medallion]
image: /assets/images/posts/your-slug/main-diagram.jpg   # optional: card thumbnail + social preview
last_modified_at: 2026-11-01       # optional: shows "Updated …"
---
```

Posts dated in the future are not published until that date (after the next push or rebuild).

---

## 3. Add architecture diagrams

1. Save the diagram as a `.jpg` in `assets/images/posts/<your-slug>/`.
2. Put this line where the diagram should appear, **on its own line with a blank
   line above and below**:

```liquid
{% include figure.html src="ingestion-flow.jpg" alt="What the diagram shows, for screen readers" caption="**Figure 1.** Ingestion flow from CDC to the bronze layer." %}
```

- `src` — just the file name; it is looked up in that post's folder.
  To reuse an image from elsewhere, give a full path such as `/assets/images/shared/legend.jpg`.
- `alt` — a short description of the diagram (important for accessibility).
- `caption` — optional, supports Markdown such as `**bold**`.

Readers can click any diagram to open it full-screen, switch to actual size and drag to pan.

**Tips for diagram files**

- Export at about **1600–2400 px wide**. That stays sharp on high-resolution
  screens and in the zoom view.
- Keep each file **under ~500 KB** (JPG quality 80–90 is plenty). GitHub Pages
  sites have a 1 GB limit and pages load faster with smaller images.
- Use lowercase file names with hyphens, e.g. `rag-query-path.jpg`. GitHub Pages
  is **case-sensitive**: `Diagram.JPG` and `diagram.jpg` are different files.

---

## 4. Formatting cheat sheet

| You write | You get |
|---|---|
| `## Heading` / `### Sub-heading` | Section headings (each gets a shareable `#` link) |
| ```` ```sql ```` … ```` ``` ```` | Syntax-highlighted code with a copy button (`python`, `sql`, `yaml`, `bash`, `scala`, `json`, …) |
| `> Text` then `{: .note }` on the next line | Grey "Note" callout |
| `> Text` then `{: .tip }` | Green "Tip" callout |
| `> Text` then `{: .warning }` | Red "Watch out" callout |
| Markdown table | Styled table that scrolls sideways on phones |
| `[link]({{ site.baseurl }}{% post_url 2026-09-28-idempotent-pipelines %})` | Link to another post that never breaks |

---

## 5. Preview locally (optional)

You can skip this and preview on GitHub after pushing. To preview on your own
machine first:

1. Install Ruby **with Devkit** from <https://rubyinstaller.org/> (Ruby 3.3 recommended)
   and let it run `ridk install` at the end.
2. In this folder:

   ```powershell
   gem install bundler
   bundle install
   bundle exec jekyll serve --livereload
   ```

3. Open <http://localhost:4000/>.

`bundle install` uses the `github-pages` gem, so the local build uses the same
Jekyll and plugin versions as GitHub.

**Alternative with Docker/Podman** (no Ruby install):

```powershell
podman run --rm -it -p 4000:4000 -v "${PWD}:/srv" -w /srv ruby:3.3 bash -c "bundle install && bundle exec jekyll serve --host 0.0.0.0"
```

---

## 6. Customise

| What | Where |
|---|---|
| Blog name, tagline, description, URL | `_config.yml` |
| Your name, role, bio, avatar, social links | `_data/authors.yml` |
| Header menu | `_data/navigation.yml` |
| Topics (names, descriptions, icons, colour tint) | `_data/topics.yml`, plus one page per topic in `topics/` |
| Home page headline | front matter of `index.html` |
| About page | `about.md` |
| Colours and fonts | top of `assets/css/main.css` (`--mint-*`, `--sky-*`, `--ink-*`); fonts are loaded in `_includes/head.html` |
| Social preview image | `assets/images/og-default.jpg`; regenerate with `tools\make-og-image.ps1 -Title "..."` |

**Adding a topic:** add an entry to `_data/topics.yml` (pick a `tone`: `blue`, `green` or `teal`), copy one of the files in
`topics/`, change `topic:`, `title:` and `permalink:`, and add it to
`_data/navigation.yml` if it should appear in the header.

---

## 7. Turn on comments and view counts (one-time setup)

Until each feature is configured, it simply stays hidden on the article pages.

### Comments — Azure Cosmos DB

Comments are stored in **Azure Cosmos DB** and served by the small API in
`api/` (Azure Functions). That API only runs when the site is hosted on
**Azure Static Web Apps** (on a plain static host the comment section can't load).

- **Readers don't sign in.** They give a name, an optional email (never shown)
  and the comment. **Cloudflare Turnstile**, a hidden honeypot field and a rate
  limit (3 comments per visitor per 10 minutes) keep bots out.
- **Moderation:** new comments wait as `pending` until you approve them at
  **`/moderate/`**. Only users with the Static Web Apps role `admin` can open
  that page or call `/api/manage/*`.
- **Keyed by slug:** each comment stores the post's slug (from its file name),
  so renaming the domain keeps comments attached. To keep comments when you
  rename a post file, set `comments_id: <old-slug>` in its front matter.
- **Privacy:** only a salted hash of the commenter's IP is stored (for rate
  limiting). All comment text is shown as plain text, never as HTML.

Site setting (`_config.yml`):

```yaml
comments:
  enabled: true
  api: /api
  turnstile_site_key: "0x4AAAA…"   # comments appear once this is set
```

API settings (Static Web Apps → **Environment variables**; for local runs,
copy `api/local.settings.example.json` to `api/local.settings.json`):

| Setting | Value |
|---|---|
| `COSMOS_CONNECTION_STRING` | Cosmos DB account connection string |
| `COSMOS_DATABASE` | Database name (default `blog`) |
| `COSMOS_CONTAINER` | Container name (default `comments`, partition key **`/slug`**) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |
| `IP_HASH_SALT` | Any long random string |
| `COMMENTS_AUTO_APPROVE` | `true` to publish without review (default `false`) |

To turn comments off for one article, add `comments: false` to its front matter.

### View counts — GoatCounter

[GoatCounter](https://www.goatcounter.com) is a free, open-source, cookie-free
analytics service. It records each visit and lets the article page show its
total views (and gives you a stats dashboard).

1. Sign up at <https://www.goatcounter.com/signup>. The **code** you choose
   becomes your dashboard address, e.g. `tech-blogging` →
   `https://tech-blogging.goatcounter.com`.
2. In the dashboard open **Settings**, tick
   **"Allow adding visitor counts on your website"** and save.
3. Put the code in `_config.yml`, then commit and push:

   ```yaml
   goatcounter:
     code: "tech-blogging"
   ```

Notes: visits from `localhost` are not counted; GoatCounter caches the totals
for up to 4 hours, so new views appear with a delay; and an article shows its
count only after its first recorded visit. Counts are tied to the page URL, so
renaming a post's file (or moving to a custom domain) starts its count afresh.

---

## 8. How this fits GitHub Pages' limits

| GitHub Pages limitation | How the site handles it |
|---|---|
| Static files only, no server code | Everything is pre-rendered HTML; search, filters and the diagram viewer run in the browser |
| Only [whitelisted plugins](https://pages.github.com/versions/) | Uses only `jekyll-feed`, `jekyll-seo-tag` and `jekyll-sitemap`; topic and tag pages use plain Liquid |
| No database | Search reads `search.json`, which is generated at build time |
| No comment backend or database for counters | View counts via GoatCounter; comments need the Azure Static Web Apps API (section 7) |
| 1 GB site size, 100 GB/month soft bandwidth | Plain CSS/JS with no frameworks; keep diagrams under ~500 KB |
| Pages cached for ~10 minutes | CSS/JS URLs carry a build timestamp, so readers get new styles after each deploy |

---

## Project structure

```
_config.yml            Site settings
_data/                 Authors, navigation, topics
_includes/             Reusable pieces (header, footer, figure, post card, icons…)
_layouts/              Page templates: default, home, post, page, topic
_posts/                Your articles (YYYY-MM-DD-slug.md)
_templates/post.md     Starting point for new articles (not published)
assets/css/main.css    All styles (light + dark theme)
assets/js/main.js      Theme toggle, TOC, diagram viewer, code copy, filters
assets/js/search.js    Client-side search
assets/js/comments.js  Article comments (load, post)
assets/js/moderate.js  Comment moderation page
assets/js/write.js     Article editor page (drafts, image paste, publish)
assets/js/editor.bundle.js  Editor library, built from tools/editor/
api/                   Azure Functions comments API (Cosmos DB)
staticwebapp.config.json  Azure Static Web Apps routes and admin-only pages
moderate.html          Comment moderation page (/moderate/, admin only)
write.html             Article editor (/write/, admin only)
assets/images/posts/   One folder of diagrams per article
blog/  topics/         Article listing and topic pages
tags.html search.html  Tag index and search page
search.json            Search index (generated)
about.md 404.html      About and not-found pages
tools/                 PowerShell helpers (new post, social image) — not published
```

> The three posts in `_posts/` and their diagrams are **samples** that show every
> formatting feature. Delete or replace them before you publish
> (`_posts/*.md` and `assets/images/posts/*`).
