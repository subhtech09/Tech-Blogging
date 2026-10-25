/* Helpers shared by the comment functions: Cosmos DB access, settings,
   responses, caller identity and input cleaning. */
const crypto = require('node:crypto');
const { CosmosClient } = require('@azure/cosmos');

const REQUIRED_SETTINGS = ['COSMOS_CONNECTION_STRING', 'TURNSTILE_SECRET_KEY', 'IP_HASH_SALT'];

// Matches Jekyll post slugs (or a post's `comments_id`), e.g. "medallion-architecture".
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const ID_RE = /^[0-9a-f-]{36}$/;

let cosmos;
let container;

function missingSettings() {
  return REQUIRED_SETTINGS.filter((name) => !process.env[name]);
}

function getDatabase() {
  if (!cosmos) cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  return cosmos.database(process.env.COSMOS_DATABASE || 'blog');
}

function getContainer() {
  if (!container) container = getDatabase().container(process.env.COSMOS_CONTAINER || 'comments');
  return container;
}

function json(status, body) {
  return {
    status,
    jsonBody: body,
    headers: { 'Cache-Control': 'no-store' }
  };
}

// Static Web Apps passes the signed-in user (if any) in this header.
function getPrincipal(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isAdmin(request) {
  const principal = getPrincipal(request);
  return Boolean(principal && Array.isArray(principal.userRoles) && principal.userRoles.includes('admin'));
}

// First address in X-Forwarded-For, without the port Static Web Apps appends.
function clientIp(request) {
  const raw = (request.headers.get('x-forwarded-for') || request.headers.get('x-client-ip') || '')
    .split(',')[0]
    .trim();
  if (raw.startsWith('[')) return raw.slice(1, raw.indexOf(']'));          // [IPv6]:port
  if ((raw.match(/:/g) || []).length === 1) return raw.split(':')[0];      // IPv4:port
  return raw;
}

// Only a keyed hash of the IP is stored, for rate limiting.
function hashIp(ip) {
  return crypto.createHmac('sha256', process.env.IP_HASH_SALT).update(ip || 'unknown').digest('hex').slice(0, 32);
}

function stripControlChars(value) {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '');
}

function singleLine(value) {
  if (typeof value !== 'string') return '';
  return stripControlChars(value).replace(/\s+/g, ' ').trim();
}

function multiLine(value) {
  if (typeof value !== 'string') return '';
  return stripControlChars(value)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The fields readers may see. Email and IP hash never leave the API.
function publicComment(item) {
  return { id: item.id, name: item.name, body: item.body, createdAt: item.createdAt };
}

module.exports = {
  SLUG_RE,
  ID_RE,
  missingSettings,
  getDatabase,
  getContainer,
  json,
  isAdmin,
  clientIp,
  hashIp,
  singleLine,
  multiLine,
  publicComment
};
