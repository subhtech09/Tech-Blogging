/* ==========================================================================
   Admin Corner (/admin/) — admin only
   Moderate comments: approve, reject or delete the checked pending comments.
   Manage articles: edit the checked article (one at a time) or delete the
   checked published articles.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-admin]');
  if (!root || !window.fetch) return;

  var api = root.getAttribute('data-api').replace(/\/$/, '') + '/manage';
  var posts = {};
  try { posts = JSON.parse(document.getElementById('admin-posts').textContent); } catch (e) { /* no post map */ }
  var dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function request(url, options) {
    return fetch(url, options).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Request failed (HTTP ' + r.status + ').');
        return data;
      });
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* A section with checkboxes, a "Select all" box and action buttons that are
     enabled while something is checked. */
  function Panel(name) {
    var section = root.querySelector('[data-panel="' + name + '"]');
    this.list = section.querySelector('[data-list]');
    this.status = section.querySelector('[data-status]');
    this.selectAll = section.querySelector('[data-select-all]');
    this.buttons = section.querySelectorAll('button[data-action]');
    this.busy = false;
    var self = this;
    this.list.addEventListener('change', function () { self.update(); });
    if (this.selectAll) {
      this.selectAll.addEventListener('change', function () {
        self.boxes().forEach(function (box) { box.checked = self.selectAll.checked; });
        self.update();
      });
    }
    this.update();
  }

  Panel.prototype.boxes = function () {
    return Array.prototype.slice.call(this.list.querySelectorAll('input[type="checkbox"]'));
  };

  Panel.prototype.checked = function () {
    return this.boxes().filter(function (box) { return box.checked; });
  };

  Panel.prototype.update = function () {
    var total = this.boxes().length;
    var n = this.checked().length;
    var busy = this.busy;
    this.buttons.forEach(function (b) { b.disabled = busy || !n; });
    if (this.selectAll) {
      this.selectAll.checked = total > 0 && n === total;
      this.selectAll.indeterminate = n > 0 && n < total;
      this.selectAll.disabled = busy || !total;
      this.selectAll.parentNode.hidden = !total;
    }
  };

  Panel.prototype.setBusy = function (on) {
    this.busy = on;
    this.update();
  };

  /* ---------- Moderate comments ---------------------------------------- */
  var comments = new Panel('comments');

  function renderComment(c) {
    var li = el('li', 'admin-item');
    var check = el('label', 'admin-check');
    var box = el('input');
    box.type = 'checkbox';
    box.setAttribute('data-slug', c.slug);
    box.setAttribute('data-id', c.id);
    box.setAttribute('aria-label', 'Select comment by ' + c.name);
    check.appendChild(box);
    li.appendChild(check);

    var body = el('div', 'admin-item-body');
    var meta = el('div', 'admin-meta');
    meta.appendChild(el('strong', 'comment-author', c.name));
    if (c.email) {
      var mail = el('a', null, c.email);
      mail.href = 'mailto:' + c.email;
      meta.appendChild(mail);
    }
    meta.appendChild(el('time', 'comment-date', dateFmt.format(new Date(c.createdAt))));
    body.appendChild(meta);

    var on = el('p', 'admin-post');
    on.appendChild(document.createTextNode('On '));
    var post = posts[c.slug];
    if (post) {
      var link = el('a', null, post.title);
      link.href = post.url;
      on.appendChild(link);
    } else {
      on.appendChild(el('code', null, c.slug));
    }
    body.appendChild(on);

    var text = el('div', 'comment-body');
    c.body.split(/\n{2,}/).forEach(function (para) { text.appendChild(el('p', null, para)); });
    body.appendChild(text);
    li.appendChild(body);
    return li;
  }

  function loadComments() {
    comments.list.textContent = '';
    comments.status.textContent = 'Loading comments…';
    return request(api + '/comments?status=pending', { headers: { Accept: 'application/json' } })
      .then(function (data) {
        var list = data.comments || [];
        list.forEach(function (c) { comments.list.appendChild(renderComment(c)); });
        comments.status.textContent = list.length ? plural(list.length, 'comment') + ' waiting for approval.' : 'No comments waiting for approval.';
        comments.update();
      })
      .catch(function (err) { comments.status.textContent = err.message; });
  }

  var DONE = { approved: 'approved', rejected: 'rejected', delete: 'deleted' };

  comments.buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var action = button.getAttribute('data-action');
      var boxes = comments.checked();
      if (!boxes.length) return;
      if (action === 'delete' && !window.confirm('Delete ' + plural(boxes.length, 'comment') + ' permanently?')) return;

      comments.setBusy(true);
      comments.status.textContent = 'Working…';
      var ok = 0;
      var failed = [];
      // One request per comment, in order, so a failure only affects that comment.
      boxes.reduce(function (chain, box) {
        return chain.then(function () {
          var url = api + '/comments/' + encodeURIComponent(box.getAttribute('data-slug')) + '/' + encodeURIComponent(box.getAttribute('data-id'));
          var options = action === 'delete'
            ? { method: 'DELETE' }
            : { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: action }) };
          return request(url, options)
            .then(function () { box.closest('li').remove(); ok++; })
            .catch(function (err) { failed.push(err.message); });
        });
      }, Promise.resolve()).then(function () {
        var left = comments.boxes().length;
        var msg = ok ? plural(ok, 'comment') + ' ' + DONE[action] + '.' : '';
        if (failed.length) msg += ' ' + plural(failed.length, 'comment') + ' failed: ' + failed[0];
        if (!left) msg += ' No comments waiting for approval.';
        comments.status.textContent = msg.trim();
        comments.setBusy(false);
      });
    });
  });

  /* ---------- Manage articles ------------------------------------------- */
  var articles = new Panel('articles');
  var editButton = root.querySelector('[data-panel="articles"] button[data-action="edit"]');
  var deleteButton = root.querySelector('[data-panel="articles"] button[data-action="delete"]');

  // Published path -> editor draft id. Only articles published from the
  // article editor have one; hand-written posts can't be edited here.
  var editable = null;
  var editableLoad = request(api + '/drafts', { headers: { Accept: 'application/json' } }).then(function (data) {
    editable = {};
    (data.drafts || []).forEach(function (d) {
      if (d.status === 'published' && d.publishedPath) editable[d.publishedPath] = d.id;
    });
  }).catch(function (err) { editableLoad.error = err.message; });

  editButton.addEventListener('click', function () {
    var boxes = articles.checked();
    if (!boxes.length) return;
    if (boxes.length > 1) {
      window.alert('Select only one article to edit. ' + plural(boxes.length, 'article') + ' are selected.');
      return;
    }
    var box = boxes[0];
    articles.status.textContent = 'Opening…';
    editableLoad.then(function () {
      if (!editable) {
        articles.status.textContent = 'Could not check which articles can be edited: ' + (editableLoad.error || 'unknown error.');
        return;
      }
      var id = editable[box.value];
      if (!id) {
        articles.status.textContent = '';
        window.alert('“' + box.getAttribute('data-title') + '” was not written in the article editor, so it can’t be edited here.\n\n' +
          'Edit its file in GitHub instead: ' + box.value);
        return;
      }
      window.location.href = '/edit/?draft=' + encodeURIComponent(id);
    });
  });

  deleteButton.addEventListener('click', function () {
    var boxes = articles.checked();
    if (!boxes.length) return;
    var titles = boxes.map(function (b) { return '• ' + b.getAttribute('data-title'); }).join('\n');
    if (!window.confirm('Delete ' + plural(boxes.length, 'article') + ' from the site?\n\n' + titles +
      '\n\nThe posts and their images are removed from GitHub. This cannot be undone here.')) return;

    articles.setBusy(true);
    articles.status.textContent = 'Deleting…';
    request(api + '/articles/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: boxes.map(function (b) { return b.value; }) })
    }).then(function (res) {
      var gone = (res.deleted || []).concat(res.missing || []);
      boxes.forEach(function (b) { if (gone.indexOf(b.value) !== -1) b.closest('li').remove(); });
      var msg = plural((res.deleted || []).length, 'article') + ' deleted. The site updates in about 3 minutes, once the deploy finishes.';
      if (res.missing && res.missing.length) msg += ' ' + plural(res.missing.length, 'article') + ' had already been removed.';
      if (res.warning) msg += ' ' + res.warning;
      if (!articles.boxes().length) msg += ' No published articles left.';
      articles.status.textContent = msg;
    }).catch(function (err) {
      articles.status.textContent = err.message;
    }).then(function () { articles.setBusy(false); });
  });

  loadComments();
})();
