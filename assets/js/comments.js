/* ==========================================================================
   Article comments — loads and posts comments via the site's /api functions
   (Azure Static Web Apps + Cosmos DB). All reader text is inserted with
   textContent, never as HTML.
   ========================================================================== */
(function () {
  'use strict';

  var section = document.querySelector('[data-comments]');
  if (!section || !window.fetch) return;

  var endpoint = section.getAttribute('data-api').replace(/\/$/, '') +
    '/comments/' + encodeURIComponent(section.getAttribute('data-slug'));
  var list = section.querySelector('[data-comment-list]');
  var listStatus = section.querySelector('[data-comments-status]');
  var form = section.querySelector('[data-comment-form]');
  var formStatus = section.querySelector('[data-comment-form-status]');
  var submitBtn = form.querySelector('button[type="submit"]');
  var countLabel = document.querySelector('[data-comment-count]');
  var field = function (name) { return form.elements.namedItem(name); };
  var dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  /* ---------- Rendering ------------------------------------------------- */
  function renderComment(c) {
    var li = document.createElement('li');
    li.className = 'comment';
    li.id = 'comment-' + c.id;

    var avatar = document.createElement('span');
    avatar.className = 'comment-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = (c.name.trim().charAt(0) || '?').toUpperCase();

    var head = document.createElement('div');
    head.className = 'comment-head';
    var name = document.createElement('span');
    name.className = 'comment-author';
    name.textContent = c.name;
    var time = document.createElement('time');
    time.className = 'comment-date';
    time.dateTime = c.createdAt;
    time.textContent = dateFmt.format(new Date(c.createdAt));
    head.appendChild(name);
    head.appendChild(time);

    var body = document.createElement('div');
    body.className = 'comment-body';
    c.body.split(/\n{2,}/).forEach(function (para) {
      var p = document.createElement('p');
      p.textContent = para;
      body.appendChild(p);
    });

    var main = document.createElement('div');
    main.className = 'comment-main';
    main.appendChild(head);
    main.appendChild(body);
    li.appendChild(avatar);
    li.appendChild(main);
    return li;
  }

  // Keeps the empty-state message and the byline's comment count in step with the list.
  function showEmptyState() {
    var count = list.children.length;
    listStatus.textContent = count ? '' : 'No comments yet. Be the first.';
    if (countLabel) countLabel.textContent = count ? count + (count === 1 ? ' comment' : ' comments') : 'Comments';
  }

  /* ---------- Load approved comments ------------------------------------ */
  fetch(endpoint, { headers: { Accept: 'application/json' } })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      list.textContent = '';
      (data.comments || []).forEach(function (c) { list.appendChild(renderComment(c)); });
      showEmptyState();
      // Honour #comment-<id> links once the comments exist.
      if (/^#comment-/.test(window.location.hash)) {
        var target = document.getElementById(window.location.hash.slice(1));
        if (target) target.scrollIntoView();
      }
    })
    .catch(function () {
      listStatus.textContent = 'Comments could not be loaded right now.';
    });

  /* ---------- Remember name and email for next time --------------------- */
  try {
    var saved = JSON.parse(localStorage.getItem('commenter') || '{}');
    if (saved.name) field('name').value = saved.name;
    if (saved.email) field('email').value = saved.email;
  } catch (e) { /* storage unavailable */ }

  /* ---------- Post a comment -------------------------------------------- */
  function say(message, focusEl) {
    formStatus.textContent = message;
    if (focusEl) focusEl.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var tokenInput = field('cf-turnstile-response');
    var payload = {
      name: field('name').value.trim(),
      email: field('email').value.trim(),
      body: field('body').value.trim(),
      website: field('website').value,
      token: tokenInput ? tokenInput.value : ''
    };

    if (!payload.name) return say('Please add your name.', field('name'));
    if (payload.email && !field('email').checkValidity()) return say('Please check your email address, or leave it empty.', field('email'));
    if (payload.body.length < 2) return say('Please write a comment first.', field('body'));
    if (!payload.token) return say('Please wait for the spam check to finish, then try again.');

    submitBtn.disabled = true;
    say('Posting…');

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
          return data;
        });
      })
      .then(function (data) {
        field('body').value = '';
        try {
          localStorage.setItem('commenter', JSON.stringify({ name: payload.name, email: payload.email }));
        } catch (err) { /* storage unavailable */ }
        if (data.status === 'approved' && data.comment) {
          list.appendChild(renderComment(data.comment));
          showEmptyState();
          say('Thanks! Your comment is live.');
        } else {
          say('Thanks! Your comment will appear once it has been reviewed.');
        }
      })
      .catch(function (err) {
        say(err.message || 'Something went wrong. Please try again.');
      })
      .then(function () {
        submitBtn.disabled = false;
        if (window.turnstile) window.turnstile.reset();
      });
  });
})();
