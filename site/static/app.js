(function () {
  'use strict';
  var root = document.body.getAttribute('data-root') || '/';
  var KEY = 'jyfk:';

  // ------------------------------------------------------------ storage
  function load(k, d) {
    try { var v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function list(k) { var v = load(k, []); return Array.isArray(v) ? v.filter(function (s) { return typeof s === 'string'; }) : []; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastEl = document.getElementById('toast'), toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------ game index
  var gamesP = null;
  function games() {
    if (!gamesP) {
      gamesP = fetch(root + 'games.json').then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    }
    return gamesP;
  }
  function gameUrl(g) { return root + 'games/' + g.slug + '/'; }
  function cardHtml(g) {
    return '<a class="card" href="' + esc(gameUrl(g)) + '"><span class="thumb"><img src="' + esc(root + g.thumb) +
      '" alt="' + esc(g.title) + '" loading="lazy" decoding="async" width="640" height="360"></span><span class="meta"><span class="t">' +
      esc(g.title) + '</span><span class="s">' + esc(g.short) + '</span><span class="badge">' + esc(g.cat) + '</span></span></a>';
  }
  function score(g, terms) {
    var t = g.title.toLowerCase(), tags = (g.tags || []).join(' ').toLowerCase();
    var rest = (g.short + ' ' + g.category + ' ' + g.cat).toLowerCase();
    var s = 0;
    for (var i = 0; i < terms.length; i++) {
      var w = terms[i];
      if (t.indexOf(w) === 0) s += 6; else if (t.indexOf(w) !== -1) s += 4;
      else if (tags.indexOf(w) !== -1) s += 3;
      else if (rest.indexOf(w) !== -1) s += 1;
      else return 0;
    }
    return s;
  }
  function search(all, q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return all.map(function (g) { return { g: g, s: score(g, terms) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.g.title.localeCompare(b.g.title); })
      .map(function (x) { return x.g; });
  }

  // ------------------------------------------------------------ header search suggestions
  var q = document.getElementById('q'), sugg = document.getElementById('sugg');
  if (q && sugg) {
    var sel = -1;
    var render = function () {
      var term = q.value.trim();
      if (!term) { sugg.hidden = true; return; }
      games().then(function (all) {
        if (q.value.trim() !== term) return;
        var res = search(all, term).slice(0, 6);
        sel = -1;
        sugg.innerHTML = res.length ? res.map(function (g) {
          return '<a role="option" href="' + esc(gameUrl(g)) + '"><img src="' + esc(root + g.thumb) + '" alt="" width="64" height="36"><span>' +
            esc(g.title) + '<small>' + esc(g.cat) + '</small></span></a>';
        }).join('') + '<a class="all" href="' + esc(root + 'search/?q=' + encodeURIComponent(term)) + '">See all results</a>'
          : '<div class="none">No games match “' + esc(term) + '”.</div>';
        sugg.hidden = false;
      });
    };
    q.addEventListener('input', render);
    q.addEventListener('focus', render);
    q.addEventListener('keydown', function (ev) {
      var items = sugg.querySelectorAll('a');
      if (ev.key === 'Escape') { sugg.hidden = true; return; }
      if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && items.length && !sugg.hidden) {
        ev.preventDefault();
        sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (a, i) { a.classList.toggle('on', i === sel); });
      } else if (ev.key === 'Enter' && sel >= 0 && items[sel] && !sugg.hidden) {
        ev.preventDefault();
        location.href = items[sel].href;
      }
    });
    document.addEventListener('click', function (ev) { if (!sugg.contains(ev.target) && ev.target !== q) sugg.hidden = true; });
  }

  // ------------------------------------------------------------ search page
  var q2 = document.getElementById('q2'), sres = document.getElementById('sres');
  if (q2 && sres) {
    var info = document.getElementById('sres-info');
    var initial = new URLSearchParams(location.search).get('q') || '';
    q2.value = initial;
    if (q) q.value = initial;
    var run = function () {
      var term = q2.value.trim();
      games().then(function (all) {
        var res = term ? search(all, term) : all;
        sres.innerHTML = res.map(cardHtml).join('');
        info.textContent = term ? (res.length ? res.length + (res.length === 1 ? ' game' : ' games') + ' found for “' + term + '”.'
          : 'No games match “' + term + '”. Try a shorter word, or browse all games below.') : 'All ' + all.length + ' games.';
        if (term && !res.length) sres.innerHTML = all.slice(0, 8).map(cardHtml).join('');
      });
    };
    q2.addEventListener('input', function () {
      try { history.replaceState(null, '', location.pathname + (q2.value.trim() ? '?q=' + encodeURIComponent(q2.value.trim()) : '')); } catch (e) {}
      run();
    });
    q2.form.addEventListener('submit', function (ev) { ev.preventDefault(); run(); });
    run();
    if (!initial) q2.focus();
  }

  // ------------------------------------------------------------ home: today's pick, recent, favorites
  var pick = document.getElementById('pick');
  var rows = document.querySelectorAll('[data-list]');
  if (pick || rows.length) {
    games().then(function (all) {
      if (!all.length) return;
      var bySlug = {};
      all.forEach(function (g) { bySlug[g.slug] = g; });
      if (pick) {
        var d = new Date();
        var day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
        var sorted = all.slice().sort(function (a, b) { return a.slug < b.slug ? -1 : 1; });
        var g = sorted[(day * 7 + 3) % sorted.length];
        pick.href = gameUrl(g);
        var img = document.getElementById('pick-img');
        img.src = root + g.thumb; img.alt = g.title;
        document.getElementById('pick-t').textContent = g.title;
        document.getElementById('pick-s').textContent = g.short;
      }
      rows.forEach(function (row) {
        var items = list(row.getAttribute('data-list')).map(function (s) { return bySlug[s]; }).filter(Boolean).slice(0, 12);
        if (!items.length) return;
        row.innerHTML = items.map(cardHtml).join('');
        row.parentNode.hidden = false;
      });
    });
  }

  // ------------------------------------------------------------ game page
  var game = document.getElementById('game');
  if (game) {
    var slug = game.getAttribute('data-slug');
    var recent = list('recent').filter(function (s) { return s !== slug; });
    recent.unshift(slug);
    save('recent', recent.slice(0, 24));

    var favBtn = document.getElementById('favbtn');
    var paintFav = function () {
      var on = list('favs').indexOf(slug) !== -1;
      favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      favBtn.querySelector('.heart').textContent = on ? '♥' : '♡';
      favBtn.querySelector('.lbl').textContent = on ? 'Saved' : 'Favorite';
    };
    if (favBtn) {
      paintFav();
      favBtn.addEventListener('click', function () {
        var f = list('favs'), i = f.indexOf(slug);
        if (i === -1) { f.unshift(slug); toast('Saved to your favorites on the home page'); }
        else { f.splice(i, 1); toast('Removed from favorites'); }
        save('favs', f.slice(0, 60));
        paintFav();
      });
    }

    var shareBtn = document.getElementById('sharebtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        var canon = document.querySelector('link[rel=canonical]');
        var url = location.protocol.indexOf('http') === 0 ? location.href.split('#')[0].split('?')[0] : (canon ? canon.href : location.href);
        var title = document.title;
        if (navigator.share) {
          navigator.share({ title: title, url: url }).catch(function () {});
          return;
        }
        var done = function () { toast('Link copied. Paste it anywhere to share.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () { toast(url); });
        } else { toast(url); }
      });
    }

    var frame = document.getElementById('frame');
    var iframe = document.getElementById('gameframe');
    var fsBtn = document.getElementById('fsbtn');
    var fsExit = document.getElementById('fsexit');
    var focusGame = function () { try { iframe.focus(); iframe.contentWindow.focus(); } catch (e) {} };
    var fakeOn = function (on) {
      frame.classList.toggle('fake-fs', on);
      document.body.classList.toggle('fs-lock', on);
      fsExit.hidden = !on;
      setTimeout(focusGame, 100);
    };
    if (fsBtn && frame) {
      fsBtn.addEventListener('click', function () {
        var req = frame.requestFullscreen || frame.webkitRequestFullscreen;
        if (req) {
          var p;
          try { p = req.call(frame); } catch (e) { p = null; }
          var after = function () {
            if (game.getAttribute('data-orient') === 'landscape' && screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(function () {});
            }
            focusGame();
          };
          if (p && p.then) p.then(after, function () { fakeOn(true); }); else after();
        } else {
          fakeOn(true);
        }
      });
      fsExit.addEventListener('click', function () { fakeOn(false); });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && frame.classList.contains('fake-fs')) fakeOn(false); });
    }
    if (iframe) {
      iframe.addEventListener('load', function () { try { iframe.contentWindow.focus({ preventScroll: true }); } catch (e) {} });
    }
  }
})();
