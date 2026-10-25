/* Article drafts and publishing, used by the /write/ page. Admin only (see
   staticwebapp.config.json; each handler checks the role again).
     GET    /api/manage/drafts                         list drafts
     GET    /api/manage/drafts/{id}                    one draft
     PUT    /api/manage/drafts/{id}                    save (create or update) a draft
     DELETE /api/manage/drafts/{id}                    delete a draft and its images
     POST   /api/manage/drafts/{id}/images             upload a pasted image (raw body)
     POST   /api/manage/drafts/{id}/import-image       copy an image from a web address
     GET    /api/manage/drafts/{id}/images/{file}      serve a draft image to the editor
     POST   /api/manage/drafts/{id}/publish            commit the post + images to GitHub
   Drafts live in Cosmos DB (partition key /id); their images in Blob Storage
   under drafts/{id}/ until publishing copies them into the repo. */
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const { ID_RE, getDatabase, json, isAdmin, singleLine } = require('../lib/shared');
const { toPost, collectImages, pendingImages } = require('../lib/markdown');
const { listFolder, commitFiles } = require('../lib/github');

const REQUIRED = ['COSMOS_CONNECTION_STRING', 'STORAGE_CONNECTION_STRING', 'GITHUB_TOKEN'];
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 300;
const TAGS_MAX = 10;
const CONTENT_MAX = 1500 * 1024;          // Cosmos DB items are limited to 2 MB
const IMAGE_MAX = 5 * 1024 * 1024;
const FILE_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  'image/gif': { ext: 'gif', magic: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' }
};
const EXT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

let drafts;
let images;

function draftsContainer() {
  if (!drafts) drafts = getDatabase().container(process.env.COSMOS_DRAFTS_CONTAINER || 'draft_articles');
  return drafts;
}

function imagesContainer() {
  if (!images) {
    images = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING).getContainerClient(
      process.env.STORAGE_CONTAINER || 'images'
    );
  }
  return images;
}

function guard(request) {
  if (!isAdmin(request)) return json(403, { error: 'Admins only.' });
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) return json(503, { error: 'Writing API is missing settings: ' + missing.join(', ') });
  if (!ID_RE.test(request.params.id || '00000000-0000-0000-0000-000000000000')) return json(400, { error: 'Unknown draft.' });
  return null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '');
}

async function readDraft(id) {
  try {
    const { resource } = await draftsContainer().item(id, id).read();
    return resource || null;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
}

// The fields the editor may set; status and publishing details stay server-owned.
function cleanDraftInput(input) {
  if (!input || typeof input !== 'object') return { error: 'Invalid request.' };
  const content = input.content;
  if (!content || content.type !== 'doc' || !Array.isArray(content.content)) return { error: 'The article content is missing.' };
  if (Buffer.byteLength(JSON.stringify(content)) > CONTENT_MAX) return { error: 'The article is too long to save as one draft.' };
  const tags = Array.isArray(input.tags) ? input.tags : [];
  return {
    value: {
      title: singleLine(input.title).slice(0, TITLE_MAX),
      description: singleLine(input.description).slice(0, DESCRIPTION_MAX),
      category: slugify(input.category).slice(0, 60),
      tags: [...new Set(tags.map(slugify).filter(Boolean))].slice(0, TAGS_MAX),
      slug: slugify(input.slug),
      useCover: input.useCover !== false,
      content
    }
  };
}

function draftSummary(d) {
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    updatedAt: d.updatedAt,
    url: d.url || null
  };
}

async function listDrafts(request, context) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const { resources } = await draftsContainer()
      .items.query('SELECT c.id, c.title, c.status, c.updatedAt, c.url FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 200')
      .fetchAll();
    return json(200, { drafts: resources.map(draftSummary) });
  } catch (err) {
    context.error('Failed to list drafts', err);
    return json(500, { error: 'Could not load drafts.' });
  }
}

async function draftItem(request, context) {
  const denied = guard(request);
  if (denied) return denied;
  const id = request.params.id;

  try {
    if (request.method === 'GET') {
      const draft = await readDraft(id);
      return draft ? json(200, { draft }) : json(404, { error: 'Draft not found.' });
    }

    if (request.method === 'DELETE') {
      await draftsContainer().item(id, id).delete().catch((err) => {
        if (err.code !== 404) throw err;
      });
      for await (const blob of imagesContainer().listBlobsFlat({ prefix: `drafts/${id}/` })) {
        await imagesContainer().deleteBlob(blob.name).catch(() => {});
      }
      return json(200, { deleted: true });
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return json(400, { error: 'Invalid request.' });
    }
    const cleaned = cleanDraftInput(input);
    if (cleaned.error) return json(400, { error: cleaned.error });

    const existing = (await readDraft(id)) || { id, status: 'draft', createdAt: new Date().toISOString() };
    const draft = { ...existing, ...cleaned.value, id, updatedAt: new Date().toISOString() };
    await draftsContainer().items.upsert(draft);
    return json(200, { draft });
  } catch (err) {
    context.error('Draft request failed', err);
    return json(500, { error: 'Could not update the draft.' });
  }
}

