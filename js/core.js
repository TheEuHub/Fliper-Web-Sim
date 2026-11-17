/* Fliper Web Sim — core: namespace, flags, storage, utils. */
(function () {
  'use strict';

  var FZ = (window.FZ = window.FZ || {});
  FZ.VERSION = '1.0.0';

  /* ---------- flags ---------- */
  var reduced = false;
  try {
    reduced = !!(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch (e) {
    reduced = false;
  }

  FZ.flags = {
    calibrate: /[?&]calibrate(?:=1|&|$)/.test(window.location.search),
    reducedMotion: reduced,
    hasThree: typeof window.THREE !== 'undefined',
    mobile:
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 820)
  };

  /* ---------- storage: localStorage → try/catch → memory fallback ---------- */
  var mem = Object.create(null);
  var lsOK = false;
  try {
    var probe = 'fz.v1.probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    lsOK = true;
  } catch (e) {
    lsOK = false;
  }

  var PREFIX = 'fz.v1.';

  FZ.storage = {
    persistent: lsOK,
    get: function (key, def) {
      var k = PREFIX + key,
        raw = null;
      try {
        raw = Object.prototype.hasOwnProperty.call(mem, k)
          ? mem[k]
          : lsOK
            ? window.localStorage.getItem(k)
            : null;
      } catch (e) {
        raw = null;
      }
      if (raw === null || raw === undefined) return def;
      try {
        return JSON.parse(raw);
      } catch (e2) {
        return def;
      }
    },
    set: function (key, val) {
      var k = PREFIX + key,
        raw;
      try {
        raw = JSON.stringify(val);
      } catch (e) {
        return;
      }
      mem[k] = raw;
      try {
        if (lsOK) window.localStorage.setItem(k, raw);
        else mem[k] = raw;
      } catch (e2) {
        this.persistent = false;
      }
    },
    remove: function (key) {
      var k = PREFIX + key;
      try {
        if (lsOK) window.localStorage.removeItem(k);
      } catch (e) {}
      delete mem[k];
    },
    reset: function () {
      try {
        if (lsOK) {
          var doomed = [];
          for (var i = 0; i < window.localStorage.length; i++) {
            var kk = window.localStorage.key(i);
            if (kk && kk.indexOf(PREFIX) === 0) doomed.push(kk);
          }
          for (var j = 0; j < doomed.length; j++) window.localStorage.removeItem(doomed[j]);
        }
      } catch (e) {}
      for (var m in mem) {
        if (Object.prototype.hasOwnProperty.call(mem, m) && m.indexOf(PREFIX) === 0) delete mem[m];
      }
    }
  };

  /* ---------- utils ---------- */
  FZ.util = {
    clamp: function (v, a, b) {
      return v < a ? a : v > b ? b : v;
    },
    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },
    easeOutCubic: function (t) {
      t = 1 - t;
      return 1 - t * t * t;
    },
    easeInOutCubic: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    rand: function (a, b) {
      return a + Math.random() * (b - a);
    },
    randInt: function (a, b) {
      return Math.floor(a + Math.random() * (b - a + 1));
    },
    pad2: function (n) {
      n = Math.floor(n);
      return (n < 10 ? '0' : '') + n;
    },
    formatMB: function (mb) {
      if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
      return Math.round(mb * 10) / 10 + ' MB';
    },
    now: function () {
      return window.performance && performance.now ? performance.now() : Date.now();
    }
  };

  FZ.events = new EventTarget();
  FZ.emit = function (kind, detail) {
    FZ.events.dispatchEvent(new CustomEvent(kind, { detail: detail }));
  };
  FZ.note = function (text) {
    FZ.emit('activity', String(text));
  };

  /* ---------- full-screen missing-dependency banner ---------- */
  FZ.missing = function (title, detail) {
    var box = document.getElementById('missing');
    if (!box) return;
    document.getElementById('missing-title').textContent = title || 'Missing dependency';
    document.getElementById('missing-detail').textContent = detail || '';
    box.hidden = false;
  };
})();
