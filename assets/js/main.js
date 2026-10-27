/* ==========================================================================
   The Intelligence Stack — site behaviour (no dependencies)
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme toggle ---------------------------------------------- */
  var themeBtn = document.querySelector('.theme-toggle');

  function currentTheme() {
    return root.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function labelThemeButton() {
    if (!themeBtn) return;
    var label = currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    themeBtn.setAttribute('aria-label', label);
    themeBtn.setAttribute('title', label);
  }

  if (themeBtn) {
    labelThemeButton();
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
      labelThemeButton();
    });
  }

  /* ---------- Admin-only header link ------------------------------------ */
  // Azure Static Web Apps reports the signed-in user at /.auth/me. Readers are
  // never signed in, so the link stays hidden for them. This only hides the
  // link; /admin/ itself is protected by staticwebapp.config.json.
  // The footer's "Admin sign-in" link is hidden again once an admin is signed in.
  var adminLinks = document.querySelectorAll('[data-admin-only]');
  var signInLinks = document.querySelectorAll('[data-admin-signin]');
  if ((adminLinks.length || signInLinks.length) && window.fetch) {
    fetch('/.auth/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var roles = (data && data.clientPrincipal && data.clientPrincipal.userRoles) || [];
        if (roles.indexOf('admin') === -1) return;
        adminLinks.forEach(function (link) { link.hidden = false; });
        signInLinks.forEach(function (link) { link.hidden = true; });
      })
      .catch(function () { /* not on Static Web Apps, e.g. local preview */ });
  }

  /* ---------- Home page: line the logo up with the hero headline -------- */
  // The headline is shifted left in CSS; measuring keeps the logo aligned at
  // every screen width. It never goes closer than 8px to the screen edge.
  var brand = document.querySelector('.layout-home .brand');
  var heroCopy = document.querySelector('.layout-home .hero-copy');
  if (brand && heroCopy) {
    var alignBrand = function () {
      brand.style.transform = '';
      var brandLeft = brand.getBoundingClientRect().left;
      var shift = Math.max(heroCopy.getBoundingClientRect().left - brandLeft, 8 - brandLeft);
      if (Math.abs(shift) >= 1) brand.style.transform = 'translateX(' + Math.round(shift) + 'px)';
    };
    alignBrand();
    window.addEventListener('resize', alignBrand);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignBrand);
  }

  /* ---------- Mobile navigation ----------------------------------------- */
  var navToggle = document.querySelector('.nav-toggle');
  if (navToggle) {
    var setNav = function (open) {
      document.body.classList.toggle('nav-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    navToggle.addEventListener('click', function () {
      setNav(!document.body.classList.contains('nav-open'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        setNav(false);
        navToggle.focus();
      }
    });
    window.matchMedia('(min-width: 1100px)').addEventListener('change', function (mq) {
      if (mq.matches) setNav(false);
    });
  }

  /* ---------- "/" focuses search ---------------------------------------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement;
    if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
    e.preventDefault();
    var input = document.getElementById('search-input');
    if (input) { input.focus(); return; }
    var link = document.querySelector('[data-search-link]');
    if (link) window.location.href = link.href;
  });

  /* ---------- Clipboard helper ------------------------------------------ */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (err) { reject(err); }
      document.body.removeChild(ta);
    });
  }

  function flash(btn, doneLabel, resetLabel) {
    btn.classList.add('is-done');
    if (doneLabel !== undefined) btn.lastChild.textContent = doneLabel;
    setTimeout(function () {
      btn.classList.remove('is-done');
      if (resetLabel !== undefined) btn.lastChild.textContent = resetLabel;
    }, 1600);
  }

  /* ---------- Share: copy link ------------------------------------------ */
  document.querySelectorAll('[data-copy-link]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyText(btn.getAttribute('data-copy-link')).then(function () {
        flash(btn);
        btn.setAttribute('aria-label', 'Link copied');
        setTimeout(function () { btn.setAttribute('aria-label', 'Copy link'); }, 1600);
      });
    });
  });

  var proses = document.querySelectorAll('.prose');
  var postBody = document.querySelector('.post .prose');

  /* ---------- Tables: horizontal scroll wrapper ------------------------- */
  proses.forEach(function (prose) {
    prose.querySelectorAll('table').forEach(function (table) {
      if (table.parentElement.classList.contains('table-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  });

  /* ---------- Code blocks: language label + copy button ----------------- */
  document.querySelectorAll('.prose div.highlighter-rouge, .prose figure.highlight').forEach(function (block) {
    var pre = block.querySelector('pre');
    if (!pre || block.querySelector('.code-toolbar')) return;

    var bar = document.createElement('div');
    bar.className = 'code-toolbar';

    var match = block.className.match(/language-([\w+#-]+)/);
    if (!match) {
      var code = block.querySelector('code[data-lang]');
      if (code) match = [null, code.getAttribute('data-lang')];
    }
    if (match && match[1] !== 'plaintext' && match[1] !== 'text') {
      var lang = document.createElement('span');
      lang.className = 'code-lang';
      lang.textContent = match[1];
      bar.appendChild(lang);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
    btn.addEventListener('click', function () {
      var codeEl = pre.querySelector('code') || pre;
      copyText(codeEl.innerText.replace(/\n$/, '')).then(function () {
        flash(btn, 'Copied', 'Copy');
      });
    });
    bar.appendChild(btn);
    block.insertBefore(bar, block.firstChild);
  });

  /* ---------- Heading anchors ------------------------------------------ */
  if (postBody) {
    postBody.querySelectorAll('h2[id], h3[id]').forEach(function (h) {
      var anchor = document.createElement('a');
      anchor.className = 'heading-anchor';
      anchor.href = '#' + h.id;
      anchor.setAttribute('aria-label', 'Link to section: ' + h.textContent);
      anchor.textContent = '#';
      h.appendChild(anchor);
    });
  }

  /* ---------- Reading progress bar -------------------------------------- */
  var progressBar = document.querySelector('.reading-progress span');
  if (postBody && progressBar) {
    var ticking = false;
    var onScroll = function () {
      ticking = false;
      var viewportH = window.innerHeight;
      var rect = postBody.getBoundingClientRect();
      var total = rect.height - viewportH * 0.6;
      var progress = total > 0 ? (viewportH * 0.4 - rect.top) / total : 1;
      progressBar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, progress)) + ')';
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
    }, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ---------- Article view count (GoatCounter) -------------------------- */
  // GoatCounter's count.js records the visit; this reads the page's total from
  // its public counter API. Totals are cached by GoatCounter for up to 4 hours.
  // Pages with no recorded views yet return 404, and the counter stays hidden.
  var viewCount = document.querySelector('[data-view-count]');
  if (viewCount && window.fetch) {
    var counterUrl = viewCount.getAttribute('data-view-count') + '/counter/' +
      encodeURIComponent(window.location.pathname) + '.json';
    fetch(counterUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var count = String(data && data.count != null ? data.count : '').trim();
        if (!count) return;
        viewCount.querySelector('[data-view-count-value]').textContent =
          count + (count === '1' ? ' view' : ' views');
        viewCount.hidden = false;
      })
      .catch(function () { /* no views recorded yet, or counter not enabled */ });
  }

  /* ---------- Lightbox for diagrams and images -------------------------- */
  var zoomables = [];
  proses.forEach(function (prose) {
    prose.querySelectorAll('img').forEach(function (img) {
      if (!img.closest('a')) zoomables.push(img);
    });
  });

  if (zoomables.length && typeof HTMLDialogElement === 'function') {
    var dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Image viewer');
    dlg.innerHTML =
      '<div class="lightbox-toolbar">' +
        '<span class="lightbox-caption"></span>' +
        '<button type="button" class="lightbox-btn" data-action="zoom">Actual size</button>' +
        '<a class="lightbox-btn" data-action="open" target="_blank" rel="noopener">Open original</a>' +
        '<button type="button" class="lightbox-btn lightbox-close" data-action="close" aria-label="Close">' +
          '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="lightbox-stage"><img alt=""></div>';
    document.body.appendChild(dlg);

    var stage = dlg.querySelector('.lightbox-stage');
    var bigImg = stage.querySelector('img');
    var caption = dlg.querySelector('.lightbox-caption');
    var zoomBtn = dlg.querySelector('[data-action="zoom"]');
    var openLink = dlg.querySelector('[data-action="open"]');
    var lastTrigger = null;

    var setActual = function (on, clientX, clientY) {
      var rect = bigImg.getBoundingClientRect();
      var rx = clientX !== undefined ? (clientX - rect.left) / rect.width : 0.5;
      var ry = clientY !== undefined ? (clientY - rect.top) / rect.height : 0.5;
      stage.classList.toggle('is-actual', on);
      zoomBtn.textContent = on ? 'Fit to screen' : 'Actual size';
      if (on) {
        stage.scrollLeft = rx * bigImg.naturalWidth - stage.clientWidth / 2;
        stage.scrollTop = ry * bigImg.naturalHeight - stage.clientHeight / 2;
      }
    };

    var openLightbox = function (img) {
      lastTrigger = img;
      var src = img.currentSrc || img.src;
      bigImg.src = src;
      bigImg.alt = img.alt || '';
      openLink.href = src;
      var fig = img.closest('figure');
      var cap = fig && fig.querySelector('figcaption');
      caption.textContent = (cap && cap.textContent.trim()) || img.alt || '';
      setActual(false);
      document.body.style.overflow = 'hidden';
      dlg.showModal();
    };

    dlg.addEventListener('close', function () {
      document.body.style.overflow = '';
      if (lastTrigger) lastTrigger.focus({ preventScroll: true });
    });

    zoomBtn.addEventListener('click', function () {
      setActual(!stage.classList.contains('is-actual'));
    });
    dlg.querySelector('[data-action="close"]').addEventListener('click', function () { dlg.close(); });

    // Click the image to toggle actual size; click the empty stage to close.
    // In actual-size mode, drag to pan.
    var drag = null;
    stage.addEventListener('pointerdown', function (e) {
      if (!stage.classList.contains('is-actual') || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; stage.classList.add('is-dragging'); }
      stage.scrollLeft = drag.left - dx;
      stage.scrollTop = drag.top - dy;
    });
    var endDrag = function () { stage.classList.remove('is-dragging'); };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', function () { drag = null; endDrag(); });

    stage.addEventListener('click', function (e) {
      var wasDrag = drag && drag.moved;
      drag = null;
      if (wasDrag) return;
      if (e.target === bigImg) setActual(!stage.classList.contains('is-actual'), e.clientX, e.clientY);
      else if (!stage.classList.contains('is-actual')) dlg.close();
    });

    zoomables.forEach(function (img) {
      img.classList.add('zoomable');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'Enlarge image' + (img.alt ? ': ' + img.alt : ''));
      img.addEventListener('click', function () { openLightbox(img); });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(img); }
      });
    });
  }

  /* ---------- Blog page: filter by topic -------------------------------- */
  var filterBar = document.querySelector('[data-filter-bar]');
  if (filterBar) {
    var chips = filterBar.querySelectorAll('[data-filter]');
    var cards = document.querySelectorAll('#post-grid [data-topic]');
    var empty = document.querySelector('[data-filter-empty]');

    var applyFilter = function (filter) {
      var shown = 0;
      chips.forEach(function (chip) {
        var on = chip.getAttribute('data-filter') === filter;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', String(on));
      });
      cards.forEach(function (card) {
        var show = filter === 'all' || card.getAttribute('data-topic') === filter;
        card.hidden = !show;
        if (show) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    };

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var filter = chip.getAttribute('data-filter');
        applyFilter(filter);
        var url = new URL(window.location.href);
        if (filter === 'all') url.searchParams.delete('topic');
        else url.searchParams.set('topic', filter);
        history.replaceState(null, '', url);
      });
    });

    var initial = new URLSearchParams(window.location.search).get('topic');
    if (initial) {
      chips.forEach(function (chip) {
        if (chip.getAttribute('data-filter') === initial) applyFilter(initial);
      });
    }
  }

  if (reduceMotion) root.style.scrollBehavior = 'auto';
})();
