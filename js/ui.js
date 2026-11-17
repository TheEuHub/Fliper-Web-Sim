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
    console.log('Fliper Web Sim ' + FZ.VERSION + ' — simulation only, no real radio. FZ.selfTest() arrives in Stage 6.');
  };

  FZ.boot();
})();
