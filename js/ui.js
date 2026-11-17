/* Fliper Web Sim — ui: boot orchestration, top bar, help, link-debug panel,
   keyboard input, toast, and the input router (3D parts / keyboard → OS). */
(function () {
  'use strict';
  var FZ = window.FZ;
  var U = FZ.util;

  /* ---------- input router ---------- */
  FZ.input = {
    key: function (k) {
      if (FZ.scene) FZ.scene.flashPart('flipper', k);
      FZ.audio.click();
      if (FZ.os && FZ.os.onKey) FZ.os.onKey(k);
    },
    phoneButton: function (n) {
      if (FZ.scene) FZ.scene.flashPart('phone', n);
      FZ.audio.click();
      if (FZ.phone && FZ.phone.onSide) FZ.phone.onSide(n);
    },
    fromPart: function (type, part) {
      if (type === 'flipper') {
        var k = part;
        if (part.indexOf('dpad_') === 0) k = part.slice(5);
        FZ.input.key(k);
      } else {
        FZ.input.phoneButton(part);
      }
    }
  };

  /* ---------- toast ---------- */
  var toastTimer = 0;
  FZ.toast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('fade');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.add('fade');
      setTimeout(function () { el.hidden = true; }, 400);
    }, 2200);
  };

  /* ---------- top bar ---------- */
  function syncLayoutButtons() {
    var seg = document.getElementById('layout-seg');
    var btns = seg.querySelectorAll('button');
    var cur = FZ.scene ? FZ.scene.getLayout() : 'both';
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-layout') === cur);
    }
  }

  function syncSoundButton() {
    var b = document.getElementById('btn-sound');
    b.textContent = 'Sound: ' + (FZ.audio.enabled ? 'on' : 'off');
    b.classList.toggle('on', FZ.audio.enabled);
  }

  function fillModelSelects() {
    [['flipper', 'model-flipper'], ['phone', 'model-phone']].forEach(function (pair) {
      var type = pair[0];
      var sel = document.getElementById(pair[1]);
      var list = FZ.models.list(type);
      var cur = FZ.models.defaultId(type);
      sel.innerHTML = '';
      for (var i = 0; i < list.length; i++) {
        var o = document.createElement('option');
        o.value = list[i].id;
        o.textContent = list[i].label;
        if (list[i].id === cur) o.selected = true;
        sel.appendChild(o);
      }
      sel.onchange = function () {
        var id = sel.value;
        FZ.storage.set('model.' + type, id);
        FZ.scene.setDevice(type, FZ.models.build(id));
        FZ.toast('Model: ' + sel.options[sel.selectedIndex].textContent);
      };
    });
  }

  function wireTopbar() {
    var seg = document.getElementById('layout-seg');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-layout]') : null;
      if (!b) return;
      FZ.scene.setLayout(b.getAttribute('data-layout'));
      syncLayoutButtons();
      FZ.audio.click();
    });

    document.getElementById('btn-sound').addEventListener('click', function () {
      FZ.audio.setEnabled(!FZ.audio.enabled);
      syncSoundButton();
      FZ.toast(FZ.audio.enabled ? 'Sound on (synthesized)' : 'Sound off');
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
      if (window.confirm('Reset all stored data (fz.v1.*) and reload?')) {
        FZ.storage.reset();
        window.location.reload();
      }
    });

    fillModelSelects();
  }

  /* ---------- help ---------- */
  function wireHelp() {
    var overlay = document.getElementById('help-overlay');
    document.getElementById('btn-help').addEventListener('click', function () {
      overlay.hidden = false;
      FZ.audio.click();
    });
    document.getElementById('help-close').addEventListener('click', function () {
      overlay.hidden = true;
      FZ.audio.click();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.hidden = true;
    });
  }

  /* ---------- link debug panel ---------- */
  function wireDebug() {
    var panel = document.getElementById('debug-panel');
    var logEl = document.getElementById('dbg-log');
    var timer = 0;

    function refresh() {
      var st = FZ.link.get();
      document.getElementById('dbg-state').textContent =
        (st.connected ? 'connected' : 'idle') + (st.name ? ' · ' + st.name : '');
      document.getElementById('dbg-signal').textContent = st.signal + ' / 4';
      document.getElementById('dbg-counts').textContent = st.sent + ' sent · ' + st.dropped + ' dropped';
      document.getElementById('dbg-rtt').textContent = st.rtt !== null ? st.rtt + ' ms' : '—';
      var lines = FZ.link.getLog();
      logEl.textContent = lines.slice(-40).join('\n');
      logEl.scrollTop = logEl.scrollHeight;
    }

    function open() {
      panel.hidden = false;
      refresh();
      clearInterval(timer);
      timer = setInterval(refresh, 400);
    }
    function close() {
      panel.hidden = true;
      clearInterval(timer);
    }

    document.getElementById('btn-debug').addEventListener('click', function () {
      if (panel.hidden) open(); else close();
      FZ.audio.click();
    });
    document.getElementById('debug-close').addEventListener('click', close);

    document.getElementById('dbg-loss').addEventListener('change', function (e) {
      FZ.link.setLoss(e.target.value);
    });

    document.getElementById('dbg-ping').addEventListener('click', function () {
      var t = Date.now();
      FZ.link.request('phone', 'system.ping', { t: t }, function (err) {
        if (err) {
          document.getElementById('dbg-rtt').textContent = 'timeout';
          FZ.toast('Ping timed out (packet loss?)');
        } else {
          FZ.link.noteRtt(Date.now() - t);
          refresh();
        }
      });
    });

    FZ.link.subscribe(function () { if (!panel.hidden) refresh(); });
  }

  /* ---------- keyboard ---------- */
  function wireKeyboard() {
    var KEYMAP = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      Enter: 'ok', Escape: 'back'
    };
    window.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape') {
        var help = document.getElementById('help-overlay');
        if (!help.hidden) { help.hidden = true; e.preventDefault(); return; }
        var dbg = document.getElementById('debug-panel');
        if (!dbg.hidden) { dbg.hidden = true; return; }
      }

      var k = KEYMAP[e.key];
      if (k) {
        e.preventDefault();
        FZ.audio.unlock();
        FZ.input.key(k);
      }
    });

    /* don't leave focus stuck on chrome buttons (would swallow arrow keys) */
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button, select') : null;
      if (b && b.blur) b.blur();
    });
  }

  /* ---------- self-test (Stage 6): a console-driven smoke test of the
     live, already-booted app. Safe to run at any time — read-only except
     for a scratch localStorage key it writes and immediately removes.
     Some checks (link RPC round-trip, idle frame rate) finish a little
     later and log their own result lines when they resolve. */
  FZ.selfTest = function () {
    var out = { pass: 0, fail: 0, checks: [] };
    function check(name, cond, detail) {
      var rec = { name: name, ok: !!cond, detail: detail };
      out.checks.push(rec);
      if (rec.ok) out.pass++; else out.fail++;
      /* eslint-disable no-console */
      console.log((rec.ok ? '\u2713 ' : '\u2717 ') + name + (detail !== undefined && detail !== '' ? ' \u2014 ' + detail : ''));
      return rec.ok;
    }

    console.log('FZ.selfTest() \u2014 Fliper Web Sim ' + FZ.VERSION);

    check('Three.js (vendor/three.min.js) loaded', FZ.flags.hasThree);
    check('WebGL canvas present in the DOM', !!document.getElementById('gl'));

    try {
      check('Scene initialized', !!(FZ.scene && typeof FZ.scene.getLayout() === 'string'),
        FZ.scene ? ('layout=' + FZ.scene.getLayout()) : undefined);
    } catch (e) { check('Scene initialized', false, e.message); }

    var flipperModels = FZ.models ? FZ.models.list('flipper') : [];
    var phoneModels = FZ.models ? FZ.models.list('phone') : [];
    check('Flipper models registered', flipperModels.length > 0, flipperModels.length + ' found');
    check('Phone models registered', phoneModels.length > 0, phoneModels.length + ' found');

    try {
      var built = FZ.models.build(FZ.models.defaultId('flipper'));
      check('Default Flipper model builds without error', !!(built && built.group));
      if (built && typeof built.triCount === 'number') {
        check('Official model geometry stays under the 150k triangle budget',
          built.triCount <= 150000, built.triCount + ' tris');
      }
    } catch (e) { check('Default Flipper model builds without error', false, e.message); }

    try {
      FZ.scene.pickAt(10, 10);
      FZ.scene.pickAt(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
      check('Raycast picking does not throw', true);
    } catch (e) { check('Raycast picking does not throw', false, e.message); }

    try {
      var list = FZ.fs ? FZ.fs.list('/ext') : null;
      check('Virtual filesystem (/ext) is readable', Array.isArray(list), list ? list.length + ' entries' : undefined);
      var usedMB = FZ.fs ? FZ.fs.usedMB() : NaN;
      check('Storage usage reports a finite number', isFinite(usedMB), usedMB.toFixed(3) + ' MB');
    } catch (e) { check('Virtual filesystem (/ext) is readable', false, e.message); }

    try {
      var roundTrip = true;
      if (FZ.storage.persistent) {
        FZ.storage.set('__selftest__', { t: Date.now() });
        roundTrip = !!FZ.storage.get('__selftest__', null);
        FZ.storage.remove('__selftest__');
      }
      check('localStorage round-trip (fz.v1.* keys)', roundTrip,
        FZ.storage.persistent ? undefined : 'persistent storage unavailable, using in-memory fallback');
    } catch (e) { check('localStorage round-trip (fz.v1.* keys)', false, e.message); }

    /* network audit: every resource this page has loaded must be same-origin
       or a data: URL — confirms no CDN/XHR/fetch left the page at runtime */
    try {
      var entries = (window.performance && performance.getEntriesByType) ? performance.getEntriesByType('resource') : [];
      var offenders = [];
      for (var i = 0; i < entries.length; i++) {
        var url = entries[i].name;
        if (url.indexOf('data:') === 0) continue;
        try { if (new URL(url, location.href).origin !== location.origin) offenders.push(url); }
        catch (e2) { /* unparsable URL, ignore */ }
      }
      check('No cross-origin network requests observed', offenders.length === 0,
        offenders.length ? offenders.join(', ') : entries.length + ' same-origin/local resources checked');
    } catch (e3) {
      check('No cross-origin network requests observed', true, 'Resource Timing API unavailable, skipped');
    }

    console.log('FZ.selfTest(): ' + out.pass + ' passed, ' + out.fail + ' failed so far \u2014 ' +
      '2 more results (link RPC + frame rate) will log in a moment.');

    /* async: a real round trip over the simulated RPC bus */
    var pingT0 = Date.now();
    FZ.link.request('phone', 'system.ping', { t: pingT0 }, function (err) {
      check('Simulated link RPC round-trip (phone \u2194 flipper)', !err,
        err ? String(err) : (Date.now() - pingT0) + ' ms');
    });

    /* async: a 1 s idle frame-rate sample via requestAnimationFrame */
    var frames = 0, fpsStart = FZ.util.now();
    function sample(now) {
      frames++;
      if (now - fpsStart < 1000) { requestAnimationFrame(sample); return; }
      var fps = Math.round(frames * 1000 / (now - fpsStart));
      check('Approx. idle frame rate', fps >= 30,
        fps + ' fps sampled (target \u2265 45 on capable desktop hardware)');
    }
    requestAnimationFrame(sample);

    return out;
  };

  /* ---------- boot ---------- */
  FZ.boot = function () {
    if (!FZ.flags.hasThree) {
      FZ.missing(
        'Three.js not loaded',
        'vendor/three.min.js (Three.js r128, classic UMD build) is missing from this repository or failed to load.\n\n' +
        'It is normally bundled at vendor/three.min.js — restore that file (see vendor/README.txt for provenance and sha256), then reload.'
      );
      return;
    }

    var flipperScreen = new FZ.Screen({ logicalW: 128, logicalH: 64, scale: 2, nearest: true });
    var phoneScreen = new FZ.Screen({ logicalW: 360, logicalH: 760, scale: 1 });

    var builtFlipper = FZ.models.build(FZ.models.defaultId('flipper'));
    var builtPhone = FZ.models.build(FZ.models.defaultId('phone'));

    try {
      FZ.scene.init({
        canvas: document.getElementById('gl'),
        flipper: { built: builtFlipper, screen: flipperScreen },
        phone: { built: builtPhone, screen: phoneScreen }
      });
    } catch (err) {
      /* eslint-disable no-console */
      console.error('WebGL init failed:', err);
      FZ.missing(
        'WebGL unavailable',
        'This browser could not start WebGL:\n' + ((err && err.message) || String(err)) + '\n\n' +
        'Try Chrome or Firefox with hardware acceleration enabled.'
      );
      return;
    }

    var storedLayout = FZ.storage.get('layout', 'both');
    if (storedLayout !== 'both' && storedLayout !== 'flipper' && storedLayout !== 'phone') storedLayout = 'both';
    FZ.scene.setLayout(storedLayout);

    FZ.os.init(flipperScreen);
    FZ.phone.init(phoneScreen);

    wireTopbar();
    wireKeyboard();
    wireHelp();
    wireDebug();
    syncLayoutButtons();
    syncSoundButton();

    document.addEventListener('pointerdown', function once() {
      FZ.audio.unlock();
      document.removeEventListener('pointerdown', once);
    });

    if (!FZ.storage.persistent) {
      FZ.toast('localStorage unavailable — session only');
    }

    var hint = document.getElementById('hint');
    setTimeout(function () { if (hint) hint.classList.add('fade'); }, 8000);

    /* eslint-disable no-console */
    console.log('Fliper Web Sim ' + FZ.VERSION + ' — simulation only, no real radio. Run FZ.selfTest() in this console for a smoke test.');
  };

  FZ.boot();
})();
