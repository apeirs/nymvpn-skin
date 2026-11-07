// Noise Floor: board builder + packet tapes. MIT, apeir.
// ?static freezes the animation (used for the PNG renders).
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var STATIC = params.has('static');
  var only = params.get('theme'); // "light" | "dark" | null (both rows)

  // small deterministic PRNG so renders are repeatable
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  }

  // ── build rows ──────────────────────────────────────────────────────
  var tpl = document.getElementById('tpl');
  var rows = document.getElementById('rows');
  [['light', 'Light'], ['dark', 'Dark']].forEach(function (t) {
    if (only && only !== t[0]) return;
    var row = document.createElement('section');
    row.className = 'row t-' + t[0];
    row.innerHTML = '<p class="row-label">' + t[1] + ' theme</p><div class="screens"></div>';
    row.querySelector('.screens').appendChild(tpl.content.cloneNode(true));
    rows.appendChild(row);
  });

  // ── noise links: the dashed "signal" line from nym.com, used as hop links
  function noise(svg, seed, kind) {
    var r = rng(seed), x = 0, out = '';
    var cls = { on: 'var(--brand)', dim: 'var(--track)', warn: 'var(--warn)', board: '#0a0a0a' }[kind] || 'var(--brand)';
    while (x < 100) {
      var w = 1.5 + r() * (kind === 'board' ? 2.2 : 9);
      var h = kind === 'board' ? (r() < 0.25 ? 4 : 2) : (r() < 0.3 ? 4 : 2.4);
      out += '<rect x="' + x.toFixed(2) + '" y="' + (5 - h / 2) + '" width="' + Math.min(w, 100 - x).toFixed(2) + '" height="' + h + '" fill="' + cls + '"/>';
      x += w + 0.6 + r() * (kind === 'board' ? 0.9 : 4);
    }
    svg.innerHTML = out;
  }
  var n = 0;
  document.querySelectorAll('.link').forEach(function (l) { noise(l.querySelector('svg'), 11 + n++ * 7, l.dataset.link); });
  document.querySelectorAll('[data-noise]').forEach(function (s) { noise(s, 5, 'board'); });

  // ── packet tapes ────────────────────────────────────────────────────
  // you:      real packets (tall, brand) mixed with cover (short, grey) at 1:ratio
  // observer: what someone on the wire sees: identical bars, steady rate
  // bursty:   no cover: activity shows up as bursts and silences
  var BARS = 64;
  function seq(kind, r, ratio) {
    var a = [];
    if (kind === 'observer') { for (var i = 0; i < BARS; i++) a.push('o'); return a; }
    if (kind === 'bursty') {
      while (a.length < BARS) {
        var on = 2 + Math.floor(r() * 7), off = 2 + Math.floor(r() * 8);
        for (var j = 0; j < on; j++) a.push('b');
        for (j = 0; j < off; j++) a.push('gap');
      }
      return a.slice(0, BARS);
    }
    var p = 1 / (1 + ratio);
    for (i = 0; i < BARS; i++) a.push(r() < p * 1.4 ? 'r' : 'c');
    return a;
  }
  function paint(el, arr) {
    el.innerHTML = arr.map(function (c) { return c === 'r' ? '<i></i>' : '<i class="' + c + '"></i>'; }).join('');
  }
  var tapes = [];
  document.querySelectorAll('[data-tape]').forEach(function (el, k) {
    var r = rng(+el.dataset.seed || 99 + k * 13);
    var kind = el.dataset.tape, ratio = +el.dataset.ratio || 5;
    var arr = seq(kind, r, ratio);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', {
      you: 'Your packets: about one real packet for every ' + ratio + ' cover packets',
      observer: 'Observer view: a steady stream of identical packets',
      bursty: 'Observer view without cover: bursts of activity and silences'
    }[kind]);
    paint(el, arr);
    tapes.push({ el: el, arr: arr, r: r, kind: kind, ratio: ratio });
  });

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!STATIC && !reduce) {
    setInterval(function () {
      tapes.forEach(function (t) {
        if (t.kind === 'observer') return;
        t.arr.pop();
        if (t.kind === 'bursty') t.arr.unshift(t.r() < (t.arr[0] === 'b' ? 0.7 : 0.3) ? 'b' : 'gap');
        else t.arr.unshift(t.r() < 1.4 / (1 + t.ratio) ? 'r' : 'c');
        paint(t.el, t.arr);
      });
    }, 140);
  }
  document.documentElement.dataset.ready = '1';
})();
