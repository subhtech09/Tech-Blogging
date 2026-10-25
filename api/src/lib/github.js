/* Minimal GitHub client for publishing posts: commits several files (and
   removals) to the site's branch as a single commit, using a fine-grained
   token limited to this repository (Contents: read and write). */

const API = 'https://api.github.com';

function repo() {
  return process.env.GITHUB_REPO || 'subhtech09/Tech-Blogging';
}

function branch() {
  return process.env.GITHUB_BRANCH || 'main';
}

async function gh(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'architects-handbook-publisher',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${path} failed: ${res.status} ${(data && data.message) || ''}`.trim());
    err.status = res.status;
    throw err;
  }
  return data;
}

// Names of the files in a repo folder (empty if the folder doesn't exist).
async function listFolder(path) {
  try {
    const items = await gh('GET', `/repos/${repo()}/contents/${path}?ref=${encodeURIComponent(branch())}`);
    return Array.isArray(items) ? items.map((i) => i.name) : [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/* files:   [{ path, content: Buffer | string }]
   removes: [path]  — files to delete in the same commit */
async function commitFiles({ files, removes = [], message }) {
  const blobs = [];
  for (const file of files) {
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const blob = await gh('POST', `/repos/${repo()}/git/blobs`, { content: content.toString('base64'), encoding: 'base64' });
    blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const deletions = removes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null }));

  // Retry once if someone else pushed in between (the ref update isn't a fast-forward).
  for (let attempt = 0; ; attempt++) {
    const ref = await gh('GET', `/repos/${repo()}/git/ref/heads/${encodeURIComponent(branch())}`);
    const parent = await gh('GET', `/repos/${repo()}/git/commits/${ref.object.sha}`);
    const tree = await gh('POST', `/repos/${repo()}/git/trees`, { base_tree: parent.tree.sha, tree: blobs.concat(deletions) });
    const commit = await gh('POST', `/repos/${repo()}/git/commits`, { message, tree: tree.sha, parents: [parent.sha] });
    try {
      await gh('PATCH', `/repos/${repo()}/git/refs/heads/${encodeURIComponent(branch())}`, { sha: commit.sha, force: false });
      return commit.sha;
    } catch (err) {
      if (err.status !== 422 || attempt >= 1) throw err;
    }
  }
}

module.exports = { listFolder, commitFiles };
