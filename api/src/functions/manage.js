/* Moderation endpoints, used by the Admin Corner (/admin/). Admin only: Static Web
   Apps blocks other callers via staticwebapp.config.json, and each handler
   checks the role again.
     GET    /api/manage/comments?status=pending|approved|rejected
     PATCH  /api/manage/comments/{slug}/{id}   body: { "status": "approved" | "rejected" }
     DELETE /api/manage/comments/{slug}/{id}
   ("admin" is a reserved route prefix in Azure Functions, hence "manage".) */
const { app } = require('@azure/functions');
const { SLUG_RE, ID_RE, missingSettings, getContainer, json, isAdmin } = require('../lib/shared');

const STATUSES = ['pending', 'approved', 'rejected'];
const PAGE_SIZE = 200;

function guard(request) {
  if (!isAdmin(request)) return json(403, { error: 'Admins only.' });
  if (missingSettings().length) return json(503, { error: 'Comments API is missing settings: ' + missingSettings().join(', ') });
  return null;
}

async function listForModeration(request, context) {
  const denied = guard(request);
  if (denied) return denied;

  const status = request.query.get('status') || 'pending';
  if (!STATUSES.includes(status)) return json(400, { error: 'Unknown status.' });

  try {
    const { resources } = await getContainer().items
      .query({
        query: `SELECT c.id, c.slug, c.name, c.email, c.body, c.status, c.createdAt FROM c WHERE c.status = @status ORDER BY c.createdAt DESC OFFSET 0 LIMIT ${PAGE_SIZE}`,
        parameters: [{ name: '@status', value: status }]
      })
      .fetchAll();
    return json(200, { comments: resources });
  } catch (err) {
    context.error('Failed to list comments for moderation', err);
    return json(500, { error: 'Could not load comments.' });
  }
}

async function moderateComment(request, context) {
  const denied = guard(request);
  if (denied) return denied;

  const { slug, id } = request.params;
  if (!SLUG_RE.test(slug) || !ID_RE.test(id)) return json(400, { error: 'Unknown comment.' });
  const item = getContainer().item(id, slug);

  try {
    if (request.method === 'DELETE') {
      await item.delete();
      return json(200, { deleted: true });
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return json(400, { error: 'Invalid request.' });
    }
    const status = input && input.status;
    if (!STATUSES.includes(status)) return json(400, { error: 'Unknown status.' });

    await item.patch([
      { op: 'set', path: '/status', value: status },
      { op: 'set', path: '/moderatedAt', value: new Date().toISOString() }
    ]);
    return json(200, { id, status });
  } catch (err) {
    if (err.code === 404) return json(404, { error: 'Comment not found.' });
    context.error('Failed to moderate comment', err);
    return json(500, { error: 'Could not update the comment.' });
  }
}

app.http('manageList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manage/comments',
  handler: listForModeration
});

app.http('manageComment', {
  methods: ['PATCH', 'DELETE'],
  authLevel: 'anonymous',
  route: 'manage/comments/{slug}/{id}',
  handler: moderateComment
});
