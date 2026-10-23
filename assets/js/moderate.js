/* ==========================================================================
   Comment moderation page (/moderate/) — admin only
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-moderate]');
  if (!root || !window.fetch) return;

  var api = root.getAttribute('data-api').replace(/\/$/, '') + '/manage/comments';
  var list = root.querySelector('[data-moderate-list]');
  var status = root.querySelector('[data-moderate-status]');
  var chips = root.querySelectorAll('[data-status]');
  var posts = {};
  try { posts = JSON.parse(document.getElementById('moderate-posts').textContent); } catch (e) { /* no post map */ }
  var dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  var current = 'pending';

  var ACTIONS = {
    pending: [['approved', 'Approve', 'btn-primary'], ['rejected', 'Reject', 'btn-outline']],
    approved: [['rejected', 'Unpublish', 'btn-outline']],
    rejected: [['approved', 'Approve', 'btn-primary']]
  };

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

  function renderItem(c) {
    var li = el('li', 'moderate-item');
    var post = posts[c.slug];

    var meta = el('div', 'moderate-meta');
    meta.appendChild(el('strong', 'comment-author', c.name));
    if (c.email) {
      var mail = el('a', null, c.email);
      mail.href = 'mailto:' + c.email;
      meta.appendChild(mail);
    }
    meta.appendChild(el('time', 'comment-date', dateFmt.format(new Date(c.createdAt))));
    li.appendChild(meta);

    var on = el('p', 'moderate-post');
    on.appendChild(document.createTextNode('On '));
    if (post) {
      var link = el('a', null, post.title);
      link.href = post.url + '#comment-' + c.id;
      on.appendChild(link);
    } else {
      on.appendChild(el('code', null, c.slug));
    }
    li.appendChild(on);

    var body = el('div', 'comment-body');
    c.body.split(/\n{2,}/).forEach(function (para) { body.appendChild(el('p', null, para)); });
    li.appendChild(body);

    var actions = el('div', 'moderate-actions');
    var itemUrl = api + '/' + encodeURIComponent(c.slug) + '/' + encodeURIComponent(c.id);
    var buttons = [];

    function act(options, doneText) {
      buttons.forEach(function (b) { b.disabled = true; });
      request(itemUrl, options)
        .then(function () {
          li.remove();
          status.textContent = doneText;
          if (!list.children.length) status.textContent += ' Nothing else here.';
        })
        .catch(function (err) {
          status.textContent = err.message;
          buttons.forEach(function (b) { b.disabled = false; });
        });
    }

    ACTIONS[c.status].forEach(function (a) {
      var btn = el('button', 'btn ' + a[2], a[1]);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        act({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: a[0] })
        }, 'Comment by ' + c.name + ' ' + (a[0] === 'approved' ? 'approved.' : 'rejected.'));
      });
      buttons.push(btn);
      actions.appendChild(btn);
    });

    var del = el('button', 'btn btn-outline moderate-delete', 'Delete');
    del.type = 'button';
    del.addEventListener('click', function () {
      if (window.confirm('Delete this comment permanently?')) {
        act({ method: 'DELETE' }, 'Comment by ' + c.name + ' deleted.');
      }
    });
    buttons.push(del);
    actions.appendChild(del);

    li.appendChild(actions);
    return li;
  }

  function load(which) {
    current = which;
    chips.forEach(function (chip) {
      var on = chip.getAttribute('data-status') === which;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    list.textContent = '';
    status.textContent = 'Loading…';
    request(api + '?status=' + which, { headers: { Accept: 'application/json' } })
      .then(function (data) {
        if (which !== current) return;
        var comments = data.comments || [];
        comments.forEach(function (c) { list.appendChild(renderItem(c)); });
        status.textContent = comments.length
          ? comments.length + ' ' + which + ' comment' + (comments.length === 1 ? '' : 's') + '.'
          : 'No ' + which + ' comments.';
      })
      .catch(function (err) { status.textContent = err.message; });
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () { load(chip.getAttribute('data-status')); });
  });
  load('pending');
})();
