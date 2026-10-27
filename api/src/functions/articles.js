/* Article management for the Admin Corner (/admin/). Admin only (see
   staticwebapp.config.json; the handler checks the role again).
     POST /api/manage/articles/delete   body: { "paths": ["_posts/2026-10-16-agentic-de.md", …] }
   Removes the posts and their image folders (assets/images/posts/<slug>/) from
   the repository in one commit; the deploy workflow then takes them off the
   site. Drafts that published those posts become ordinary drafts again. */
const { app } = require('@azure/functions');
const { getDatabase, json, isAdmin } = require('../lib/shared');
const { listFolder, commitFiles } = require('../lib/github');

const REQUIRED = ['COSMOS_CONNECTION_STRING', 'GITHUB_TOKEN'];
const POST_RE = /^_posts\/\d{4}-\d{2}-\d{2}-([A-Za-z0-9][A-Za-z0-9_-]*)\.(md|markdown|html)$/;
const MAX_PATHS = 50;

function draftsContainer() {
  return getDatabase().container(process.env.COSMOS_DRAFTS_CONTAINER || 'draft_articles');
}

// Published drafts of deleted posts go back to being drafts, so they can be
// published again later.
async function unpublishDrafts(paths) {
  const { resources } = await draftsContainer()
    .items.query({
      query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(@paths, c.publishedPath)',
      parameters: [{ name: '@paths', value: paths }]
    })
    .fetchAll();
  for (const draft of resources) {
    const { publishedPath, publishedSlug, publishedImages, lastPublishedAt, url, ...rest } = draft;
    await draftsContainer().items.upsert({ ...rest, status: 'draft', updatedAt: new Date().toISOString() });
  }
  return resources.length;
}

async function deleteArticles(request, context) {
  if (!isAdmin(request)) return json(403, { error: 'Admins only.' });
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) return json(503, { error: 'Articles API is missing settings: ' + missing.join(', ') });

  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  const paths = [...new Set(Array.isArray(input && input.paths) ? input.paths : [])];
  if (!paths.length) return json(400, { error: 'Select at least one article.' });
  if (paths.length > MAX_PATHS) return json(400, { error: `Delete at most ${MAX_PATHS} articles at a time.` });
  if (!paths.every((p) => typeof p === 'string' && POST_RE.test(p))) return json(400, { error: 'Unknown article.' });

  try {
    const existing = new Set(await listFolder('_posts'));
    const found = paths.filter((p) => existing.has(p.slice('_posts/'.length)));
    const missingPaths = paths.filter((p) => !found.includes(p));
    if (!found.length) return json(404, { error: 'Those articles are no longer in the repository.', missing: missingPaths });

    const removes = [];
    for (const path of found) {
      removes.push(path);
      const slug = path.match(POST_RE)[1];
      const dir = `assets/images/posts/${slug}`;
      (await listFolder(dir)).forEach((name) => removes.push(`${dir}/${name}`));
    }

    const names = found.map((p) => p.match(POST_RE)[1]);
    const sha = await commitFiles({
      files: [],
      removes,
      message: `Delete article${found.length === 1 ? '' : 's'}: ${names.join(', ')}`
    });

    const result = { deleted: found, missing: missingPaths, commit: sha };
    try {
      result.draftsReopened = await unpublishDrafts(found);
    } catch (err) {
      context.error('Deleted, but failed to update the drafts', err);
      result.warning = 'The articles were deleted, but their drafts still show as published.';
    }
    return json(200, result);
  } catch (err) {
    context.error('Deleting articles failed', err);
    const auth = err.status === 401 || err.status === 403;
    return json(502, {
      error: auth
        ? 'GitHub refused the request. Check that GITHUB_TOKEN is valid and can write to the repository.'
        : 'Deleting failed. Nothing was deleted; please try again.'
    });
  }
}

app.http('articlesDelete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/articles/delete',
  handler: deleteArticles
});
