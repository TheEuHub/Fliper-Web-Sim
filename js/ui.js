/* Desktop shell. Pairing shortcuts use the same companion client as phone taps. */
(function (FZ) {
  'use strict';
  var $ = function (id) {
      return document.getElementById(id);
    },
    modal = $('modal'),
    body = $('dialog-body'),
    lastFocus,
    dialogTimer = 0,
    noticeTimer = 0,
    actionBusy = false,
    cal,
    debugOpen = false;
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function icon(name) {
    var i = el('i');
    i.dataset.icon = name;
    return i;
  }
  function btn(label, fn, cls, id, ic) {
    var b = el('button', cls || 'outline');
    if (id) b.id = id;
    if (ic) b.appendChild(icon(ic));
    b.appendChild(el('span', '', label));
    b.onclick = fn;
    return b;
  }
  function row(parent, a, b) {
    var e = el('div', 'line');
    e.appendChild(el('span', '', a));
    var val = el('small', '', b);
    e.appendChild(val);
    parent.appendChild(e);
    return val;
  }
  function notify(s) {
    clearTimeout(noticeTimer);
    $('toast').textContent = s;
    $('toast').hidden = false;
    noticeTimer = setTimeout(function () {
      $('toast').hidden = true;
    }, 2600);
  }
  FZ.toast = notify;
  function activity(s) {
    var e = el('li');
    e.appendChild(el('time', '', new Date().toTimeString().slice(0, 8)));
    e.appendChild(el('span', '', s));
    var l = $('activity');
    l.insertBefore(e, l.firstChild);
    while (l.childElementCount > 28) l.lastElementChild.remove();
  }
  function close() {
    if (modal.hidden) return;
    clearInterval(dialogTimer);
    debugOpen = false;
    modal.hidden = true;
    body.textContent = '';
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }
  function dialog(title) {
    if (modal.hidden) lastFocus = document.activeElement;
    debugOpen = false;
    clearInterval(dialogTimer);
    body.textContent = '';
    $('modal-title').textContent = title;
    modal.hidden = false;
    $('modal-close').focus({ preventScroll: true });
    return body;
  }
  function help() {
    dialog('Controls');
    body.appendChild(
      el(
        'p',
        '',
        'The desk and both devices are interactive. Focus a device for a closer view, or use the Flipper’s keyboard controls from any camera angle.'
      )
    );
    [
      ['Orbit the desk', 'Drag empty space'],
      ['Lift & rotate a device', 'Drag its body'],
      ['Zoom', 'Scroll / pinch'],
      ['Reset current view', 'Double-click / tap'],
      ['Navigate Flipper', '↑ ↓ ← →'],
      ['Select / go back', 'Enter / Esc'],
      ['Archive / Settings from home', '↓ / →'],
      ['Phone app', 'Tap / swipe screen'],
      ['Sleep or wake phone', 'White power button']
    ].forEach(function (r) {
      row(body, r[0], r[1]);
    });
    body.appendChild(el('p', 'field-status', 'Unofficial fan project · No real hardware access.'));
  }
  function field(label, control) {
    var f = el('label', 'field');
    f.appendChild(el('span', '', label));
    f.appendChild(control);
    return f;
  }
  function option(s, val, label) {
    var o = el('option', '', label);
    o.value = val;
    s.appendChild(o);
  }
  function models() {
    dialog('Model library');
    body.appendChild(
      el(
        'p',
        '',
        'Switch the geometry on the desk. The live screens and device link stay in place.'
      )
    );
    ['flipper', 'phone'].forEach(function (type) {
      var sel = el('select');
      sel.id = 'model-' + type;
      FZ.models.list(type).forEach(function (m) {
        option(sel, m.id, m.label);
      });
      sel.value = FZ.scene.device(type).id;
      body.appendChild(
        field(type === 'flipper' ? '01 / Flipper Zero' : '02 / Companion phone', sel)
      );
      sel.onchange = function () {
        var built = FZ.models.build(sel.value);
        FZ.scene.setDevice(type, built);
        FZ.storage.set('model.' + type, sel.value);
        $('phone-kind').textContent =
          FZ.scene.device('phone').id === 'phone.compact'
            ? 'Compact · Procedural'
            : 'Generic · Procedural';
        FZ.note('Loaded ' + sel.options[sel.selectedIndex].text);
        if (cal) calibration();
      };
    });
    row(body, 'Official body', '43,386 original facets');
    row(body, 'Production revision', 'F7B9C6 · GPL-3.0');
  }
  function debug() {
    dialog('Link debug');
    debugOpen = true;
    body.appendChild(
      el('p', '', 'Inspect the in-page RPC bus. Packet loss affects only simulated messages.')
    );
    var state = row(body, 'Channel', ''),
      signal = row(body, 'Signal', ''),
      counts = row(body, 'Packets', ''),
      rtt = row(body, 'Last round trip', '');
    var sel = el('select');
    sel.id = 'dbg-loss';
    [0, 0.1, 0.3].forEach(function (p) {
      option(sel, p, Math.round(p * 100) + '% packet loss');
    });
    sel.value = FZ.link.get().loss;
    sel.onchange = function () {
      FZ.link.setLoss(+sel.value);
    };
    body.appendChild(field('Loss simulation', sel));
    var log = el('pre', 'debug-log');
    body.appendChild(log);
    function refresh() {
      var s = FZ.link.get();
      state.textContent = s.connected ? 'Connected · 30–120 ms' : 'Disconnected · 30–120 ms';
      signal.textContent = s.connected
        ? s.signal + ' / 4 bars · ' + Math.round(FZ.scene.info().signalDistance) + ' mm'
        : '—';
      counts.textContent = s.sent + ' sent · ' + s.dropped + ' dropped';
      rtt.textContent = s.rtt ? s.rtt + ' ms' : '—';
      var str = FZ.link.getLog().slice(-50).join('\n') || 'Bus ready. No messages yet.';
      if (str !== log.textContent) {
        log.textContent = str;
        log.scrollTop = log.scrollHeight;
      }
    }
    var actions = el('div', 'dialog-end'),
      test = btn(
        'Run self-test',
        async function () {
          test.disabled = true;
          var report;
          try {
            report = await FZ.selfTest();
            notify('Self-test: ' + report.pass + ' passed, ' + report.fail + ' failed');
          } catch (e) {
            notify(e.message);
          }
          test.disabled = false;
        },
        'outline'
      );
    actions.appendChild(
      btn(
        'Ping device',
        async function () {
          var t = Date.now();
          try {
            await FZ.link.rpc('system.ping', { t: t });
            FZ.link.noteRtt(Date.now() - t);
            refresh();
          } catch (e) {
            notify('Ping: ' + e.message);
          }
        },
        'primary',
        'dbg-ping'
      )
    );
    actions.appendChild(test);
    body.appendChild(actions);
    refresh();
    dialogTimer = setInterval(refresh, 320);
  }
  FZ.backup = {
    export: function () {
      return {
        format: 'flipper-lab',
        version: 1,
        device: FZ.os.settings,
        sd: FZ.fs.snapshot(),
        sound: FZ.audio.enabled,
        volume: FZ.audio.getVolume()
      };
    },
    validate: function (v) {
      if (
        !v ||
        v.format !== 'flipper-lab' ||
        v.version !== 1 ||
        !v.device ||
        typeof v.device.name !== 'string' ||
        typeof v.sound !== 'boolean' ||
        !Number.isFinite(v.volume) ||
        v.volume < 0 ||
        v.volume > 1
      )
        throw Error('Not a version 1 Flipper Lab backup');
      FZ.fs.validate(v.sd);
      return v;
    },
    import: function (v) {
      this.validate(v);
      FZ.os.cancelUpdate();
      FZ.fs.restore(v.sd);
      FZ.os.restore(v.device);
      FZ.audio.setVolume(v.volume);
      FZ.audio.setEnabled(v.sound);
      FZ.emit('sound');
      FZ.note('Restored local backup');
    }
  };
  function storage() {
    dialog('Session storage');
    body.appendChild(
      el(
        'p',
        '',
        FZ.storage.persistent
          ? 'Your virtual SD card and device preferences are saved in this browser.'
          : 'Browser storage is unavailable. Export a backup before closing this session.'
      )
    );
    row(
      body,
      'Virtual card',
      FZ.fs.stats().files + ' files · ' + (FZ.fs.usedBytes() / 1024).toFixed(1) + ' KB'
    );
    body.appendChild(
      btn(
        'Export JSON backup',
        function () {
          var blob = new Blob([JSON.stringify(FZ.backup.export(), null, 2)], {
              type: 'application/json'
            }),
            url = URL.createObjectURL(blob),
            a = el('a');
          a.href = url;
          a.download = 'flipper-lab-backup.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 1500);
          FZ.note('Exported virtual SD backup');
        },
        'file-action',
        'btn-export',
        'download'
      )
    );
    var input = el('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.id = 'import-file';
    body.appendChild(input);
    body.appendChild(
      btn(
        'Import JSON backup',
        function () {
          input.click();
        },
        'file-action',
        'btn-import',
        'upload'
      )
    );
    input.onchange = async function () {
      var f = input.files[0];
      if (!f) return;
      try {
        if (f.size > 5000000) throw Error('Backup is too large');
        var v = FZ.backup.validate(JSON.parse(await f.text()));
        confirmAction(
          'Restore this backup?',
          'Replace the current virtual SD card and device settings with the contents of ' +
            f.name +
            '.',
          'Restore backup',
          function () {
            FZ.backup.import(v);
            close();
            notify('Backup restored');
          }
        );
      } catch (e) {
        notify('Import rejected: ' + e.message);
        input.value = '';
      }
    };
    body.appendChild(
      btn(
        'Reset storage',
        function () {
          confirmAction(
            'Reset the workbench?',
            'This removes saved captures, pairing state, calibration and preferences on this page. The demo card will be restored.',
            'Reset storage',
            function () {
              FZ.storage.reset();
              window.location.reload();
            }
          );
        },
        'file-action danger',
        'btn-reset',
        'trash'
      )
    );
    FZ.icons(body);
  }
  function confirmAction(title, description, label, fn) {
    dialog(title);
    body.appendChild(el('p', '', description));
    var actions = el('div', 'dialog-end');
    actions.appendChild(btn('Cancel', storage));
    actions.appendChild(btn(label, fn, 'primary', 'confirm-action'));
    body.appendChild(actions);
  }
  function sound() {
    var on = FZ.audio.enabled,
      b = $('btn-sound');
    b.querySelector('span').textContent = on ? 'Sound on' : 'Sound off';
    b.querySelector('i').dataset.icon = on ? 'sound' : 'mute';
    FZ.icons(b);
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'Mute sound' : 'Enable sound');
    b.title = on ? 'Sound on' : 'Sound off';
  }
  function setLayout(type) {
    FZ.scene.setLayout(type);
    document.querySelectorAll('[data-layout]').forEach(function (b) {
      var on = b.dataset.layout === type;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    document.querySelectorAll('[data-focus]').forEach(function (b) {
      b.classList.toggle('current', b.dataset.focus === type);
    });
    drawer(false);
  }
  function drawer(on) {
    $('inspector').classList.toggle('open', !!on);
    $('drawer-shade').hidden = !on;
    $('btn-inspector').setAttribute('aria-expanded', !!on);
  }
  function expand() {
    var b = $('btn-expand'),
      on = $('viewport-card').classList.toggle('expanded');
    b.querySelector('i').dataset.icon = on ? 'shrink' : 'expand';
    b.setAttribute('aria-label', on ? 'Restore viewport' : 'Expand viewport');
    b.setAttribute('aria-pressed', on);
    b.title = b.getAttribute('aria-label');
    FZ.icons(b);
  }
  function inspector() {
    var p = FZ.phone,
      st = FZ.link.get(),
      s = p.state,
      link = st.connected,
      working = !link && ['devices', 'scanning', 'pin'].indexOf(s) >= 0;
    $('mobile-link').querySelector('span').textContent = link
      ? 'Device link · Connected'
      : 'Device link';
    var mode = link ? 'active' : working ? 'working' : '';
    var label = link
      ? 'Connected'
      : s === 'scanning'
        ? 'Scanning'
        : s === 'devices'
          ? 'Discovered'
          : s === 'pin'
            ? 'Pairing'
            : 'Idle';
    var pill = $('link-pill');
    pill.className = 'state-pill ' + mode;
    pill.innerHTML = '<b class="dot"></b>';
    pill.appendChild(document.createTextNode(label));
    $('link-map').className = 'link-map ' + mode;
    $('hardware-flipper').textContent = st.connected && p.info ? p.info.name : 'Flipper Zero';
    var desc = link
      ? st.signal + ' / 4 signal bars · ' + (p.info ? p.info.firmware : 'Reading device info…')
      : s === 'pin'
        ? 'Pairing PIN: ' + p.pin + ' · Match both screens.'
        : s === 'devices'
          ? 'A virtual Flipper is available. Select it to see the pairing code.'
          : s === 'scanning'
            ? 'Searching for devices on the local desk…'
            : 'Connect the devices over a simulated Bluetooth link.';
    $('pair-description').textContent = desc;
    var a = $('pair-action');
    a.querySelector('span').textContent = link
      ? 'Find my Flipper'
      : s === 'pin'
        ? 'Confirm PIN'
        : s === 'devices'
          ? 'Select ' + (p.devices[0] ? p.devices[0].name : 'device')
          : s === 'scanning'
            ? 'Scanning…'
            : 'Pair devices';
    a.querySelector('i').dataset.icon = link ? 'pin' : 'bluetooth';
    FZ.icons(a);
    a.disabled = actionBusy || s === 'scanning' || (s === 'devices' && !p.devices.length);
    var sec = $('link-secondary');
    sec.hidden = !link && !working;
    sec.textContent = link ? 'Disconnect devices' : 'Cancel pairing';
  }
  FZ.input = {
    key: function (k) {
      FZ.audio.unlock();
      FZ.scene.flashPart('flipper', k);
      FZ.audio.click();
      FZ.os.onKey(k);
      FZ.scene.markDirty();
    },
    phoneButton: function (n) {
      FZ.scene.flashPart('phone', n);
      FZ.audio.click();
      FZ.phone.onSide(n);
      FZ.scene.markDirty();
    },
    fromPart: function (type, n) {
      if (type === 'flipper') this.key(n.replace(/^dpad_/, ''));
      else this.phoneButton(n);
    }
  };
  function wire() {
    $('btn-models').onclick = models;
    $('btn-help').onclick = $('guide-help').onclick = help;
    $('btn-storage').onclick = storage;
    $('btn-debug').onclick = debug;
    $('modal-close').onclick = close;
    modal.onclick = function (e) {
      if (e.target === modal) close();
    };
    $('btn-sound').onclick = function () {
      FZ.audio.setEnabled(!FZ.audio.enabled);
      FZ.emit('sound');
    };
    FZ.events.addEventListener('sound', function () {
      sound();
      FZ.os.dirty();
    });
    sound();
    $('mobile-link').onclick = $('btn-inspector').onclick = function () {
      drawer(true);
    };
    $('close-inspector').onclick = $('drawer-shade').onclick = function () {
      drawer(false);
    };
    $('btn-expand').onclick = expand;
    $('btn-view-reset').onclick = function () {
      FZ.scene.resetView();
    };
    $('zoom-out').onclick = function () {
      FZ.scene.zoom(1.16);
    };
    $('zoom-in').onclick = function () {
      FZ.scene.zoom(1 / 1.16);
    };
    document.querySelectorAll('[data-layout],[data-focus]').forEach(function (b) {
      b.onclick = function () {
        setLayout(b.dataset.layout || b.dataset.focus);
      };
    });
    $('pair-action').onclick = async function () {
      if (actionBusy) return;
      actionBusy = true;
      inspector();
      try {
        var p = FZ.phone;
        if (FZ.link.get().connected) await p.findFlipper();
        else if (p.state === 'pin') await p.confirmPair();
        else if (p.state === 'devices') await p.pairWith(p.devices[0]);
        else await p.scan();
      } catch (e) {
        notify(e.message);
      } finally {
        actionBusy = false;
        inspector();
      }
    };
    $('link-secondary').onclick = function () {
      if (FZ.link.get().connected) FZ.phone.disconnect();
      else FZ.phone.cancelPair();
    };
    FZ.events.addEventListener('activity', function (e) {
      activity(e.detail);
    });
    FZ.events.addEventListener('phone', inspector);
    FZ.link.subscribe(inspector);
    document.addEventListener(
      'pointerdown',
      function () {
        FZ.audio.unlock();
        FZ.scene.interact();
      },
      { once: true }
    );
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b && e.detail && modal.hidden && !(cal && cal.contains(b))) b.blur();
    });
    window.addEventListener('keydown', function (e) {
      if (!modal.hidden) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        } else if (e.key === 'Tab') {
          var all = Array.from(
            modal.querySelectorAll('button:not(:disabled),select,input:not([hidden]),textarea')
          ).filter(function (n) {
            return n.offsetParent;
          });
          if (e.shiftKey && document.activeElement === all[0]) {
            e.preventDefault();
            all[all.length - 1].focus();
          } else if (!e.shiftKey && document.activeElement === all[all.length - 1]) {
            e.preventDefault();
            all[0].focus();
          }
        }
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))
        return;
      if (e.key === 'Escape' && $('inspector').classList.contains('open')) {
        drawer(false);
        return;
      }
      if (e.key === 'Escape' && $('viewport-card').classList.contains('expanded')) {
        expand();
        return;
      }
      if (e.key === 'Enter' && e.target.closest('button')) return;
      FZ.scene.interact();
      if (FZ.os.type(e.key) || FZ.phone.type(e.key)) {
        e.preventDefault();
        return;
      }
      var k = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        Enter: 'ok',
        Escape: 'back'
      }[e.key];
      if (k) {
        e.preventDefault();
        FZ.input.key(k);
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760 && window.innerHeight > 590) drawer(false);
    });
  }
  function calibration() {
    if (cal) cal.remove();
    var b = FZ.scene.device('flipper'),
      m = b.manifest;
    cal = el('section', 'calibration');
    cal.setAttribute('aria-label', 'Model calibration');
    document.body.appendChild(cal);
    var head = el('div', 'card-head');
    head.appendChild(el('h2', '', 'Model calibration'));
    var collapse = btn(
      'Hide',
      function () {
        var hide = !form.hidden;
        form.hidden = hide;
        collapse.textContent = hide ? 'Show' : 'Hide';
      },
      'text-button'
    );
    head.appendChild(collapse);
    cal.appendChild(head);
    var form = el('div');
    cal.appendChild(form);
    var sel = el('select');
    option(sel, 'screen', 'Display window');
    Object.keys(m.buttons).forEach(function (k) {
      option(sel, k, k.replace('dpad_', 'D-pad ').toUpperCase());
    });
    form.appendChild(field('Adjustment target', sel));
    var controls = el('div');
    form.appendChild(controls);
    function save() {
      b.apply();
      FZ.manifest.save('flipper-official', m);
      FZ.scene.markDirty();
    }
    function slider(label, obj, key, min, max, step) {
      var l = el('label', 'slider'),
        input = el('input'),
        out = el('output');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = obj[key];
      out.textContent = Number(obj[key]).toFixed(2);
      input.oninput = function () {
        obj[key] = +input.value;
        out.textContent = (+input.value).toFixed(2);
        save();
      };
      l.appendChild(el('span', '', label));
      l.appendChild(input);
      l.appendChild(out);
      controls.appendChild(l);
    }
    function sliders() {
      controls.textContent = '';
      var s = sel.value === 'screen',
        v = s ? m.screen : m.buttons[sel.value];
      controls.appendChild(el('h3', '', 'Position · mm'));
      ['X', 'Y', 'Z'].forEach(function (n, i) {
        slider(n, v.position, i, -60, 60, 0.01);
      });
      if (s) {
        controls.appendChild(el('h3', '', 'LCD dimensions · mm'));
        slider('Width', v.size, 0, 1, 70, 0.01);
        slider('Height', v.size, 1, 1, 40, 0.01);
        controls.appendChild(el('h3', '', 'Rotation · radians'));
        ['X', 'Y', 'Z'].forEach(function (n, i) {
          slider(n, v.rotation, i, -3.142, 3.142, 0.001);
        });
      } else {
        controls.appendChild(el('h3', '', 'Press direction'));
        ['X', 'Y', 'Z'].forEach(function (n, i) {
          slider(n, v.axis, i, -1, 1, 0.01);
        });
        slider('Travel', v, 'travel', 0, 1.4, 0.01);
      }
    }
    sel.onchange = sliders;
    sliders();
    var pattern = el('label', 'line'),
      check = el('input');
    check.type = 'checkbox';
    check.id = 'lcd-pattern';
    check.checked = !!FZ.os.testPattern;
    check.onchange = function () {
      FZ.os.testPattern = check.checked;
      FZ.os.dirty();
    };
    pattern.appendChild(check);
    pattern.appendChild(document.createTextNode(' LCD alignment pattern'));
    form.appendChild(pattern);
    var actions = el('div', 'dialog-end');
    actions.appendChild(
      btn(
        'Copy manifest',
        async function () {
          var text = JSON.stringify(m, null, 2);
          try {
            await navigator.clipboard.writeText(text);
            notify('Manifest copied');
          } catch (e) {
            dialog('Copy manifest');
            var a = el('textarea', 'copy-area');
            a.value = text;
            body.appendChild(a);
            a.select();
            notify('Select and copy the manifest text');
          }
        },
        'outline'
      )
    );
    actions.appendChild(
      btn(
        'Factory values',
        function () {
          var orig = JSON.parse(JSON.stringify(FZ.meshes['flipper-official'].manifest));
          Object.assign(m, orig);
          save();
          sliders();
        },
        'outline'
      )
    );
    form.appendChild(actions);
  }
  function boot() {
    FZ.icons();
    if (!FZ.flags.hasThree) {
      FZ.missing(
        'Three.js is missing',
        'Restore the bundled vendor directory from the repository.'
      );
      return;
    }
    var flipper = new FZ.Screen({ logicalW: 128, logicalH: 64, scale: 2, nearest: true }),
      phone = new FZ.Screen({ logicalW: 360, logicalH: 760, scale: 1.5 });
    try {
      FZ.scene.init({
        canvas: $('gl'),
        flipper: { built: FZ.models.build(FZ.models.defaultId('flipper')), screen: flipper },
        phone: { built: FZ.models.build(FZ.models.defaultId('phone')), screen: phone }
      });
    } catch (e) {
      FZ.missing(
        'WebGL unavailable',
        'This workbench needs WebGL. Enable hardware acceleration or open it in a WebGL-capable browser.\n\n' +
          e.message
      );
      return;
    }
    wire();
    FZ.note('Official geometry loaded');
    FZ.os.init(flipper);
    FZ.note('Virtual SD mounted');
    FZ.phone.init(phone);
    FZ.note('Workbench ready');
    var layout = FZ.storage.get('layout', 'both');
    setLayout(['both', 'flipper', 'phone'].includes(layout) ? layout : 'both');
    inspector();
    if (FZ.flags.calibrate) calibration();
    if (!FZ.storage.persistent) notify('Session-only storage · use JSON export to keep files');
  }
  FZ.boot = boot;
  boot();
})(window.FZ);
