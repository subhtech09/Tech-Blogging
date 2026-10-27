---
layout: page
title: About
eyebrow: Hello
description: Who writes this blog, what it covers and how to get in touch.
permalink: /about/
---
{%- comment -%} Edit this page freely — it's plain Markdown. {%- endcomment -%}
{% assign about_author = site.data.authors[site.author] %}
<section class="author-card author-card--about" aria-label="About the author">
  <img class="author-photo" src="{{ about_author.avatar | relative_url }}" alt="Photo of {{ about_author.name }}" width="480" height="480">
  <div class="author-card-body">
    <p class="author-card-eyebrow">About the author</p>
    <h2 class="author-card-name">{{ about_author.name }}</h2>
    <p class="author-card-role">{{ about_author.role }}</p>
    {% include social-links.html author=about_author class="social-links--light" %}
  </div>
</section>

Hello everyone, thanks for visiting my blog. Hope you are liking the content that
I regularly publish here.

Regarding me, I am a Data & AI solution architect with 18+ years of experience in
Data Engineering, AI, and Cloud Architecture, of which 15 years consulting and
professional services – shaping and delivering Data and AI engagements. I try to
execute my role as an expert in driving large-scale digital transformation,
technical pre-sales engagements and enterprise-scale migrations across Banking,
Pharma, Life Sciences and Retail sectors. I bring deep expertise in architecture
governance and stakeholder alignment, defining and executing enterprise data
strategies, ensuring alignment with business priorities and digital
transformation goals, enabling organizations to operationalize data and AI with
speed, control, and measurable impact. I have undertaken endeavours consisting of
but not limited to client-facing architecture leadership, defining target-state
data architectures, evaluating competing stacks on engineering merit, and driving
alignment and sign-off of key architectural decisions with client enterprise
architecture groups and executive stakeholders. I bring deep expertise in shaping
hybrid cloud and distributed architectures, aligning security, compliance, and
cost governance with long-term scalability and adoption strategies. I bring
proven capability in building resilient, high-availability data systems,
embedding governance models and risk-controlled execution frameworks. I am known
for steering cross-functional teams and innovation initiatives including reusable
solution accelerators taken to market. I bring a track record of accelerating
engineering maturity and delivery velocity through process standardization,
CI/CD transformation and operational excellence frameworks.

## Why this blog

Data and AI platforms are mostly made of decisions: where data lands, how it is
modelled, what guarantees each layer gives, and how models get the context they
need. This blog documents those decisions — with an architecture diagram for
almost every idea — so they can be reused, challenged and improved.

## What you'll find here

- **Data Architecture** — lakehouse and warehouse design, data modelling, data mesh, governance.
- **Data Engineering** — batch and streaming pipelines, orchestration, data quality, performance.
- **AI Engineering** — LLM applications, retrieval-augmented generation, agents, evaluation and MLOps.

## Get in touch

The best way to reach me is through the links above. If you spot a mistake in
an article, I'd genuinely like to hear about it.
