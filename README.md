# The Architect's Handbook

A static tech blog about **data architecture, data engineering and AI engineering**,
built with [Jekyll](https://jekyllrb.com/) and hosted on **GitHub Pages**.

Live URL (once Pages is enabled): **https://subhtech09.github.io/Tech-Blogging/**

- Light mint-green and sky-blue palette with automatic light and dark mode
- Articles are Markdown files; architecture diagrams are plain `.jpg` files
- Click-to-enlarge diagram viewer (fit to screen, actual size, drag to pan)
- Reading progress bar, code copy buttons, heading links
- Comments on every article (giscus) and per-article view counts (GoatCounter)
- Topic pages, tags, client-side full-text search, RSS feed, sitemap, SEO and social cards
- No build step on your side — GitHub builds the site on every push

---

## 1. Publish the site (one-time setup)

1. Push this folder to `https://github.com/subhtech09/Tech-Blogging` (branch `main`).
2. On GitHub open **Settings → Pages**.
3. Under **Build and deployment**, choose **Source: Deploy from a branch**,
   then **Branch: `main`** and folder **`/ (root)`**, and click **Save**.
4. Wait 1–2 minutes. The **Actions** tab shows the "pages build and deployment"
   run; when it is green the site is live.

From then on, every `git push` to `main` rebuilds and republishes the site.

> **Different URL?** `_config.yml` contains `url` and `baseurl`. If you rename the
> repository to `subhtech09.github.io` or add a custom domain, set `baseurl: ""`
> and update `url`.

---

## 2. Write a new article

### Option A — helper script (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File tools\new-post.ps1 -Title "Streaming joins in practice" -Topic data-engineering
```

This creates `_posts/2026-10-09-streaming-joins-in-practice.md` from the
template and an empty diagram folder `assets/images/posts/streaming-joins-in-practice/`.

### Option B — by hand

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
featured: true                     # optional: show in "Start here" on the home page
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

3. Open <http://localhost:4000/Tech-Blogging/>.

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

GitHub Pages can only serve files, so comments and view counts use two free
services. Until each one is configured, its feature simply stays hidden on the
article pages.

### Comments — giscus

[giscus](https://giscus.app) stores each article's comments as a GitHub
Discussion in this repository — no database, no ads. Readers sign in with
GitHub to comment, and you moderate from the repo's **Discussions** tab.

1. On GitHub open the repo → **Settings → General → Features** and tick **Discussions**.
2. Install the giscus app on this repo: <https://github.com/apps/giscus> →
   **Install** → *Only select repositories* → `Tech-Blogging`.
3. Open <https://giscus.app>, type `subhtech09/Tech-Blogging` in the *Repository*
   box, choose **Announcements** as the *Discussion category*, and copy the
   `data-repo-id` and `data-category-id` values from the generated snippet.
4. Paste them into `_config.yml`:

   ```yaml
   giscus:
     repo_id: "R_kgDO…"         # the values you copied
     category_id: "DIC_kwDO…"
   ```

   Commit and push — comments appear at the bottom of every article. To turn
   them off for one article, add `comments: false` to its front matter.

### View counts — GoatCounter

[GoatCounter](https://www.goatcounter.com) is a free, open-source, cookie-free
analytics service. It records each visit and lets the article page show its
total views (and gives you a stats dashboard).

1. Sign up at <https://www.goatcounter.com/signup>. The **code** you choose
   becomes your dashboard address, e.g. `architects-handbook` →
   `https://architects-handbook.goatcounter.com`.
2. In the dashboard open **Settings**, tick
   **"Allow adding visitor counts on your website"** and save.
3. Put the code in `_config.yml`, then commit and push:

   ```yaml
   goatcounter:
     code: "architects-handbook"
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
| No comment backend or database for counters | Comments via giscus (GitHub Discussions); view counts via GoatCounter |
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