function detectType(buffer, declared) {
  const type = IMAGE_TYPES[declared];
  if (type && type.magic(buffer)) return declared;
  return Object.keys(IMAGE_TYPES).find((t) => IMAGE_TYPES[t].magic(buffer)) || null;
}

async function storeImage(id, buffer, declaredType) {
  if (!buffer.length) return { error: 'The image is empty.' };
  if (buffer.length > IMAGE_MAX) return { error: 'Images can be at most 5 MB.' };
  const type = detectType(buffer, declaredType);
  if (!type) return { error: 'Only JPG, PNG, WebP and GIF images are supported.' };
  const file = `${crypto.randomUUID()}.${IMAGE_TYPES[type].ext}`;
  await imagesContainer()
    .getBlockBlobClient(`drafts/${id}/${file}`)
    .uploadData(buffer, { blobHTTPHeaders: { blobContentType: type } });
  return { file, src: `/api/manage/drafts/${id}/images/${file}` };
}

// Blob Storage failures, explained for the admin (the only caller).
const STORAGE_HINTS = {
  AuthenticationFailed: 'the account key in STORAGE_CONNECTION_STRING is wrong — copy the connection string again from Access keys',
  KeyBasedAuthenticationNotPermitted: 'storage account key access is disabled — turn on "Allow storage account key access" under Configuration',
  AuthorizationFailure: 'the storage account blocks this network — set Networking → Public network access to "Enabled from all networks"',
  AuthorizationPermissionMismatch: 'the credentials in STORAGE_CONNECTION_STRING lack write permission — use the account connection string, not a SAS',
  ContainerNotFound: 'the container was not found — check STORAGE_CONTAINER (default "images")',
  ENOTFOUND: 'the storage account name in STORAGE_CONNECTION_STRING does not exist'
};

function storageError(err) {
  const code = (err && (err.code || (err.details && err.details.errorCode))) || '';
  const hint = STORAGE_HINTS[code];
  const detail = [err && err.statusCode, code].filter(Boolean).join(' ');
  return 'Blob Storage refused the image' + (detail ? ` (${detail})` : '') + (hint ? `: ${hint}.` : '.');
}

async function uploadImage(request, context) {
  const denied = guard(request);
  if (denied) return denied;
  const length = Number(request.headers.get('content-length') || 0);
  if (length > IMAGE_MAX) return json(413, { error: 'Images can be at most 5 MB.' });
  let buffer;
  try {
    buffer = Buffer.from(await request.arrayBuffer());
  } catch (err) {
    context.error('Reading the uploaded image failed', err);
    return json(400, { error: 'The image could not be read from the request.' });
  }
  try {
    const result = await storeImage(request.params.id, buffer, (request.headers.get('content-type') || '').split(';')[0].trim());
    return result.error ? json(400, result) : json(201, result);
  } catch (err) {
    context.error('Image upload failed', err);
    return json(500, { error: storageError(err) });
  }
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

// Fetches an image from a public web address, refusing internal addresses and
// following at most three redirects (each one checked the same way).
async function fetchPublicImage(rawUrl) {
  let url = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https addresses are supported.');
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error('That address is not allowed.');

    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Accept: 'image/*' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`The image could not be downloaded (HTTP ${res.status}).`);
    if (Number(res.headers.get('content-length') || 0) > IMAGE_MAX) throw new Error('Images can be at most 5 MB.');

    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > IMAGE_MAX) throw new Error('Images can be at most 5 MB.');
      chunks.push(chunk);
    }
    return { buffer: Buffer.concat(chunks), type: (res.headers.get('content-type') || '').split(';')[0].trim() };
  }
  throw new Error('Too many redirects.');
}

async function importImage(request, context) {
  const denied = guard(request);
  if (denied) return denied;
  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }
  if (!input || typeof input.url !== 'string' || input.url.length > 2048) return json(400, { error: 'Invalid image address.' });

  let image;
  try {
    image = await fetchPublicImage(input.url);
  } catch (err) {
    context.log('Image import failed', input.url, err.message);
    return json(400, { error: err.message || 'The image could not be downloaded.' });
  }
  try {
    const result = await storeImage(request.params.id, image.buffer, image.type);
    return result.error ? json(400, result) : json(201, result);
  } catch (err) {
    context.error('Storing an imported image failed', err);
    return json(500, { error: storageError(err) });
  }
}

async function serveImage(request, context) {
  const denied = guard(request);
  if (denied) return denied;
  const { id, file } = request.params;
  if (!FILE_RE.test(file)) return json(404, { error: 'Image not found.' });
  try {
    const buffer = await imagesContainer().getBlockBlobClient(`drafts/${id}/${file}`).downloadToBuffer();
    return {
      status: 200,
      body: buffer,
      headers: { 'Content-Type': EXT_TYPES[file.split('.').pop()], 'Cache-Control': 'private, max-age=86400' }
    };
  } catch (err) {
    if (err.statusCode === 404) return json(404, { error: 'Image not found.' });
    context.error('Failed to read image', err);
    return json(500, { error: 'Could not load the image.' });
  }
}

