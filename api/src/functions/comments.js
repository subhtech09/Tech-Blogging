/* Public comment endpoints, used by the article pages.
     GET  /api/comments/{slug}   approved comments for one article, oldest first
     POST /api/comments/{slug}   submit a comment (no sign-in; Turnstile + rate limit)
   Comments live in one Cosmos DB container, partitioned by /slug. */
const crypto = require('node:crypto');
const { app } = require('@azure/functions');
const {
  SLUG_RE,
  missingSettings,
  getContainer,
  json,
  clientIp,
  hashIp,
  singleLine,
  multiLine,
  publicComment
} = require('../lib/shared');

const NAME_MAX = 60;
const EMAIL_MAX = 254;
const BODY_MIN = 2;
const BODY_MAX = 4000;
const RATE_LIMIT = 3;                    // comments per visitor…
const RATE_WINDOW_MS = 10 * 60 * 1000;   // …per 10 minutes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstile(token, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) form.set('remoteip', ip);
  const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
  if (!res.ok) return false;
  const result = await res.json();
  return result.success === true;
}

async function listComments(request, context) {
  const slug = request.params.slug;
  if (!SLUG_RE.test(slug)) return json(400, { error: 'Unknown article.' });
  if (missingSettings().length) return json(503, { error: 'Comments are not available right now.' });

  try {
    const { resources } = await getContainer().items
      .query(
        {
          query: 'SELECT c.id, c.name, c.body, c.createdAt FROM c WHERE c.slug = @slug AND c.status = @status ORDER BY c.createdAt ASC',
          parameters: [{ name: '@slug', value: slug }, { name: '@status', value: 'approved' }]
        },
        { partitionKey: slug }
      )
      .fetchAll();
    return json(200, { comments: resources.map(publicComment) });
  } catch (err) {
    context.error('Failed to read comments', err);
    return json(500, { error: 'Comments could not be loaded right now.' });
  }
}

async function addComment(request, context) {
  const slug = request.params.slug;
  if (!SLUG_RE.test(slug)) return json(400, { error: 'Unknown article.' });
  const missing = missingSettings();
  if (missing.length) {
    context.error('Comments API is missing settings: ' + missing.join(', '));
    return json(503, { error: 'Comments are not available right now.' });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  if (!input || typeof input !== 'object') return json(400, { error: 'Invalid request.' });

  // Honeypot: the "website" field is hidden from people, so only bots fill it.
  // Answer as if it worked so they learn nothing.
  if (singleLine(input.website)) return json(202, { status: 'pending' });

  const name = singleLine(input.name);
  const email = singleLine(input.email).toLowerCase();
  const body = multiLine(input.body);

  if (!name || name.length > NAME_MAX) return json(400, { error: `Please enter a name of up to ${NAME_MAX} characters.` });
  if (email && (email.length > EMAIL_MAX || !EMAIL_RE.test(email))) return json(400, { error: 'Please enter a valid email address, or leave it empty.' });
  if (body.length < BODY_MIN || body.length > BODY_MAX) return json(400, { error: `Comments must be between ${BODY_MIN} and ${BODY_MAX} characters.` });

  const ip = clientIp(request);
  try {
    if (!(await verifyTurnstile(input.token, ip))) {
      return json(403, { error: 'The spam check failed or expired. Please try again.' });
    }

    const container = getContainer();
    const ipHash = hashIp(ip);
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { resources: [recent] } = await container.items
      .query({
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.ipHash = @ipHash AND c.createdAt > @since',
        parameters: [{ name: '@ipHash', value: ipHash }, { name: '@since', value: since }]
      })
      .fetchAll();
    if (recent >= RATE_LIMIT) {
      return json(429, { error: 'You have posted several comments in a short time. Please try again in a few minutes.' });
    }

    const status = process.env.COMMENTS_AUTO_APPROVE === 'true' ? 'approved' : 'pending';
    const item = {
      id: crypto.randomUUID(),
      slug,
      name,
      email: email || null,
      body,
      status,
      createdAt: new Date().toISOString(),
      ipHash,
      userAgent: (request.headers.get('user-agent') || '').slice(0, 300)
    };
    await container.items.create(item);

    return json(201, status === 'approved' ? { status, comment: publicComment(item) } : { status });
  } catch (err) {
    context.error('Failed to save comment', err);
    return json(500, { error: 'Your comment could not be saved. Please try again.' });
  }
}

app.http('commentsList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'comments/{slug}',
  handler: listComments
});

app.http('commentsAdd', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'comments/{slug}',
  handler: addComment
});
