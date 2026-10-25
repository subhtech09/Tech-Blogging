/* Turns the /write/ editor's document (TipTap JSON) into a Jekyll post.
   Only node and mark types the site can render are written out; anything else
   is dropped, so no raw HTML from the browser reaches the published page.
   Bold, italic etc. are written as inline HTML tags rather than ** / _ so they
   work at any position in a word. */

const CALLOUTS = ['note', 'tip', 'warning'];
const THEME_COLORS = ['mint', 'sky', 'teal', 'warn'];
const LANG_RE = /^[a-z0-9+#-]{1,30}$/;
const MARK_TAGS = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', highlight: 'mark' };
const MARK_ORDER = ['themeColor', 'highlight', 'bold', 'italic', 'underline', 'strike'];

// Jekyll runs Liquid over the whole post first, so "{{" and "{%" in the
// author's text must be written as Liquid string output.
function escapeLiquid(text) {
  return text.replace(/\{\{|\{%/g, (m) => `{{ "${m}" }}`);
}

function escapeText(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]{}|$~^])/g, '\\$1');
  return escapeLiquid(escaped);
}

function inlineCode(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = /^`|`$/.test(text) ? ' ' : '';
  return escapeLiquid(fence + pad + text + pad + fence);
}

function safeUrl(href) {
  if (typeof href !== 'string') return null;
  const url = href.trim();
  if (/^(https?:|mailto:)/i.test(url) || /^[/#]/.test(url)) {
    return escapeLiquid(encodeURI(decodeURISafe(url)).replace(/[()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()));
  }
  return null;
}

function decodeURISafe(url) {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

function renderTextNode(node) {
  const marks = node.marks || [];
  if (marks.some((m) => m.type === 'code')) return inlineCode(node.text || '');
  let out = escapeText(node.text || '');
  const sorted = MARK_ORDER.map((type) => marks.find((m) => m.type === type)).filter(Boolean).reverse();
  for (const mark of sorted) {
    if (mark.type === 'themeColor') {
      const color = mark.attrs && mark.attrs.color;
      if (THEME_COLORS.includes(color)) out = `<span class="tc-${color}">${out}</span>`;
    } else {
      out = `<${MARK_TAGS[mark.type]}>${out}</${MARK_TAGS[mark.type]}>`;
    }
  }
  return out;
}

function linkOf(node) {
  const link = (node.marks || []).find((m) => m.type === 'link');
  return link && link.attrs ? safeUrl(link.attrs.href) : null;
}

// Inline content, grouping neighbouring text that shares one link.
function renderInline(nodes) {
  const parts = [];
  let i = 0;
  const list = nodes || [];
  while (i < list.length) {
    const node = list[i];
    if (node.type === 'hardBreak') {
      parts.push('<br>');
      i++;
      continue;
    }
    if (node.type !== 'text') {
      i++;
      continue;
    }
    const href = linkOf(node);
    if (!href) {
      parts.push(renderTextNode(node));
      i++;
      continue;
    }
    let inner = '';
    while (i < list.length && list[i].type === 'text' && linkOf(list[i]) === href) {
      inner += renderTextNode(list[i]);
      i++;
    }
    parts.push(`[${inner}](${href})`);
  }
  return parts.join('');
}

// Stops a paragraph's opening characters from being read as Markdown syntax
// (headings, lists, quotes, definition lists, or an indented code block).
function guardLineStart(text) {
  return text
    .replace(/^\s+/, '')
    .replace(/^([#>+=:-])/, '\\$1')
    .replace(/^(\d+)\./, '$1\\.');
}

function indent(text, prefix) {
  return text
    .split('\n')
    .map((line) => (line ? prefix + line : line))
    .join('\n');
}

function plainText(node) {
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(plainText).join('');
}

function figureParam(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, '”')
    .replace(/\{[{%]|[}%]\}/g, '')
    .trim()
    .slice(0, 300);
}

function renderTable(node) {
  const rows = (node.content || []).filter((r) => r.type === 'tableRow');
  if (!rows.length) return '';
  const cellText = (cell) =>
    (cell.content || [])
      .map((p) => renderInline(p.content))
      .filter(Boolean)
      .join('<br>')
      .replace(/\n/g, ' ') || ' ';
  const width = Math.max(...rows.map((r) => (r.content || []).length));
  const line = (cells) => '| ' + Array.from({ length: width }, (_, i) => (cells[i] ? cellText(cells[i]) : ' ')).join(' | ') + ' |';
  const out = [line(rows[0].content || []), '|' + ' --- |'.repeat(width)];
  rows.slice(1).forEach((r) => out.push(line(r.content || [])));
  return out.join('\n');
}

function renderList(node, ordered, ctx) {
  const start = ordered && node.attrs && Number.isInteger(node.attrs.start) ? node.attrs.start : 1;
  return (node.content || [])
    .filter((item) => item.type === 'listItem')
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : '- ';
      const children = item.content || [];
      const body = children
        .map((child, j) => {
          const text = renderBlock(child, ctx);
          if (!j) return text;
          const isList = child.type === 'bulletList' || child.type === 'orderedList';
          return (isList ? '\n' : '\n\n') + text;
        })
        .join('');
      const pad = ' '.repeat(marker.length);
      const lines = indent(body, pad).slice(pad.length);
      return marker + lines;
    })
    .join('\n');
}

function renderBlock(node, ctx) {
  switch (node.type) {
    case 'paragraph':
      return guardLineStart(renderInline(node.content));
    case 'heading': {
      const level = Math.min(4, Math.max(2, (node.attrs && node.attrs.level) || 2));
      const text = renderInline(node.content);
      return text ? '#'.repeat(level) + ' ' + text : '';
    }
    case 'bulletList':
      return renderList(node, false, ctx);
    case 'orderedList':
      return renderList(node, true, ctx);
    case 'blockquote':
      return quote(renderBlocks(node.content, ctx));
    case 'callout': {
      const type = CALLOUTS.includes(node.attrs && node.attrs.type) ? node.attrs.type : 'note';
      const body = renderBlocks(node.content, ctx);
      return body ? quote(body) + `\n{: .${type} }` : '';
    }
    case 'codeBlock': {
      const lang = node.attrs && LANG_RE.test(node.attrs.language || '') ? node.attrs.language : '';
      const code = plainText(node).replace(/\n+$/, '');
      const longest = Math.max(2, ...(code.match(/^`+/gm) || []).map((run) => run.length));
      const fence = '`'.repeat(longest + 1);
      return escapeLiquid(`${fence}${lang}\n${code}\n${fence}`);
    }
    case 'horizontalRule':
      return '* * *';
    case 'table':
      return renderTable(node);
    case 'figure': {
      const a = node.attrs || {};
      if (!a.file || !ctx.files.has(a.file)) return '';
      const params = [`src="${a.file}"`];
      if (a.alt) params.push(`alt="${figureParam(a.alt)}"`);
      if (a.caption) params.push(`caption="${figureParam(a.caption)}"`);
      return `{% include figure.html ${params.join(' ')} %}`;
    }
    default:
      return '';
  }
}

function quote(text) {
  return text
    .split('\n')
    .map((line) => (line ? '> ' + line : '>'))
    .join('\n');
}

function renderBlocks(nodes, ctx) {
  return (nodes || [])
    .map((n) => renderBlock(n, ctx))
    .filter((text) => text.trim())
    .join('\n\n');
}

// File names of the uploaded images in a document, in order of appearance.
function collectImages(doc) {
  const files = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'figure' && node.attrs && typeof node.attrs.file === 'string') files.push(node.attrs.file);
    (node.content || []).forEach(walk);
  })(doc);
  return [...new Set(files)];
}

// Images that never finished uploading (or failed) — publishing must wait.
function pendingImages(doc) {
  let count = 0;
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'figure' && !(node.attrs && node.attrs.file)) count++;
    (node.content || []).forEach(walk);
  })(doc);
  return count;
}

function frontMatter(meta) {
  const lines = [
    '---',
    `title: ${JSON.stringify(meta.title)}`,
    `description: ${JSON.stringify(meta.description)}`,
    `category: ${meta.category}`,
    `tags: [${meta.tags.join(', ')}]`
  ];
  if (meta.image) lines.push(`image: ${meta.image}`);
  if (meta.lastModified) lines.push(`last_modified_at: ${meta.lastModified}`);
  lines.push('---');
  return lines.join('\n');
}

function toPost(meta, doc, files) {
  const body = renderBlocks((doc && doc.content) || [], { files: new Set(files) });
  return frontMatter(meta) + '\n\n' + body + '\n';
}

module.exports = { toPost, collectImages, pendingImages, CALLOUTS, THEME_COLORS };