async function publishDraft(request, context) {
  const denied = guard(request);
  if (denied) return denied;
  const id = request.params.id;

  let draft;
  try {
    draft = await readDraft(id);
  } catch (err) {
    context.error('Failed to read draft for publishing', err);
    return json(500, { error: 'Could not load the draft.' });
  }
  if (!draft) return json(404, { error: 'Save the draft before publishing.' });

  const problems = [];
  if (!draft.title) problems.push('a title');
  if (!draft.description) problems.push('a description');
  if (!draft.category) problems.push('a topic');
  if (!draft.content || !(draft.content.content || []).some((n) => n.type !== 'paragraph' || (n.content || []).length)) problems.push('some content');
  if (problems.length) return json(400, { error: 'Add ' + problems.join(', ') + ' before publishing.' });
  if (pendingImages(draft.content)) return json(400, { error: 'Wait for all images to finish uploading (or remove the failed ones) before publishing.' });

  const slug = draft.publishedSlug || draft.slug || slugify(draft.title);
  if (!SLUG_RE.test(slug)) return json(400, { error: 'Set a URL slug using letters and numbers.' });
  const today = new Date().toISOString().slice(0, 10);
  const firstPublish = !draft.publishedPath;

  try {
    if (firstPublish) {
      const taken = (await listFolder('_posts')).some((name) => name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.\w+$/, '') === slug);
      if (taken) return json(409, { error: `An article already uses the address /blog/${slug}/. Change the URL slug and try again.` });
    }

    const files = collectImages(draft.content);
    const published = new Set(draft.publishedImages || []);
    const imageDir = `assets/images/posts/${slug}`;
    const commit = [];
    for (const file of files) {
      if (!FILE_RE.test(file) || published.has(file)) continue;
      const buffer = await imagesContainer().getBlockBlobClient(`drafts/${id}/${file}`).downloadToBuffer();
      commit.push({ path: `${imageDir}/${file}`, content: buffer });
    }
    const removes = [...published].filter((file) => !files.includes(file)).map((file) => `${imageDir}/${file}`);

    const path = draft.publishedPath || `_posts/${today}-${slug}.md`;
    const markdown = toPost(
      {
        title: draft.title,
        description: draft.description,
        category: draft.category,
        tags: draft.tags || [],
        image: draft.useCover !== false && files.length ? `/${imageDir}/${files[0]}` : null,
        lastModified: firstPublish ? null : today
      },
      draft.content,
      files
    );
    commit.push({ path, content: markdown });

    const sha = await commitFiles({
      files: commit,
      removes,
      message: `${firstPublish ? 'Publish' : 'Update'} article: ${draft.title}`
    });

    const now = new Date().toISOString();
    const updated = {
      ...draft,
      status: 'published',
      publishedSlug: slug,
      publishedPath: path,
      publishedImages: files,
      publishedAt: draft.publishedAt || now,
      lastPublishedAt: now,
      url: `/blog/${slug}/`
    };
    const result = { url: updated.url, commit: sha, path, firstPublish };
    try {
      await draftsContainer().items.upsert(updated);
    } catch (err) {
      // The post is already on GitHub; only the draft's bookkeeping failed.
      context.error('Published, but failed to mark the draft as published', err);
      result.warning = 'Published, but the draft could not be marked as published, so updating it from this draft will not work.';
    }
    return json(200, result);
  } catch (err) {
    context.error('Publishing failed', err);
    const auth = err.status === 401 || err.status === 403 || err.status === 404;
    return json(502, {
      error: auth
        ? 'GitHub refused the request. Check that GITHUB_TOKEN is valid and can write to the repository.'
        : 'Publishing failed. Nothing was published; please try again.'
    });
  }
}

app.http('draftsList', { methods: ['GET'], authLevel: 'anonymous', route: 'manage/drafts', handler: listDrafts });
app.http('draftItem', { methods: ['GET', 'PUT', 'DELETE'], authLevel: 'anonymous', route: 'manage/drafts/{id}', handler: draftItem });
app.http('draftImageUpload', { methods: ['POST'], authLevel: 'anonymous', route: 'manage/drafts/{id}/images', handler: uploadImage });
app.http('draftImageImport', { methods: ['POST'], authLevel: 'anonymous', route: 'manage/drafts/{id}/import-image', handler: importImage });
app.http('draftImage', { methods: ['GET'], authLevel: 'anonymous', route: 'manage/drafts/{id}/images/{file}', handler: serveImage });
app.http('draftPublish', { methods: ['POST'], authLevel: 'anonymous', route: 'manage/drafts/{id}/publish', handler: publishDraft });
