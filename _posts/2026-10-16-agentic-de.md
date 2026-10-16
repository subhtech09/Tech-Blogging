---
title: "Applying AI in Data Engineering - the Agentic Data Engineering"
description: "How to apply Agentic AI principles and processes to ease the frictions of the current state of data engineering"
category: data-engineering
tags: [agentic-ai, ai]
image: /assets/images/posts/agentic-de/agentic-de.jpg
featured: true
---

Data engineering is being transformed by AI agents faster than any other part of the modern data stack. Pipeline generation, transformation authoring, schema evolution, data quality monitoring, impact analysis, and documentation, tasks that consumed the majority of a data engineer's week, are being automated or augmented by agents that can plan, execute, and iterate.

The term "agentic data engineering" describes this shift: AI agents that autonomously perform data engineering tasks through structured interfaces, with human engineers reviewing, approving, and governing the output. It is the same architectural pattern as agentic analytics, applied one layer down in the stack.

And the two layers are more connected than the industry typically acknowledges.

## What is agentic data engineering?

Agentic data engineering is the practice of using AI agents to autonomously perform data engineering tasks (building pipelines, writing transformations, managing schemas, monitoring data quality, and maintaining documentation) through code-native interfaces with human oversight.

The "agentic" part matters. The agent goes well beyond autocompleting SQL. It can:

Accept a high-level goal ("create a pipeline that ingests Stripe subscription events into our warehouse, deduplicated by event ID, partitioned by date")
Decompose the goal into steps
Generate the pipeline definition, transformation logic, and tests
Validate against existing schema and conventions
Submit the result for review
The human engineer reviews, tests, and approves, the same workflow as reviewing a pull request from a junior engineer, except the junior engineer runs at machine speed and never forgets to write tests (if told to).

{% include figure.html src="agentic-de.jpg" alt="Agentic Data Engineering works on the premise that all the information that is available to a data engineer, is available to it, in the form of context" caption="**Figure 1.** Agents explore sources, deduce lineage and perform quality audit" %}

## What can AI agents do in data engineering today?

The capabilities are real and growing. Here is what works in production today, verified beyond demos.

### Pipeline generation

Agents generate pipeline definitions (Airflow DAGs, Dagster jobs, dbt models) from natural language descriptions or schema specifications. The output is code: reviewable, testable, version-controlled.

### Transformation authoring

Given a source schema and a target requirement, agents write SQL transformations, dbt models, or other transformation logic. They handle joins, type casting, deduplication, and incremental load patterns.

### Schema migration and evolution

When source schemas change (a new column appears, a type changes, a table is deprecated), agents analyze the impact downstream, generate migration scripts, and update affected transformations.

### Data quality monitoring
Agents generate data quality tests (row counts, null checks, distribution anomalies, freshness checks) based on observed data patterns. They can monitor continuously and flag deviations.

## The emerging tool ecosystem
Several major platforms are building agentic data engineering capabilities.

### Google BigQuery, Data Engineering Agent
Google's Gemini-powered agent generates SQL transformations, creates pipelines, and manages BigQuery datasets through natural language. Integrated into the Google Cloud console. Strongest for teams already on BigQuery.

### Databricks, AI-powered data engineering
Databricks integrates AI across its lakehouse platform. Agents assist with notebook development, pipeline creation, and data quality. Unity Catalog provides the governance layer. Strong for organizations with a Databricks-centric stack.



