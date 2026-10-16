---
# ---------------------------------------------------------------------------
#  Copy this file to _posts/YYYY-MM-DD-your-slug.md  (or run tools/new-post.ps1)
#  Put diagrams for this post in  assets/images/posts/your-slug/
# ---------------------------------------------------------------------------
title: "__TITLE__"
description: "One or two sentences shown under the title, on cards and in search/social previews."
category: __TOPIC__              # data-architecture | data-engineering | ai-engineering
tags: [tag-one, tag-two]
# image: /assets/images/posts/__SLUG__/cover.jpg   # optional: card thumbnail + social preview
# featured: true                                   # optional: pin to "Start here" on the home page
# last_modified_at: __DATE__                       # optional: shows "Updated <date>"
---

Opening paragraph — what problem this article solves and who it is for. The
first paragraph is styled slightly larger as a lead-in.

## First section

Body text. Use `##` for sections and `###` for sub-sections.

{% include figure.html src="architecture.jpg" alt="Describe what the diagram shows" caption="**Figure 1.** A short caption explaining the diagram." %}

### A sub-section

> Use callouts for asides. Change `.note` to `.tip` or `.warning`.
{: .note }

```python
# Fenced code blocks get syntax highlighting and a copy button.
def hello(name: str) -> str:
    return f"Hello, {name}"
```

| Column | Another column |
|--------|----------------|
| Tables | are styled and scroll on small screens |

## Wrapping up

Key takeaways.
