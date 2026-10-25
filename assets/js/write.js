/* ==========================================================================
   Article editor (/write/) — admin only
   Drafts are saved to /api/manage/drafts; images pasted or dropped into the
   text are resized here and uploaded straight away; Publish commits the post
   to GitHub, and the deploy workflow puts it live.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-write]');
  if (!root || !window.BlogEditor || !window.fetch) return;

  var api = root.getAttribute('data-api').replace(/\/$/, '') + '/manage/drafts';
  var form = root.querySelector('[data-write-form]');
  var toolbar = root.querySelector('[data-toolbar]');
  var frame = root.querySelector('[data-editor-frame]');
  var preview = root.querySelector('[data-preview]');
  var status = root.querySelector('[data-write-status]');
  var draftsList = root.querySelector('[data-drafts-list]');
  var draftsStatus = root.querySelector('[data-drafts-status]');
  var slugHint = root.querySelector('[data-slug-hint]');
  var btn = function (name) { return root.querySelector('[data-action="' + name + '"]'); };
  var dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  var MAX_WIDTH = 1600;               // px; wider images are scaled down
  var KEEP_AS_IS = 1.5 * 1024 * 1024; // smaller images within MAX_WIDTH are uploaded unchanged
  var UPLOAD_MAX = 5 * 1024 * 1024;

  var state = { id: null, draft: null, dirty: false, busy: false };

  /* ---------- Helpers --------------------------------------------------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function request(url, options) {
    return fetch(url, options).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Request failed (HTTP ' + r.status + ').');
        return data;
      });
    });
  }

  function sendJson(method, url, body) {
    return request(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function say(text) { status.textContent = text; }

  function slugify(value) {
    return String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
  }

  function markDirty() {
    if (state.dirty) return;
    state.dirty = true;
    say('Unsaved changes.');
  }

  /* ---------- Editor ---------------------------------------------------- */
  function imageFiles(list) {
    return Array.prototype.filter.call(list || [], function (f) { return /^image\//.test(f.type); });
  }

  var editor = window.BlogEditor.createEditor(root.querySelector('[data-editor]'), {
    placeholder: 'Start writing… Paste or drop images anywhere.',
    onUpdate: function () { markDirty(); scheduleSweep(); },
    onTransaction: updateToolbar,
    editorProps: {
      handlePaste: function (view, event) {
        var files = imageFiles(event.clipboardData && event.clipboardData.files);
        if (!files.length) return false;
        // A copied web-page selection carries HTML with text as well; let the
        // editor paste that (its images are imported afterwards). A copied
        // image on its own is uploaded from the file directly.
        var html = event.clipboardData.getData('text/html') || '';
        var text = new DOMParser().parseFromString(html, 'text/html').body.textContent.trim();
        if (text) return false;
        event.preventDefault();
        insertImages(files);
        return true;
      },
      handleDrop: function (view, event, slice, moved) {
        var files = !moved && imageFiles(event.dataTransfer && event.dataTransfer.files);
        if (!files || !files.length) return false;
        event.preventDefault();
        var pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) editor.commands.setTextSelection(pos.pos);
        insertImages(files);
        return true;
      }
    }
  });

  function insertImages(files) {
    files.forEach(function (file) {
      var uid = uuid();
      // The empty paragraph after the image takes the cursor, so typing (or
      // the next paste) continues below the image instead of replacing it.
      editor.chain().focus().insertContent([
        { type: 'figure', attrs: { src: URL.createObjectURL(file), uid: uid, status: 'uploading' } },
        { type: 'paragraph' }
      ]).run();
      processImage(uid, Promise.resolve(file));
    });
  }

  function findFigure(uid) {
    var hit = null;
    editor.state.doc.descendants(function (node, pos) {
      if (hit) return false;
      if (node.type.name === 'figure' && node.attrs.uid === uid) hit = { node: node, pos: pos };
    });
    return hit;
  }

  // Updates an image's attributes without adding an undo step.
  function setFigure(uid, attrs) {
    var hit = findFigure(uid);
    if (!hit) return false;
    var tr = editor.state.tr.setNodeMarkup(hit.pos, undefined, Object.assign({}, hit.node.attrs, attrs));
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
    return true;
  }

  function loadBitmap(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('This image format is not supported. Use JPG, PNG, WebP or GIF.')); };
      img.src = URL.createObjectURL(blob);
    });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }

  // Scales big images down to MAX_WIDTH; keeps PNG for screenshots when it stays small.
  function prepareImage(blob) {
    if (/heic|heif/i.test(blob.type)) return Promise.reject(new Error('HEIC photos are not supported. Convert to JPG first.'));
    if (blob.type === 'image/gif') {
      return blob.size <= UPLOAD_MAX ? Promise.resolve(blob) : Promise.reject(new Error('GIFs can be at most 5 MB.'));
    }
    return loadBitmap(blob).then(function (bmp) {
      var w = bmp.width;
      var h = bmp.height;
      var ok = /^image\/(jpeg|png|webp)$/.test(blob.type);
      if (ok && w <= MAX_WIDTH && blob.size <= KEEP_AS_IS) return blob;

      var scale = Math.min(1, MAX_WIDTH / w);
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      var ctx = canvas.getContext('2d');
      var asJpeg = function () {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return canvasBlob(canvas, 'image/jpeg', 0.85);
      };
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (blob.type !== 'image/png') return asJpeg();
      return canvasBlob(canvas, 'image/png').then(function (png) {
        return png && png.size <= KEEP_AS_IS ? png : asJpeg();
      });
    }).then(function (out) {
      if (!out) throw new Error('The image could not be processed.');
      if (out.size > UPLOAD_MAX) throw new Error('The image is too large even after resizing.');
      return out;
    });
  }

  function uploadBlob(blob) {
    return request(api + '/' + state.id + '/images', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  }

  function finishImage(uid, upload) {
    var hit = findFigure(uid);
    var oldSrc = hit && hit.node.attrs.src;
    return upload.then(function (res) {
      setFigure(uid, { src: res.src, file: res.file, status: null });
      if (oldSrc && oldSrc.indexOf('blob:') === 0) URL.revokeObjectURL(oldSrc);
      markDirty();
    }).catch(function (err) {
      setFigure(uid, { status: 'error' });
      say('Image failed: ' + err.message + ' Select it and choose “Remove image”, then try again.');
    });
  }

  function processImage(uid, blobPromise) {
    return finishImage(uid, blobPromise.then(prepareImage).then(uploadBlob));
  }

  // Finds images that arrived without an upload (pasted HTML, data: URLs,
  // images from other websites) and uploads or imports them.
  var sweepTimer = null;
  function scheduleSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweep, 150);
  }

  function sweep() {
    var todo = [];
    var tr = editor.state.tr;
    editor.state.doc.descendants(function (node, pos) {
      if (node.type.name !== 'figure' || node.attrs.file || node.attrs.status) return;
      var uid = node.attrs.uid || uuid();
      tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { uid: uid, status: 'uploading' }));
      todo.push({ uid: uid, src: node.attrs.src || '' });
    });
    if (!todo.length) return;
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);

    todo.forEach(function (item) {
      if (/^(blob:|data:image\/)/.test(item.src)) {
        processImage(item.uid, fetch(item.src).then(function (r) { return r.blob(); }));
      } else if (/^https?:\/\//i.test(item.src)) {
        finishImage(item.uid, sendJson('POST', api + '/' + state.id + '/import-image', { url: item.src }));
      } else {
        setFigure(item.uid, { status: 'error' });
        say('An image could not be copied. Save it to your computer and paste it again.');
      }
    });
  }

  /* ---------- Toolbar --------------------------------------------------- */
  var blockSelect = toolbar.querySelector('[data-block]');
  var colorSelect = toolbar.querySelector('[data-color]');
  var calloutSelect = toolbar.querySelector('[data-callout]');
  var languageSelect = toolbar.querySelector('[data-language]');
  var tableTools = toolbar.querySelector('[data-table-tools]');
  var imageTools = toolbar.querySelector('[data-image-tools]');

  function editLink() {
    var prev = editor.getAttributes('link').href || '';
    var href = window.prompt('Link address (leave empty to remove the link):', prev || 'https://');
    if (href === null) return;
    href = href.trim();
    if (!href || href === 'https://') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    if (!/^(https?:\/\/|mailto:|\/|#)/i.test(href)) { say('Links must start with https://, http://, mailto:, / or #.'); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: href }).run();
  }

  function editFigure(attr, label) {
    var current = editor.getAttributes('figure')[attr] || '';
    var value = window.prompt(label, current);
    if (value === null) return;
    editor.chain().focus().updateAttributes('figure', (function () { var o = {}; o[attr] = value.trim(); return o; })()).run();
  }

  var COMMANDS = {
    bold: function (c) { return c.toggleBold(); },
    italic: function (c) { return c.toggleItalic(); },
    underline: function (c) { return c.toggleUnderline(); },
    strike: function (c) { return c.toggleStrike(); },
    highlight: function (c) { return c.toggleHighlight(); },
    code: function (c) { return c.toggleCode(); },
    bulletList: function (c) { return c.toggleBulletList(); },
    orderedList: function (c) { return c.toggleOrderedList(); },
    blockquote: function (c) { return c.toggleBlockquote(); },
    codeBlock: function (c) { return c.toggleCodeBlock(); },
    horizontalRule: function (c) { return c.setHorizontalRule(); },
    table: function (c) { return c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }); },
    addRowAfter: function (c) { return c.addRowAfter(); },
    addColumnAfter: function (c) { return c.addColumnAfter(); },
    deleteRow: function (c) { return c.deleteRow(); },
    deleteColumn: function (c) { return c.deleteColumn(); },
    deleteTable: function (c) { return c.deleteTable(); },
    removeImage: function (c) { return c.deleteSelection(); },
    undo: function (c) { return c.undo(); },
    redo: function (c) { return c.redo(); }
  };

  toolbar.addEventListener('mousedown', function (e) {
    // Keep the editor's selection when clicking toolbar buttons.
    if (e.target.closest('.tb-btn')) e.preventDefault();
  });

  toolbar.addEventListener('click', function (e) {
    var button = e.target.closest('[data-cmd]');
    if (!button) return;
    var cmd = button.getAttribute('data-cmd');
    if (cmd === 'link') return editLink();
    if (cmd === 'caption') return editFigure('caption', 'Caption shown under the image:');
    if (cmd === 'alt') return editFigure('alt', 'Describe the image for readers who can’t see it:');
    if (COMMANDS[cmd]) COMMANDS[cmd](editor.chain().focus()).run();
  });

  blockSelect.addEventListener('change', function () {
    var chain = editor.chain().focus();
    if (blockSelect.value === 'paragraph') chain.setParagraph().run();
    else chain.setHeading({ level: Number(blockSelect.value) }).run();
  });

  colorSelect.addEventListener('change', function () {
    var chain = editor.chain().focus();
    if (colorSelect.value) chain.setThemeColor(colorSelect.value).run();
    else chain.unsetThemeColor().run();
  });

  calloutSelect.addEventListener('change', function () {
    var chain = editor.chain().focus();
    if (calloutSelect.value) chain.setCallout(calloutSelect.value).run();
    else chain.unsetCallout().run();
  });

  languageSelect.addEventListener('change', function () {
    editor.chain().focus().updateAttributes('codeBlock', { language: languageSelect.value || null }).run();
  });

  function updateToolbar() {
    if (!editor) return;
    toolbar.querySelectorAll('[data-cmd]').forEach(function (b) {
      var cmd = b.getAttribute('data-cmd');
      var active = ['bold', 'italic', 'underline', 'strike', 'highlight', 'code', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'link'].indexOf(cmd) !== -1 && editor.isActive(cmd);
      b.classList.toggle('is-active', active);
      if (b.hasAttribute('aria-label')) b.setAttribute('aria-pressed', String(active));
    });
    toolbar.querySelector('[data-cmd="undo"]').disabled = !editor.can().undo();
    toolbar.querySelector('[data-cmd="redo"]').disabled = !editor.can().redo();

    var level = [2, 3, 4].filter(function (l) { return editor.isActive('heading', { level: l }); })[0];
    blockSelect.value = level ? String(level) : 'paragraph';
    colorSelect.value = editor.getAttributes('themeColor').color || '';
    calloutSelect.value = editor.isActive('callout') ? editor.getAttributes('callout').type : '';

    var inCode = editor.isActive('codeBlock');
    languageSelect.hidden = !inCode;
    if (inCode) languageSelect.value = editor.getAttributes('codeBlock').language || '';
    tableTools.hidden = !editor.isActive('table');
    imageTools.hidden = !editor.isActive('figure');
  }

  /* ---------- Form ------------------------------------------------------ */
  function fieldValues() {
    var tags = form.elements.tags.value.split(',').map(function (t) { return slugify(t); }).filter(Boolean);
    return {
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      category: form.elements.category.value,
      tags: tags,
      slug: slugify(form.elements.slug.value),
      useCover: form.elements.useCover.checked,
      content: editor.getJSON()
    };
  }

  function updateSlugHint() {
    var published = state.draft && state.draft.publishedSlug;
    var slug = published || slugify(form.elements.slug.value) || slugify(form.elements.title.value);
    form.elements.slug.placeholder = slugify(form.elements.title.value) || 'from-the-title';
    form.elements.slug.disabled = Boolean(published);
    slugHint.textContent = slug ? '/blog/' + slug + '/' + (published ? ' (fixed once published)' : '') : 'leave empty to use the title';
  }

  form.addEventListener('input', function (e) {
    markDirty();
    if (e.target.name === 'title' || e.target.name === 'slug') updateSlugHint();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  // Images whose upload was interrupted (e.g. by a reload) get retried.
  function resetInterrupted(doc) {
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'figure' && node.attrs && !node.attrs.file && node.attrs.status === 'uploading') node.attrs.status = null;
      (node.content || []).forEach(walk);
    })(doc);
    return doc;
  }

  function fillForm(draft) {
    form.elements.title.value = draft.title || '';
    form.elements.description.value = draft.description || '';
    if (draft.category) form.elements.category.value = draft.category;
    form.elements.tags.value = (draft.tags || []).join(', ');
    form.elements.slug.value = draft.slug || '';
    form.elements.useCover.checked = draft.useCover !== false;
    editor.commands.setContent(draft.content ? resetInterrupted(draft.content) : '', false);
    // A fresh editor state, so undo can't step back into the previous article.
    var s = editor.state;
    editor.view.updateState(s.constructor.create({ doc: s.doc, plugins: s.plugins, schema: s.schema }));
    updateSlugHint();
    updatePublishButton();
    scheduleSweep();
  }

  function updatePublishButton() {
    var published = state.draft && state.draft.status === 'published';
    btn('publish').textContent = published ? 'Update published article' : 'Publish';
  }

  function setUrl(id) {
    var url = new URL(window.location.href);
    if (id) url.searchParams.set('draft', id); else url.searchParams.delete('draft');
    history.replaceState(null, '', url);
  }

  function setPreview(on) {
    btn('preview').setAttribute('aria-pressed', String(on));
    btn('preview').textContent = on ? 'Back to editing' : 'Preview';
    preview.hidden = !on;
    frame.hidden = on;
    toolbar.hidden = on;
    if (!on) return;
    preview.querySelector('[data-preview-title]').textContent = form.elements.title.value || 'Untitled';
    preview.querySelector('[data-preview-description]').textContent = form.elements.description.value;
    // The editor's own HTML only contains the elements its schema allows.
    preview.querySelector('[data-preview-body]').innerHTML = editor.getHTML();
  }

  /* ---------- Drafts ---------------------------------------------------- */
  function confirmDiscard() {
    return !state.dirty || window.confirm('Discard the unsaved changes?');
  }

  function newDraft() {
    state.id = uuid();
    state.draft = null;
    fillForm({});
    state.dirty = false;
    setUrl(null);
    setPreview(false);
    say('New article. It is saved when you choose “Save draft”.');
    highlightCurrent();
  }

  function loadDraft(id) {
    say('Loading draft…');
    return request(api + '/' + encodeURIComponent(id)).then(function (data) {
      state.id = data.draft.id;
      state.draft = data.draft;
      fillForm(data.draft);
      state.dirty = false;
      setUrl(state.id);
      setPreview(false);
      say(data.draft.status === 'published'
        ? 'Published at ' + data.draft.url + '. Changes go live when you choose “Update published article”.'
        : 'Draft loaded.');
      highlightCurrent();
    }).catch(function (err) {
      say(err.message);
      if (!state.id) newDraft();
    });
  }

  function saveDraft() {
    var body = fieldValues();
    return sendJson('PUT', api + '/' + state.id, body).then(function (data) {
      state.draft = data.draft;
      state.dirty = false;
      setUrl(state.id);
      updateSlugHint();
      refreshList();
      return data.draft;
    });
  }

  function highlightCurrent() {
    draftsList.querySelectorAll('[data-id]').forEach(function (b) {
      b.classList.toggle('is-current', b.getAttribute('data-id') === state.id);
    });
  }

  function refreshList() {
    return request(api).then(function (data) {
      draftsList.textContent = '';
      (data.drafts || []).forEach(function (d) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'write-draft';
        b.setAttribute('data-id', d.id);
        var title = document.createElement('span');
        title.className = 'write-draft-title';
        title.textContent = d.title || 'Untitled';
        var meta = document.createElement('span');
        meta.className = 'write-draft-meta';
        meta.textContent = (d.status === 'published' ? 'Published · ' : 'Draft · ') + (d.updatedAt ? dateFmt.format(new Date(d.updatedAt)) : '');
        b.appendChild(title);
        b.appendChild(meta);
        b.addEventListener('click', function () {
          if (d.id !== state.id && confirmDiscard()) loadDraft(d.id);
        });
        li.appendChild(b);
        draftsList.appendChild(li);
      });
      draftsStatus.textContent = data.drafts && data.drafts.length ? '' : 'No drafts yet.';
      highlightCurrent();
    }).catch(function (err) { draftsStatus.textContent = err.message; });
  }

  function busy(on) {
    state.busy = on;
    ['save', 'publish', 'delete', 'new'].forEach(function (n) { btn(n).disabled = on; });
  }

  function uploadsPending() {
    var n = 0;
    editor.state.doc.descendants(function (node) {
      if (node.type.name === 'figure' && node.attrs.status === 'uploading') n++;
    });
    return n;
  }

  btn('save').addEventListener('click', function () {
    if (state.busy) return;
    busy(true);
    say('Saving…');
    saveDraft().then(function () {
      say('Draft saved' + (uploadsPending() ? ' (images still uploading — save again when they finish).' : '.'));
    }).catch(function (err) { say(err.message); }).then(function () { busy(false); });
  });

  btn('publish').addEventListener('click', function () {
    if (state.busy) return;
    if (uploadsPending()) { say('Wait for the images to finish uploading.'); return; }
    var values = fieldValues();
    var missing = [];
    if (!values.title) missing.push('a title');
    if (!values.description) missing.push('a description');
    if (editor.isEmpty) missing.push('some content');
    if (missing.length) { say('Add ' + missing.join(', ') + ' before publishing.'); return; }

    var published = state.draft && state.draft.status === 'published';
    var slug = (state.draft && state.draft.publishedSlug) || values.slug || slugify(values.title);
    var question = published
      ? 'Update the published article at /blog/' + slug + '/ with these changes?'
      : 'Publish this article at /blog/' + slug + '/? It goes live in about 3 minutes.';
    if (!window.confirm(question)) return;

    busy(true);
    say('Saving…');
    saveDraft().then(function () {
      say('Publishing…');
      return request(api + '/' + state.id + '/publish', { method: 'POST' });
    }).then(function (res) {
      return loadDraft(state.id).then(function () {
        say((res.firstPublish ? 'Published' : 'Updated') + '. It will be live at ' + res.url +
          ' in about 3 minutes, once the deploy finishes.' + (res.warning ? ' ' + res.warning : ''));
        refreshList();
      });
    }).catch(function (err) { say(err.message); }).then(function () { busy(false); });
  });

  btn('delete').addEventListener('click', function () {
    if (state.busy) return;
    var published = state.draft && state.draft.status === 'published';
    var question = published
      ? 'Delete this draft? The published article stays live; you just won’t be able to update it from here.'
      : 'Delete this draft and its images permanently?';
    if (!window.confirm(question)) return;
    busy(true);
    request(api + '/' + state.id, { method: 'DELETE' }).then(function () {
      state.dirty = false;
      newDraft();
      say('Draft deleted.');
      refreshList();
    }).catch(function (err) { say(err.message); }).then(function () { busy(false); });
  });

  btn('new').addEventListener('click', function () {
    if (confirmDiscard()) newDraft();
  });

  btn('preview').addEventListener('click', function () {
    setPreview(btn('preview').getAttribute('aria-pressed') !== 'true');
  });

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      btn('save').click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && root.contains(document.activeElement)) {
      e.preventDefault();
      editLink();
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ---------- Start ----------------------------------------------------- */
  var initial = new URLSearchParams(window.location.search).get('draft');
  refreshList();
  if (initial) loadDraft(initial); else newDraft();
  updateToolbar();
})();
